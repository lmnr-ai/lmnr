use async_trait::async_trait;
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};
use uuid::Uuid;

use crate::{
    cache::Cache,
    ch::signal_run_messages::insert_signal_run_messages,
    db::spans::SpanType,
    features::{Feature, is_feature_enabled},
    utils::limits::update_workspace_signal_runs_used,
};
use crate::{
    ch::signal_events::{CHSignalEvent, insert_signal_events},
    ch::signal_run_messages::{CHSignalRunMessage, delete_signal_run_messages},
    ch::signal_runs::{CHSignalRun, insert_signal_runs},
    db::DB,
    mq::MessageQueue,
    signals::SignalRun,
    signals::{
        SignalWorkerConfig, llm_model, llm_provider,
        postprocess::process_event_notifications_and_clustering,
        prompts::MALFORMED_FUNCTION_CALL_RETRY_GUIDANCE,
        provider::{
            LanguageModelClient, ProviderClient,
            models::{
                ProviderBatchOutput, ProviderContent as Content,
                ProviderFinishReason as FinishReason, ProviderFunctionCall as FunctionCall,
                ProviderFunctionResponse as FunctionResponse, ProviderInlineResponse,
                ProviderPart as Part,
            },
        },
        push_to_signals_queue,
        queue::{SignalJobPendingBatchMessage, SignalMessage, push_to_waiting_queue},
        spans::{get_trace_span_ids_and_end_time, span_short_id},
        tools::get_full_spans,
        utils::{
            InternalSpan, emit_internal_span, nanoseconds_to_datetime, replace_span_tags_with_links,
        },
    },
    worker::{HandlerError, MessageHandler},
};

const DEFAULT_RETRY_COUNT: u32 = 4;

pub struct FailureMetadata {
    pub finish_reason: Option<FinishReason>,
    pub is_processing_error: bool,
}

#[derive(Debug, Serialize)]
enum NextStepReason {
    ToolResult(serde_json::Value),
    MalformedFunctionCallRetry,
}

#[derive(Debug, Serialize)]
enum StepResult {
    CompletedNoEvent,
    CompletedWithEvent {
        attributes: serde_json::Value,
        summary: String,
    },
    RequiresNextStep {
        reason: NextStepReason,
    },
    Failed {
        error: String,
        finish_reason: Option<FinishReason>,
        is_processing_error: bool,
    },
}

pub struct SignalJobPendingBatchHandler {
    pub db: Arc<DB>,
    pub cache: Arc<crate::cache::Cache>,
    pub queue: Arc<MessageQueue>,
    pub clickhouse: clickhouse::Client,
    pub llm_client: Arc<ProviderClient>,
    pub config: Arc<SignalWorkerConfig>,
}

impl SignalJobPendingBatchHandler {
    pub fn new(
        db: Arc<DB>,
        cache: Arc<crate::cache::Cache>,
        queue: Arc<MessageQueue>,
        clickhouse: clickhouse::Client,
        llm_client: Arc<ProviderClient>,
        config: Arc<SignalWorkerConfig>,
    ) -> Self {
        Self {
            db,
            cache,
            queue,
            clickhouse,
            llm_client,
            config,
        }
    }
}

#[async_trait]
impl MessageHandler for SignalJobPendingBatchHandler {
    type Message = SignalJobPendingBatchMessage;

    async fn handle(&self, message: Self::Message) -> Result<(), HandlerError> {
        process(
            message,
            self.db.clone(),
            self.clickhouse.clone(),
            self.queue.clone(),
            self.llm_client.clone(),
            self.config.clone(),
            self.cache.clone(),
        )
        .await
    }
}

