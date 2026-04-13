use backoff::ExponentialBackoffBuilder;
use regex::Regex;
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, LazyLock},
    time::Duration,
};
use uuid::Uuid;

use crate::{
    cache::Cache,
    ch::signal_events::{CHSignalEvent, insert_signal_events},
    ch::signal_run_messages::CHSignalRunMessage,
    ch::signal_runs::{CHSignalRun, insert_signal_runs},
    db::DB,
    db::spans::SpanType,
    features::{Feature, is_feature_enabled},
    mq::MessageQueue,
    signals::{
        SignalRun, SignalWorkerConfig, llm_model, llm_provider,
        postprocess::process_event_notifications_and_clustering,
        prompts::MALFORMED_FUNCTION_CALL_RETRY_GUIDANCE,
        provider::models::{
            ProviderContent as Content, ProviderFinishReason as FinishReason,
            ProviderFunctionCall as FunctionCall, ProviderFunctionResponse as FunctionResponse,
            ProviderInlineResponse, ProviderPart as Part,
        },
        queue::SignalMessage,
        spans::{get_trace_span_ids_and_end_time, span_short_id},
        tools::{SpanSearchRequest, get_full_spans, search_in_spans},
        utils::{
            InternalSpan, emit_internal_span, nanoseconds_to_datetime, replace_span_tags_with_links,
        },
    },
    utils::limits::update_workspace_signal_runs_used,
    worker::HandlerError,
};

#[derive(Debug, Serialize)]
pub enum NextStepReason {
    ToolResult(serde_json::Value),
    MalformedFunctionCallRetry,
}

#[derive(Debug, Serialize)]
pub enum StepResult {
    CompletedNoEvent,
    CompletedWithEvent {
        attributes: serde_json::Value,
        summary: String,
        severity: u8,
    },
    RequiresNextStep {
        reason: NextStepReason,
    },
    Failed {
        error: String,
        finish_reason: Option<FinishReason>,
        // Whether the error is due to processing the response, not the provider.
        // Usually due to malformed function calls so is retryable.
        is_processing_error: bool,
    },
}

pub struct FailureMetadata {
    pub retryable: bool,
}

pub struct ProcessedResponses {
    pub succeeded_runs: Vec<SignalRun>,
    pub failed_runs: Vec<SignalRun>,
    pub failure_metadata: HashMap<Uuid, FailureMetadata>,
    pub pending_run_ids: HashSet<Uuid>,
    pub run_to_message: HashMap<Uuid, SignalMessage>,
    pub new_messages: Vec<CHSignalRunMessage>,
}

/// Process all provider responses for a batch of signal messages.
/// Returns classified results without any queue routing — callers are responsible
/// for routing pending and failed runs to the appropriate queue.
pub async fn process_provider_responses(
    messages: &[SignalMessage],
    responses: &[ProviderInlineResponse],
    batch_id: Option<String>,
    clickhouse: clickhouse::Client,
    queue: Arc<MessageQueue>,
    config: Arc<SignalWorkerConfig>,
    db: Arc<DB>,
) -> Result<ProcessedResponses, HandlerError> {
    let mut run_to_message: HashMap<Uuid, SignalMessage> = HashMap::new();
    for msg in messages.iter() {
        run_to_message.insert(msg.run_id, msg.clone());
    }

    let mut new_messages = Vec::new();
    let mut succeeded_runs: Vec<SignalRun> = Vec::new();
    let mut failed_runs: Vec<SignalRun> = Vec::new();
    let mut pending_run_ids: HashSet<Uuid> = HashSet::new();
    let mut failure_metadata: HashMap<Uuid, FailureMetadata> = HashMap::new();

    for inline_response in responses.iter() {
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
                    "Response missing run_id in metadata, skipping response. Batch ID: {:?}",
                    &batch_id
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
            batch_id.clone(),
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
                severity,
            } => {
                match handle_create_event(
                    signal_message,
                    &run,
                    attributes,
                    summary,
                    severity,
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
                        failure_metadata.insert(run.run_id, FailureMetadata { retryable: false });
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
                        retryable: is_processing_error
                            || finish_reason
                                .as_ref()
                                .map(|fr| fr.is_retryable())
                                .unwrap_or(true),
                    },
                );
                failed_runs.push(run.failed(error));
            }
        }
    }

    Ok(ProcessedResponses {
        succeeded_runs,
        failed_runs,
        failure_metadata,
        pending_run_ids,
        run_to_message,
        new_messages,
    })
}