async fn process(
    message: SignalJobPendingBatchMessage,
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    queue: Arc<MessageQueue>,
    llm_client: Arc<ProviderClient>,
    config: Arc<SignalWorkerConfig>,
    cache: Arc<crate::cache::Cache>,
) -> Result<(), HandlerError> {
    log::debug!(
        "[SIGNAL JOB] Processing batch. batch_id: {}, messages: {}",
        message.batch_id,
        message.messages.len()
    );

    let result = match llm_client.get_batch(&message.batch_id.to_string()).await {
        Ok(result) => result,
        Err(e) => {
            if e.is_retryable() {
                return Err(HandlerError::transient(e));
            }

            log::error!(
                "[SIGNAL JOB] Permanent error getting batch {}: {:?}",
                message.batch_id,
                e
            );
            process_failed_batch(
                &message,
                false,
                db,
                clickhouse,
                queue,
                Some(format!("Failed to get batch response: {}", e)),
            )
            .await?;
            return Ok(());
        }
    };

    log::debug!(
        "[SIGNAL JOB] Batch {} done: {}",
        message.batch_id,
        result.done
    );

    if result.done {
        if let Some(error) = result.error {
            process_failed_batch(
                &message,
                true,
                db,
                clickhouse,
                queue,
                Some(format!("Batch failed: {}", error.message)),
            )
            .await?;
        } else {
            process_succeeded_batch(
                &message,
                result.response,
                db,
                queue,
                clickhouse,
                config,
                cache,
            )
            .await?;
        }
    } else {
        process_pending_batch(&message, queue, config.clone()).await?;
    }

    Ok(())
}

pub async fn retry_or_fail_runs(
    failed_runs: Vec<SignalRun>,
    run_to_message: &HashMap<Uuid, SignalMessage>,
    failure_metadata: &HashMap<Uuid, FailureMetadata>,
    queue: Arc<MessageQueue>,
) -> (Vec<SignalRun>, i32) {
    let mut permanently_failed_runs = Vec::new();
    let mut retried_count = 0;
    let max_retry_count = crate::utils::get_unsigned_env_with_default(
        "SIGNALS_MAX_RETRY_COUNT",
        DEFAULT_RETRY_COUNT as usize,
    );

    for run in failed_runs {
        let signal_message = run_to_message.get(&run.run_id);
        let metadata = failure_metadata.get(&run.run_id);

        let retryable = if let Some(meta) = metadata {
            // Processing errors are always retryable regardless of finish reason
            if meta.is_processing_error {
                true
            } else {
                meta.finish_reason
                    .as_ref()
                    .map(|fr| fr.is_retryable())
                    .unwrap_or(true)
            }
        } else {
            true
        };

        if let Some(msg) = signal_message {
            if retryable && msg.retry_count < max_retry_count {
                let mut retry_msg = msg.clone();
                retry_msg.retry_count += 1;
                retry_msg.step = run.step;

                log::info!(
                    "[SIGNAL JOB] Retrying run {} (retry {}/{})",
                    run.run_id,
                    retry_msg.retry_count,
                    max_retry_count
                );

                if let Err(e) = push_to_signals_queue(retry_msg, queue.clone()).await {
                    log::error!(
                        "[SIGNAL JOB] Failed to enqueue retry for run {}: {:?}",
                        run.run_id,
                        e
                    );
                    permanently_failed_runs.push(run);
                } else {
                    retried_count += 1;
                }
            } else {
                permanently_failed_runs.push(run);
            }
        } else {
            permanently_failed_runs.push(run);
        }
    }

    (permanently_failed_runs, retried_count)
}

async fn process_failed_batch(
    message: &SignalJobPendingBatchMessage,
    retryable: bool,
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    queue: Arc<MessageQueue>,
    custom_error: Option<String>,
) -> Result<(), HandlerError> {
    let error_message = custom_error.unwrap_or_else(|| "Batch failed".to_string());

    let run_to_message: HashMap<Uuid, SignalMessage> = message
        .messages
        .iter()
        .map(|msg| (msg.run_id, msg.clone()))
        .collect();

    let failed_runs: Vec<SignalRun> = message
        .messages
        .iter()
        .map(|msg| SignalRun::from_message(msg, msg.signal.id).failed(&error_message))
        .collect();

    let (permanently_failed_runs, _retried_count) = if retryable {
        let failure_metadata = HashMap::new();
        retry_or_fail_runs(failed_runs, &run_to_message, &failure_metadata, queue).await
    } else {
        log::warn!(
            "[SIGNAL JOB] Batch failure should not be retried, marking all {} runs as permanently failed",
            failed_runs.len()
        );
        let permanently_failed = failed_runs
            .into_iter()
            .map(|mut run| {
                run.error_message = Some(format!(
                    "{} (non-retryable)",
                    run.error_message.as_deref().unwrap_or("unknown error")
                ));
                run
            })
            .collect();
        (permanently_failed, 0)
    };

    if !permanently_failed_runs.is_empty() {
        let failed_runs_ch: Vec<CHSignalRun> = permanently_failed_runs
            .iter()
            .map(CHSignalRun::from)
            .collect();
        if let Err(e) = insert_signal_runs(clickhouse.clone(), &failed_runs_ch).await {
            log::error!("[SIGNAL JOB] Failed to insert failed runs: {:?}", e);
        }

        let project_run_pairs: Vec<(Uuid, Uuid)> = permanently_failed_runs
            .iter()
            .map(|run| (run.project_id, run.run_id))
            .collect();

        if let Err(e) = delete_signal_run_messages(clickhouse.clone(), &project_run_pairs).await {
            log::error!(
                "[SIGNAL JOB] Failed to delete messages for failed runs: {:?}",
                e
            );
        }

        let mut failed_by_job: HashMap<Uuid, i32> = HashMap::new();
        for run in &permanently_failed_runs {
            if let Some(job_id) = run.job_id {
                *failed_by_job.entry(job_id).or_insert(0) += 1;
            }
        }
        for (job_id, failed_count) in failed_by_job {
            if let Err(e) =
                crate::db::signal_jobs::update_signal_job_stats(&db.pool, job_id, 0, failed_count)
                    .await
            {
                log::error!("Failed to update job statistics for job {}: {}", job_id, e);
            }
        }
    }

    Ok(())
}

async fn process_pending_batch(
    message: &SignalJobPendingBatchMessage,
    queue: Arc<MessageQueue>,
    config: Arc<SignalWorkerConfig>,
) -> Result<(), HandlerError> {
    push_to_waiting_queue(queue, message, Some(config.waiting_queue_ttl_ms))
        .await
        .map_err(|e| HandlerError::transient(e))
}