/// Insert results into ClickHouse and update job stats.
/// Callers must insert `new_messages` into ClickHouse **before** routing pending/failed runs to
/// any queue, to avoid a race where a consumer picks up a run before its conversation history
/// (e.g. tool results or retry guidance) has been persisted.
pub async fn finalize_runs(
    succeeded_runs: &[SignalRun],
    permanently_failed_runs: &[SignalRun],
    clickhouse: clickhouse::Client,
    db: Arc<DB>,
    cache: Arc<Cache>,
    queue: Arc<MessageQueue>,
) -> Result<(), HandlerError> {
    // Insert succeeded runs and update usage limits
    let succeeded_runs_ch: Vec<CHSignalRun> =
        succeeded_runs.iter().map(CHSignalRun::from).collect();
    insert_signal_runs(clickhouse.clone(), &succeeded_runs_ch).await?;
    if is_feature_enabled(Feature::UsageLimit) {
        let mut runs_by_project_id: HashMap<Uuid, usize> = HashMap::new();
        for run in succeeded_runs {
            let cost = run.steps_processed as usize;
            *runs_by_project_id.entry(run.project_id).or_insert(0) += cost;
        }
        let update_futures = runs_by_project_id.into_iter().map(|(project_id, runs)| {
            let db = db.clone();
            let clickhouse = clickhouse.clone();
            let cache = cache.clone();
            let queue = queue.clone();
            async move {
                if let Err(e) = update_workspace_signal_runs_used(
                    db, clickhouse, cache, queue, project_id, runs,
                )
                .await
                {
                    log::error!("Failed to update workspace signal runs used: {}", e);
                }
            }
        });
        futures_util::future::join_all(update_futures).await;
    }

    // Insert permanently failed runs
    let permanently_failed_runs_ch: Vec<CHSignalRun> = permanently_failed_runs
        .iter()
        .map(CHSignalRun::from)
        .collect();
    if let Err(e) = insert_signal_runs(clickhouse.clone(), &permanently_failed_runs_ch).await {
        log::error!(
            "[SIGNAL JOB] Failed to insert permanently failed runs: {:?}",
            e
        );
    }

    // Update job stats for succeeded runs
    let mut succeeded_by_job: HashMap<Uuid, i32> = HashMap::new();
    for run in succeeded_runs {
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

    // Update job stats for permanently failed runs
    let mut failed_by_job: HashMap<Uuid, i32> = HashMap::new();
    for run in permanently_failed_runs {
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
        "[SIGNAL JOB] Finalized runs. Succeeded: {}, Permanently Failed: {}",
        succeeded_runs.len(),
        permanently_failed_runs.len(),
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
    provider_batch_id: Option<String>,
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
            input_tokens: usage.as_ref().and_then(|u| u.prompt_token_count),
            input_cached_tokens: usage.as_ref().and_then(|u| u.cache_read_input_tokens),
            output_tokens: usage.as_ref().and_then(|u| u.candidates_token_count),
            model: model_version.unwrap_or(llm_model()),
            provider: llm_provider(),
            internal_project_id: config.internal_project_id,
            job_id: run.job_id,
            error: span_error,
            provider_batch_id,
            metadata: None,
            tools: None,
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
                metadata: None,
                tools: None,
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
                severity,
            } => (
                StepResult::CompletedWithEvent {
                    attributes,
                    summary,
                    severity,
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

pub async fn handle_tool_call(
    signal_message: &SignalMessage,
    run: &SignalRun,
    function_call: &FunctionCall,
    clickhouse: clickhouse::Client,
) -> StepResult {
    match function_call.name.as_str() {
        "search_in_spans" => {
            let searches: Vec<SpanSearchRequest> = function_call
                .args
                .as_ref()
                .and_then(|args| args.get("searches"))
                .and_then(|v| serde_json::from_value(v.clone()).ok())
                .unwrap_or_default();

            if searches.is_empty() {
                return StepResult::Failed {
                    error: "No searches provided".to_string(),
                    finish_reason: None,
                    is_processing_error: true,
                };
            }

            match search_in_spans(
                clickhouse,
                signal_message.project_id,
                run.trace_id,
                searches,
            )
            .await
            {
                Ok(results) => StepResult::RequiresNextStep {
                    reason: NextStepReason::ToolResult(serde_json::json!({ "results": results })),
                },
                Err(e) => StepResult::RequiresNextStep {
                    reason: NextStepReason::ToolResult(
                        serde_json::json!({ "error": e.to_string() }),
                    ),
                },
            }
        }
        "get_full_spans" | "get_full_span_info" => {
            let span_ids: Vec<String> = function_call
                .args
                .as_ref()
                .and_then(|args| args.get("span_ids"))
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str())
                        .flat_map(|s| parse_span_ids_from_str(s))
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
            let severity = function_call
                .args
                .as_ref()
                .and_then(|args| args.get("severity"))
                .and_then(|v| v.as_str())
                .map(|s| match s {
                    "critical" => 2u8,
                    "warning" => 1u8,
                    "info" => 0u8,
                    other => {
                        log::warn!(
                            "Unknown severity value '{}', defaulting to warning (1)",
                            other
                        );
                        1u8
                    }
                })
                .unwrap_or(0u8);

            if identified {
                StepResult::CompletedWithEvent {
                    attributes,
                    summary,
                    severity,
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

pub async fn handle_create_event(
    signal_message: &SignalMessage,
    run: &SignalRun,
    attributes: serde_json::Value,
    summary: String,
    severity: u8,
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
        severity,
    );

    let backoff = ExponentialBackoffBuilder::new()
        .with_initial_interval(Duration::from_secs(1))
        .with_multiplier(2.0)
        .with_max_elapsed_time(Some(Duration::from_secs(10)))
        .build();
    let ch_ref = &clickhouse;
    let event_ref = &signal_event;
    // NOTE: all errors treated as transient because anyhow::Error doesn't expose
    // ClickHouse error kinds; permanent errors (schema mismatch, etc.) will retry
    // until the 10s timeout before propagating.
    backoff::future::retry(backoff, || async move {
        insert_signal_events(ch_ref.clone(), vec![event_ref.clone()])
            .await
            .map_err(|e| {
                log::warn!("[SIGNAL JOB] Retrying insert_signal_events: {:?}", e);
                backoff::Error::transient(e)
            })
    })
    .await?;

    let backoff = ExponentialBackoffBuilder::new()
        .with_initial_interval(Duration::from_secs(1))
        .with_multiplier(2.0)
        .with_max_elapsed_time(Some(Duration::from_secs(10)))
        .build();
    let db_ref = &db;
    let queue_ref = &queue;
    let project_id = signal_message.project_id;
    let trace_id = run.trace_id;
    let event_for_notif = signal_event.clone();
    backoff::future::retry(backoff, || {
        let event = event_for_notif.clone();
        async move {
            process_event_notifications_and_clustering(
                db_ref.clone(),
                queue_ref.clone(),
                project_id,
                trace_id,
                event,
            )
            .await
            .map_err(|e| {
                log::warn!("[SIGNAL JOB] Retrying notifications/clustering: {:?}", e);
                backoff::Error::transient(e)
            })
        }
    })
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
            metadata: None,
            tools: None,
        },
    )
    .await;

    Ok(event_id)
}

static SPAN_ID_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\b[0-9a-fA-F]{6}\b").unwrap());

/// Extracts 6-char hex span short IDs from a string, regardless of formatting.
///
/// Uses regex to pull out hex tokens, so it handles any malformed LLM output:
/// - `"672ca8\", \"355a29\", \"6dfb10\""`  (escaped quotes as separators)
/// - `"204e1c' , '1ccaa0' , '953318'"`    (single quotes as separators)
/// - `"672ca8"`                            (normal single ID)
fn parse_span_ids_from_str(s: &str) -> Vec<String> {
    SPAN_ID_RE
        .find_iter(s)
        .map(|m| m.as_str().to_string())
        .collect()
}