pub async fn process_succeeded_batch(
    message: &SignalJobPendingBatchMessage,
    batch_output: Option<ProviderBatchOutput>,
    db: Arc<DB>,
    queue: Arc<MessageQueue>,
    clickhouse: clickhouse::Client,
    config: Arc<SignalWorkerConfig>,
    cache: Arc<Cache>,
) -> Result<(), HandlerError> {
    let response = batch_output.ok_or(HandlerError::permanent(anyhow::anyhow!(
        "Batch succeeded but response is missing for batch_id: {}",
        message.batch_id
    )))?;

    let inlined_responses = &response.responses;
    let mut new_messages = Vec::new();

    let mut run_to_message: HashMap<Uuid, SignalMessage> = HashMap::new();
    for msg in message.messages.iter() {
        run_to_message.insert(msg.run_id, msg.clone());
    }

    let mut succeeded_runs: Vec<SignalRun> = Vec::new();
    let mut failed_runs: Vec<SignalRun> = Vec::new();
    let mut pending_run_ids: HashSet<Uuid> = HashSet::new();
    let mut failure_metadata: HashMap<Uuid, FailureMetadata> = HashMap::new();

    for inline_response in inlined_responses.iter() {
        let run_id = inline_response
            .metadata
            .as_ref()
            .and_then(|m| m.get("run_id"))
            .and_then(|v| v.as_str())
            .and_then(|s| uuid::Uuid::parse_str(s).ok());
        let trace_id = inline_response
            .metadata
            .as_ref()
            .and_then(|m| m.get("trace_id"))
            .and_then(|v| v.as_str())
            .and_then(|s| uuid::Uuid::parse_str(s).ok());

        let run_id = match run_id {
            Some(id) => id,
            None => {
                log::warn!(
                    "Response missing run_id in metadata, skipping response. Batch ID: {}",
                    message.batch_id
                );
                continue;
            }
        };

        let signal_message = match run_to_message.get(&run_id) {
            Some(msg) => msg,
            None => {
                failed_runs.push(
                    SignalRun::nil_with_id(run_id, trace_id.unwrap_or_default())
                        .failed("No message found for run_id"),
                );
                log::error!("No message found for run_id {}, skipping", run_id);
                continue;
            }
        };

        let run = SignalRun::from_message(signal_message, signal_message.signal.id);

        let (step_result, new_run_messages) = process_single_response(
            inline_response,
            signal_message,
            &run,
            clickhouse.clone(),
            queue.clone(),
            config.clone(),
            message.batch_id.clone(),
        )
        .await;

        new_messages.extend(new_run_messages);

        match step_result {
            StepResult::CompletedNoEvent => {
                succeeded_runs.push(run.completed());
            }
            StepResult::CompletedWithEvent {
                attributes,
                summary,
            } => {
                match handle_create_event(
                    signal_message,
                    &run,
                    attributes,
                    summary,
                    clickhouse.clone(),
                    db.clone(),
                    queue.clone(),
                    run.internal_span_id,
                    config.internal_project_id,
                )
                .await
                {
                    Ok(event_id) => {
                        succeeded_runs.push(run.completed_with_event(event_id));
                    }
                    Err(e) => {
                        log::error!("[SIGNAL JOB] Failed to create event: {:?}", e);
                        failed_runs.push(run.failed(format!("Failed to create event: {}", e)));
                    }
                }
            }
            StepResult::RequiresNextStep { .. } => {
                pending_run_ids.insert(run.run_id);
            }
            StepResult::Failed {
                error,
                finish_reason,
                is_processing_error,
            } => {
                failure_metadata.insert(
                    run.run_id,
                    FailureMetadata {
                        finish_reason,
                        is_processing_error,
                    },
                );
                failed_runs.push(run.failed(error));
            }
        }
    }

    // Insert new messages into ClickHouse
    insert_signal_run_messages(clickhouse.clone(), &new_messages).await?;

    // Insert succeeded runs into ClickHouse
    let succeeded_runs_ch: Vec<CHSignalRun> = succeeded_runs
        .iter()
        .map(|r| CHSignalRun::from(r))
        .collect();
    insert_signal_runs(clickhouse.clone(), &succeeded_runs_ch).await?;
    if is_feature_enabled(Feature::UsageLimit) {
        let mut runs_by_project_id: HashMap<Uuid, usize> = HashMap::new();
        for run in &succeeded_runs {
            *runs_by_project_id.entry(run.project_id).or_insert(0) += 1;
        }
        let update_futures = runs_by_project_id.into_iter().map(|(project_id, runs)| {
            let db = db.clone();
            let clickhouse = clickhouse.clone();
            let cache = cache.clone();
            async move {
                if let Err(e) =
                    update_workspace_signal_runs_used(db, clickhouse, cache, project_id, runs).await
                {
                    log::error!("Failed to update workspace signal runs used: {}", e);
                }
            }
        });
        futures_util::future::join_all(update_futures).await;
    }

    // Push pending runs back to signals queue for next step processing
    // If enqueue fails, add them to failed_runs so they're handled consistently
    if !pending_run_ids.is_empty() {
        for run_id in &pending_run_ids {
            let msg = run_to_message.get(run_id).unwrap();

            // Create next step message with incremented step
            let mut next_step_msg = msg.clone();
            next_step_msg.step += 1;

            if let Err(e) = push_to_signals_queue(next_step_msg, queue.clone()).await {
                log::error!(
                    "[SIGNAL JOB] Failed to push pending run {} to signals queue: {:?}",
                    run_id,
                    e
                );
                // Mark as failed so status is updated, messages are cleaned up, and job stats are updated
                let run = SignalRun::from_message(msg, msg.signal.id).next_step(); // Build with incremented step
                failed_runs.push(run.failed(format!("Failed to enqueue for next step: {}", e)));
            }
        }
    }

    let (permanently_failed_runs, retried_count) =
        retry_or_fail_runs(failed_runs, &run_to_message, &failure_metadata, queue).await;

    let final_runs_to_insert = [succeeded_runs, permanently_failed_runs].concat();
    if !final_runs_to_insert.is_empty() {
        let ch_runs: Vec<CHSignalRun> =
            final_runs_to_insert.iter().map(CHSignalRun::from).collect();
        if let Err(e) = insert_signal_runs(clickhouse.clone(), &ch_runs).await {
            log::error!("[SIGNAL JOB] Failed to insert final runs: {:?}", e);
        }

        let project_run_pairs: Vec<(Uuid, Uuid)> = final_runs_to_insert
            .iter()
            .map(|run| (run.project_id, run.run_id))
            .collect();
        if let Err(e) = delete_signal_run_messages(clickhouse.clone(), &project_run_pairs).await {
            log::error!(
                "[SIGNAL JOB] Failed to delete messages for final runs: {:?}",
                e
            );
        }
    }

    let mut succeeded_by_job: HashMap<Uuid, i32> = HashMap::new();
    for run in &final_runs_to_insert {
        if let Some(job_id) = run.job_id {
            if run.status == crate::signals::RunStatus::Completed {
                *succeeded_by_job.entry(job_id).or_insert(0) += 1;
            }
        }
    }
    for (job_id, count) in succeeded_by_job {
        if let Err(e) =
            crate::db::signal_jobs::update_signal_job_stats(&db.pool, job_id, count, 0).await
        {
            log::error!("Failed to update job stats: {}", e);
        }
    }

    let mut failed_by_job: HashMap<Uuid, i32> = HashMap::new();
    for run in &final_runs_to_insert {
        if let Some(job_id) = run.job_id {
            if run.status == crate::signals::RunStatus::Failed {
                *failed_by_job.entry(job_id).or_insert(0) += 1;
            }
        }
    }
    for (job_id, count) in failed_by_job {
        if let Err(e) =
            crate::db::signal_jobs::update_signal_job_stats(&db.pool, job_id, 0, count).await
        {
            log::error!("Failed to update job stats: {}", e);
        }
    }

    log::debug!(
        "[SIGNAL JOB] Batch processing complete. Succeeded: {}, Retried: {}, Permanently Failed: {}",
        final_runs_to_insert
            .iter()
            .filter(|r| r.status == crate::signals::RunStatus::Completed)
            .count(),
        retried_count,
        final_runs_to_insert
            .iter()
            .filter(|r| r.status == crate::signals::RunStatus::Failed)
            .count()
    );

    Ok(())
}

async fn process_single_response(
    provider_response: &ProviderInlineResponse,
    signal_message: &SignalMessage,
    run: &SignalRun,
    clickhouse: clickhouse::Client,
    queue: Arc<MessageQueue>,
    config: Arc<SignalWorkerConfig>,
    provider_batch_id: String,
) -> (StepResult, Vec<CHSignalRunMessage>) {
    let mut new_messages: Vec<CHSignalRunMessage> = Vec::new();

    let mut finish_reason = None;
    let mut function_call = None;
    let mut text_response = None;
    let mut content_val = None;
    let mut usage = None;
    let mut model_version = None;

    if let Some(resp) = &provider_response.response {
        usage = resp.usage_metadata.clone();
        model_version = resp.model_version.clone();
        if let Some(cands) = &resp.candidates {
            if let Some(cand) = cands.first() {
                finish_reason = cand.finish_reason.clone();
                if let Some(content) = &cand.content {
                    content_val = Some(serde_json::to_value(content).unwrap_or_default());
                    if let Some(parts) = &content.parts {
                        for part in parts {
                            if let Some(fc) = &part.function_call {
                                function_call = Some(fc.clone());
                            } else if let Some(t) = &part.text {
                                text_response = Some(t.clone());
                            }
                        }
                    }
                }
            }
        }
    }

    let has_error = provider_response.error.is_some();
    let error_msg = provider_response.error.as_ref().map(|e| e.message.clone());

    let span_output = if let Some(fc) = &function_call {
        serde_json::to_value(fc).ok()
    } else if let Some(t) = &text_response {
        Some(serde_json::Value::String(t.clone()))
    } else {
        finish_reason
            .as_ref()
            .and_then(|fr| serde_json::to_value(fr).ok())
    };

    let span_error = if let Some(e) = &error_msg {
        Some(e.clone())
    } else if let Some(fr) = &finish_reason {
        if fr.is_success() {
            None
        } else {
            Some(format!("{:?}", fr))
        }
    } else {
        None
    };

    emit_internal_span(
        queue.clone(),
        InternalSpan {
            name: format!("step_{}.process_response", run.step),
            trace_id: run.internal_trace_id,
            run_id: run.run_id,
            signal_name: signal_message.signal.name.clone(),
            parent_span_id: Some(run.internal_span_id),
            span_type: SpanType::LLM,
            start_time: signal_message.request_start_time,
            input: None,
            output: span_output,
            input_tokens: usage.as_ref().and_then(|u| u.prompt_token_count).map(|c| c),
            input_cached_tokens: None,
            output_tokens: usage
                .as_ref()
                .and_then(|u| u.candidates_token_count)
                .map(|c| c),
            model: model_version.unwrap_or(llm_model()),
            provider: llm_provider(),
            internal_project_id: config.internal_project_id,
            job_id: run.job_id,
            error: span_error,
            provider_batch_id: Some(provider_batch_id),
        },
    )
    .await;

    if has_error {
        return (
            StepResult::Failed {
                error: error_msg.unwrap_or_else(|| "LLM provider error".to_string()),
                finish_reason,
                is_processing_error: false,
            },
            vec![],
        );
    }

    if let Some(function_call) = function_call {
        let llm_output_msg = CHSignalRunMessage::new(
            signal_message.project_id,
            run.run_id,
            chrono::Utc::now(),
            content_val
                .as_ref()
                .map(|v| v.to_string())
                .unwrap_or_default(),
        );
        new_messages.push(llm_output_msg);

        let tool_call_start_time = chrono::Utc::now();
        let step_result =
            handle_tool_call(signal_message, run, &function_call, clickhouse.clone()).await;

        let tool_error = match &step_result {
            StepResult::Failed { error, .. } => Some(error.clone()),
            _ => None,
        };

        emit_internal_span(
            queue.clone(),
            InternalSpan {
                name: function_call.name.clone(),
                trace_id: run.internal_trace_id,
                run_id: run.run_id,
                signal_name: signal_message.signal.name.clone(),
                parent_span_id: Some(run.internal_span_id),
                span_type: SpanType::Tool,
                start_time: tool_call_start_time,
                input: Some(serde_json::json!(function_call)),
                output: Some(serde_json::json!(step_result)),
                input_tokens: None,
                input_cached_tokens: None,
                output_tokens: None,
                model: llm_model(),
                provider: llm_provider(),
                internal_project_id: config.internal_project_id,
                job_id: run.job_id,
                error: tool_error,
                provider_batch_id: None,
            },
        )
        .await;

        match step_result {
            StepResult::Failed {
                error,
                finish_reason,
                is_processing_error,
            } => (
                StepResult::Failed {
                    error: format!("Tool call failed: {}", error),
                    finish_reason,
                    is_processing_error,
                },
                new_messages,
            ),
            StepResult::CompletedNoEvent => (StepResult::CompletedNoEvent, new_messages),
            StepResult::CompletedWithEvent {
                attributes,
                summary,
            } => (
                StepResult::CompletedWithEvent {
                    attributes,
                    summary,
                },
                new_messages,
            ),
            StepResult::RequiresNextStep { reason } => {
                match &reason {
                    NextStepReason::ToolResult(tool_result) => {
                        let function_response_content = Content {
                            role: Some("user".to_string()),
                            parts: Some(vec![Part {
                                function_response: Some(FunctionResponse {
                                    name: function_call.name.clone(),
                                    response: tool_result.clone(),
                                    id: function_call.id.clone(),
                                }),
                                ..Default::default()
                            }]),
                        };
                        let tool_output_msg = CHSignalRunMessage::new(
                            signal_message.project_id,
                            run.run_id,
                            chrono::Utc::now(),
                            serde_json::to_string(&function_response_content).unwrap_or_default(),
                        );
                        new_messages.push(tool_output_msg);
                    }
                    NextStepReason::MalformedFunctionCallRetry => {}
                }

                if run.step >= config.max_allowed_steps {
                    (
                        StepResult::Failed {
                            error: "Maximum step count exceeded".to_string(),
                            finish_reason,
                            is_processing_error: false,
                        },
                        new_messages,
                    )
                } else {
                    (StepResult::RequiresNextStep { reason }, new_messages)
                }
            }
        }
    } else {
        if let Some(fr) = &finish_reason {
            if fr.is_malformed_function_call() {
                if run.step >= config.max_allowed_steps {
                    return (
                        StepResult::Failed {
                            error: "Maximum step count exceeded".to_string(),
                            finish_reason: Some(fr.clone()),
                            is_processing_error: false,
                        },
                        new_messages,
                    );
                }

                let finish_message = text_response.clone().unwrap_or_else(|| format!("{:?}", fr));
                let now = chrono::Utc::now();
                let assistant_content = Content {
                    role: Some("model".to_string()),
                    parts: Some(vec![Part {
                        text: Some(finish_message),
                        ..Default::default()
                    }]),
                };
                new_messages.push(CHSignalRunMessage::new(
                    signal_message.project_id,
                    run.run_id,
                    now,
                    serde_json::to_string(&assistant_content).unwrap_or_default(),
                ));

                let user_content = Content {
                    role: Some("user".to_string()),
                    parts: Some(vec![Part {
                        text: Some(MALFORMED_FUNCTION_CALL_RETRY_GUIDANCE.to_string()),
                        ..Default::default()
                    }]),
                };
                new_messages.push(CHSignalRunMessage::new(
                    signal_message.project_id,
                    run.run_id,
                    now + chrono::Duration::milliseconds(1),
                    serde_json::to_string(&user_content).unwrap_or_default(),
                ));

                return (
                    StepResult::RequiresNextStep {
                        reason: NextStepReason::MalformedFunctionCallRetry,
                    },
                    new_messages,
                );
            }
        }

        let error = format!(
            "Expected function call in LLM response, got finish reason: {:?}. Text: {}",
            finish_reason,
            text_response.unwrap_or_default()
        );
        (
            StepResult::Failed {
                error,
                finish_reason,
                is_processing_error: false,
            },
            new_messages,
        )
    }
}

async fn handle_tool_call(
    signal_message: &SignalMessage,
    run: &SignalRun,
    function_call: &FunctionCall,
    clickhouse: clickhouse::Client,
) -> StepResult {
    match function_call.name.as_str() {
        "get_full_spans" | "get_full_span_info" => {
            let span_ids: Vec<String> = function_call
                .args
                .as_ref()
                .and_then(|args| args.get("span_ids"))
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();

            if span_ids.is_empty() {
                return StepResult::Failed {
                    error: "No span_ids provided".to_string(),
                    finish_reason: None,
                    is_processing_error: true,
                };
            }

            match get_full_spans(
                clickhouse,
                signal_message.project_id,
                run.trace_id,
                span_ids,
            )
            .await
            {
                Ok(spans) => StepResult::RequiresNextStep {
                    reason: NextStepReason::ToolResult(serde_json::json!({ "spans": spans })),
                },
                Err(e) => StepResult::RequiresNextStep {
                    reason: NextStepReason::ToolResult(
                        serde_json::json!({ "error": e.to_string() }),
                    ),
                },
            }
        }
        "submit_identification" => {
            let identified = function_call
                .args
                .as_ref()
                .and_then(|args| args.get("identified"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let attributes = function_call
                .args
                .as_ref()
                .and_then(|args| args.get("data").cloned())
                .unwrap_or_default();
            let summary = function_call
                .args
                .as_ref()
                .and_then(|args| args.get("summary").or_else(|| args.get("_summary")))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_default();

            if identified {
                StepResult::CompletedWithEvent {
                    attributes,
                    summary,
                }
            } else {
                StepResult::CompletedNoEvent
            }
        }
        unknown => StepResult::Failed {
            error: format!("Unknown function: {}", unknown),
            finish_reason: None,
            is_processing_error: true,
        },
    }
}

async fn handle_create_event(
    signal_message: &SignalMessage,
    run: &SignalRun,
    attributes: serde_json::Value,
    summary: String,
    clickhouse: clickhouse::Client,
    db: Arc<DB>,
    queue: Arc<MessageQueue>,
    parent_span_id: Uuid,
    internal_project_id: Option<Uuid>,
) -> anyhow::Result<Uuid> {
    let create_event_start_time = chrono::Utc::now();
    let ch_spans = get_trace_span_ids_and_end_time(
        clickhouse.clone(),
        signal_message.project_id,
        run.trace_id,
    )
    .await?;
    if ch_spans.is_empty() {
        anyhow::bail!("No spans found");
    }

    let root_span = &ch_spans[0];
    let timestamp = nanoseconds_to_datetime(root_span.end_time);
    let short_to_uuid: HashMap<String, Uuid> = ch_spans
        .iter()
        .map(|span| (span_short_id(&span.span_id), span.span_id))
        .collect();
    let attrs = replace_span_tags_with_links(
        attributes,
        &short_to_uuid,
        signal_message.project_id,
        run.trace_id,
    )?;

    let event_id = Uuid::new_v4();
    let signal_event = CHSignalEvent::new(
        event_id,
        signal_message.project_id,
        signal_message.signal.id,
        run.trace_id,
        run.run_id,
        signal_message.signal.name.clone(),
        attrs,
        timestamp,
        summary,
    );
    insert_signal_events(clickhouse, vec![signal_event.clone()]).await?;

    process_event_notifications_and_clustering(
        db,
        queue.clone(),
        signal_message.project_id,
        run.trace_id,
        signal_event,
    )
    .await?;

    emit_internal_span(
        queue,
        InternalSpan {
            name: "create_event".to_string(),
            trace_id: run.internal_trace_id,
            run_id: run.run_id,
            signal_name: signal_message.signal.name.clone(),
            parent_span_id: Some(parent_span_id),
            span_type: SpanType::Default,
            start_time: create_event_start_time,
            input: Some(
                serde_json::json!({ "id": event_id, "signal_id": signal_message.signal.id }),
            ),
            output: None,
            input_tokens: None,
            input_cached_tokens: None,
            output_tokens: None,
            model: llm_model(),
            provider: llm_provider(),
            internal_project_id,
            job_id: run.job_id,
            error: None,
            provider_batch_id: None,
        },
    )
    .await;

    Ok(event_id)
}
