//! This module reads pending LLM batch requests from RabbitMQ and processes them:
//! If batch is not ready, add to the Waiting Queue (will be routed back the Pending Queue after TTL)
//! If batch is ready, process it:
//! - inserts new messages to clickhouse
//! - if no next steps required, create event and update status
//! - otherwise, make tool calls and push to Submissions Queue for next step

use anyhow::Result;
use async_trait::async_trait;
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};
use uuid::Uuid;

use crate::{
    ch::{
        signal_events::{CHSignalEvent, insert_signal_events},
        signal_run_messages::{
            CHSignalRunMessage, delete_signal_run_messages, insert_signal_run_messages,
        },
        signal_runs::{CHSignalRun, insert_signal_runs},
    },
    db::{DB, signal_jobs::update_signal_job_stats, spans::SpanType},
    mq::MessageQueue,
    signals::gemini::FinishReason,
    utils::get_unsigned_env_with_default,
    worker::{HandlerError, MessageHandler},
};

use super::{
    LLM_MODEL, LLM_PROVIDER, RunStatus, SignalRun, SignalWorkerConfig,
    gemini::{
        Content, FunctionCall, FunctionResponse, GenerateContentBatchOutput, JobState, Part,
        client::GeminiClient,
        utils::{ParsedInlineResponse, parse_inline_response},
    },
    postprocess::process_event_notifications_and_clustering,
    push_to_signals_queue,
    queue::{SignalJobPendingBatchMessage, SignalMessage, push_to_waiting_queue},
    spans::get_trace_spans_with_id_mapping,
    tools::get_full_span_info,
    utils::{
        InternalSpan, emit_internal_span, nanoseconds_to_datetime, replace_span_tags_with_links,
    },
};

const DEFAULT_RETRY_COUNT: usize = 4;

#[derive(Debug, Serialize)]
enum StepResult {
    CompletedNoEvent,
    CompletedWithEvent {
        attributes: serde_json::Value,
        summary: String,
    },
    RequiresNextStep {
        tool_result: serde_json::Value,
    },
    Failed {
        error: String,
        finish_reason: Option<FinishReason>,
    },
}

pub struct SignalJobPendingBatchHandler {
    pub db: Arc<DB>,
    pub queue: Arc<MessageQueue>,
    pub clickhouse: clickhouse::Client,
    pub gemini: Arc<GeminiClient>,
    pub config: Arc<SignalWorkerConfig>,
}

impl SignalJobPendingBatchHandler {
    pub fn new(
        db: Arc<DB>,
        queue: Arc<MessageQueue>,
        clickhouse: clickhouse::Client,
        gemini: Arc<GeminiClient>,
        config: Arc<SignalWorkerConfig>,
    ) -> Self {
        Self {
            db,
            queue,
            clickhouse,
            gemini,
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
            self.gemini.clone(),
            self.config.clone(),
        )
        .await
    }
}

async fn process(
    message: SignalJobPendingBatchMessage,
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    queue: Arc<MessageQueue>,
    gemini: Arc<GeminiClient>,
    config: Arc<SignalWorkerConfig>,
) -> Result<(), HandlerError> {
    log::debug!(
        "[SIGNAL JOB] Processing batch. batch_id: {}, messages: {}",
        message.batch_id,
        message.messages.len()
    );

    // Get batch state from Gemini
    let result = match gemini.get_batch(&message.batch_id.to_string()).await {
        Ok(result) => result,
        Err(e) => {
            if e.is_retryable() {
                return Err(HandlerError::transient(e));
            }

            // Permanent error - treat batch as failed
            log::error!(
                "[SIGNAL JOB] Permanent error getting batch {}: {:?}",
                message.batch_id,
                e
            );
            process_failed_batch(
                &message,
                // Cancelled, so that we don't retry
                JobState::BATCH_STATE_CANCELLED,
                db,
                clickhouse,
                queue,
                Some(format!("Failed to get batch response: {}", e)),
            )
            .await?;
            return Ok(());
        }
    };

    let state = result
        .metadata
        .map(|m| m.state)
        .unwrap_or(JobState::BATCH_STATE_UNSPECIFIED);

    log::debug!("[SIGNAL JOB] Batch {} state: {:?}", message.batch_id, state);

    // Handle batch depending on state
    match state {
        JobState::BATCH_STATE_UNSPECIFIED
        | JobState::BATCH_STATE_FAILED
        | JobState::BATCH_STATE_CANCELLED
        | JobState::BATCH_STATE_EXPIRED => {
            process_failed_batch(&message, state, db, clickhouse, queue, None).await?;
        }
        JobState::BATCH_STATE_PENDING | JobState::BATCH_STATE_RUNNING => {
            process_pending_batch(&message, queue, config.clone()).await?;
        }
        JobState::BATCH_STATE_SUCCEEDED => {
            process_succeeded_batch(&message, result.response, db, queue, clickhouse, config)
                .await?;
        }
    };

    Ok(())
}

/// Helper function to retry failed runs or mark them as permanently failed
/// Returns (permanently_failed_runs, retried_count)
async fn retry_or_fail_runs(
    failed_runs: Vec<SignalRun>,
    run_to_message: &HashMap<Uuid, SignalMessage>,
    run_to_finish_reason: &HashMap<Uuid, FinishReason>,
    queue: Arc<MessageQueue>,
) -> (Vec<SignalRun>, usize) {
    let max_retry_count =
        get_unsigned_env_with_default("SIGNALS_MAX_RETRY_COUNT", DEFAULT_RETRY_COUNT);

    let mut permanently_failed_runs: Vec<SignalRun> = Vec::new();
    let mut retried_count = 0;

    for failed_run in failed_runs {
        // Check if this run has a non-retryable finish reason
        if let Some(finish_reason) = run_to_finish_reason.get(&failed_run.run_id) {
            if !finish_reason.should_retry() {
                // Non-retryable finish reason - mark as permanently failed immediately
                log::warn!(
                    "[SIGNAL JOB] Non-retryable finish reason {:?} for run {}, marking as permanently failed: {}",
                    finish_reason,
                    failed_run.run_id,
                    failed_run
                        .error_message
                        .as_deref()
                        .unwrap_or("unknown error")
                );
                let mut perm_failed = failed_run;
                perm_failed.error_message = Some(format!(
                    "{} (non-retryable finish reason: {:?})",
                    perm_failed
                        .error_message
                        .as_deref()
                        .unwrap_or("unknown error"),
                    finish_reason
                ));
                permanently_failed_runs.push(perm_failed);
                continue;
            }
        }

        // Get the original message to check retry_count
        if let Some(msg) = run_to_message.get(&failed_run.run_id) {
            if msg.retry_count < max_retry_count {
                // Can retry - push back to signals queue
                let mut retry_msg = msg.clone();
                retry_msg.retry_count += 1;
                // Use the failed_run's step, not the original message's step
                // to ensure we don't reprocess the same step after messages were already inserted
                retry_msg.step = failed_run.step;

                log::info!(
                    "[SIGNAL JOB] Retrying failed run {} (retry {}/{}, step {}): {}",
                    failed_run.run_id,
                    retry_msg.retry_count,
                    max_retry_count,
                    retry_msg.step,
                    failed_run
                        .error_message
                        .as_deref()
                        .unwrap_or("unknown error")
                );

                if let Err(e) = push_to_signals_queue(retry_msg.clone(), queue.clone()).await {
                    log::error!(
                        "[SIGNAL JOB] Failed to push retry message for run {} back to queue: {:?}",
                        retry_msg.run_id,
                        e
                    );
                    // If we can't enqueue for retry, mark as permanently failed
                    let mut perm_failed = failed_run;
                    perm_failed.error_message = Some(format!(
                        "{} (failed to enqueue retry)",
                        perm_failed
                            .error_message
                            .as_deref()
                            .unwrap_or("unknown error")
                    ));
                    permanently_failed_runs.push(perm_failed);
                } else {
                    retried_count += 1;
                }
            } else {
                // Max retries exceeded - mark as permanently failed
                log::warn!(
                    "[SIGNAL JOB] Max retries exceeded for run {}, marking as failed: {}",
                    failed_run.run_id,
                    failed_run
                        .error_message
                        .as_deref()
                        .unwrap_or("unknown error")
                );
                let mut perm_failed = failed_run;
                perm_failed.error_message = Some(format!(
                    "{} (max retries exceeded)",
                    perm_failed
                        .error_message
                        .as_deref()
                        .unwrap_or("unknown error")
                ));
                permanently_failed_runs.push(perm_failed);
            }
        } else {
            // No message found (shouldn't happen), mark as permanently failed
            log::warn!(
                "[SIGNAL JOB] No message found for failed run {}, marking as permanently failed",
                failed_run.run_id
            );
            permanently_failed_runs.push(failed_run);
        }
    }

    (permanently_failed_runs, retried_count)
}

/// Handle failed batch
async fn process_failed_batch(
    message: &SignalJobPendingBatchMessage,
    state: JobState,
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    queue: Arc<MessageQueue>,
    custom_error: Option<String>,
) -> Result<(), HandlerError> {
    let error_message =
        custom_error.unwrap_or_else(|| format!("Batch failed with state: {:?}", state));

    // Build lookup: run_id -> SignalMessage
    let run_to_message: HashMap<Uuid, SignalMessage> = message
        .messages
        .iter()
        .map(|msg| (msg.run_id, msg.clone()))
        .collect();

    // Convert all messages to failed runs
    let failed_runs: Vec<SignalRun> = message
        .messages
        .iter()
        .map(|msg| SignalRun {
            run_id: msg.run_id,
            project_id: msg.project_id,
            job_id: msg.job_id,
            trigger_id: msg.trigger_id,
            signal_id: msg.signal.id,
            trace_id: msg.trace_id,
            status: RunStatus::Failed,
            step: msg.step,
            internal_trace_id: msg.internal_trace_id,
            internal_span_id: msg.internal_span_id,
            updated_at: chrono::Utc::now(),
            event_id: None,
            error_message: Some(error_message.clone()),
        })
        .collect();

    // Check if this state should be retried or permanently failed
    let (permanently_failed_runs, retried_count) = if state.should_retry_failed() {
        // Use helper function to retry or permanently fail runs based on retry_count
        // No individual finish reasons for batch-level failures
        let run_to_finish_reason = HashMap::new();
        retry_or_fail_runs(failed_runs, &run_to_message, &run_to_finish_reason, queue).await
    } else {
        // State should not be retried (e.g., BATCH_STATE_CANCELLED) - mark all as permanently failed
        log::warn!(
            "[SIGNAL JOB] Batch state {:?} should not be retried, marking all {} runs as permanently failed",
            state,
            failed_runs.len()
        );
        let permanently_failed = failed_runs
            .into_iter()
            .map(|mut run| {
                run.error_message = Some(format!(
                    "{} (non-retryable state: {:?})",
                    run.error_message.as_deref().unwrap_or("unknown error"),
                    state
                ));
                run
            })
            .collect();
        (permanently_failed, 0)
    };

    // Insert permanently failed runs into ClickHouse
    if !permanently_failed_runs.is_empty() {
        let failed_runs_ch: Vec<CHSignalRun> = permanently_failed_runs
            .iter()
            .map(CHSignalRun::from)
            .collect();
        if let Err(e) = insert_signal_runs(clickhouse.clone(), &failed_runs_ch).await {
            log::error!("[SIGNAL JOB] Failed to insert failed runs: {:?}", e);
        }

        // Delete messages for permanently failed runs
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

        // Update job statistics for permanently failed runs
        let mut failed_by_job: HashMap<Uuid, i32> = HashMap::new();
        for run in &permanently_failed_runs {
            if let Some(job_id) = run.job_id {
                *failed_by_job.entry(job_id).or_insert(0) += 1;
            }
        }
        for (job_id, failed_count) in failed_by_job {
            if let Err(e) = update_signal_job_stats(&db.pool, job_id, 0, failed_count).await {
                log::error!("Failed to update job statistics for job {}: {}", job_id, e);
            }
        }
    }

    // Return success if we successfully enqueued retries
    if retried_count > 0 {
        log::info!(
            "[SIGNAL JOB] Batch failed but {} runs successfully enqueued for retry",
            retried_count
        );
        Ok(())
    } else if !permanently_failed_runs.is_empty() {
        // All runs permanently failed or failed to retry
        Err(HandlerError::permanent(anyhow::anyhow!(
            "LLM batch job failed. All runs exceeded max retries or failed to enqueue. project, trigger, job, and run_ids: {:?}, state: {:?}",
            message
                .messages
                .iter()
                .map(|msg| HashMap::from([
                    ("project_id", Some(msg.project_id)),
                    ("trigger_id", msg.trigger_id),
                    ("job_id", msg.job_id),
                    ("run_id", Some(msg.run_id)),
                ]))
                .collect::<Vec<_>>(),
            state
        )))
    } else {
        // No messages in the batch (shouldn't happen, but handle it)
        Ok(())
    }
}

/// Handle pending batch
async fn process_pending_batch(
    message: &SignalJobPendingBatchMessage,
    queue: Arc<MessageQueue>,
    config: Arc<SignalWorkerConfig>,
) -> Result<(), HandlerError> {
    // Push to waiting queue which has a TTL; after expiry it dead-letters to the pending queue
    push_to_waiting_queue(queue, message, Some(config.waiting_queue_ttl_ms))
        .await
        .map_err(|e| HandlerError::transient(e))
}

/// Handle succeeded batch
async fn process_succeeded_batch(
    message: &SignalJobPendingBatchMessage,
    response: Option<GenerateContentBatchOutput>,
    db: Arc<DB>,
    queue: Arc<MessageQueue>,
    clickhouse: clickhouse::Client,
    config: Arc<SignalWorkerConfig>,
) -> Result<(), HandlerError> {
    let response = response.ok_or(HandlerError::permanent(anyhow::anyhow!(
        "Batch succeeded but response is missing for batch_id: {}",
        message.batch_id
    )))?;

    let inlined_responses = &response.inlined_responses.inlined_responses;

    // Keep track of new messages to insert into ClickHouse
    let mut new_messages = Vec::new();

    // Build lookup: run_id -> SignalMessage (direct mapping, cleaner than index indirection)
    let mut run_to_message: HashMap<Uuid, SignalMessage> = HashMap::new();
    for msg in message.messages.iter() {
        run_to_message.insert(msg.run_id, msg.clone());
    }

    // Helper to build SignalRun from message
    let build_run = |msg: &SignalMessage| -> SignalRun {
        SignalRun {
            run_id: msg.run_id,
            project_id: msg.project_id,
            job_id: msg.job_id,
            trigger_id: msg.trigger_id,
            signal_id: msg.signal.id,
            trace_id: msg.trace_id,
            status: RunStatus::Pending,
            step: msg.step,
            internal_trace_id: msg.internal_trace_id,
            internal_span_id: msg.internal_span_id,
            updated_at: chrono::Utc::now(),
            event_id: None,
            error_message: None,
        }
    };

    // Keep track of succeeded, failed and pending runs
    let mut succeeded_runs: Vec<SignalRun> = Vec::new();
    let mut failed_runs: Vec<SignalRun> = Vec::new();
    let mut pending_run_ids: HashSet<Uuid> = HashSet::new();
    // Track finish reasons for failed runs to determine retry eligibility
    let mut run_to_finish_reason: HashMap<Uuid, FinishReason> = HashMap::new();

    // Process each response, matching by run_id from response metadata
    for inline_response in inlined_responses.iter() {
        let response = parse_inline_response(inline_response);

        // Extract run_id from response metadata and find the corresponding run
        let run_id = match response.run_id {
            Some(id) => id,
            None => {
                // We don't record this run as failed as we don't know the run_id
                // To account for that we check unprocessed runs after the loop ends
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
                // No message found for this run_id, mark as failed
                failed_runs.push(SignalRun {
                    run_id,
                    project_id: Uuid::nil(),
                    job_id: None,
                    trigger_id: None,
                    signal_id: Uuid::nil(),
                    trace_id: response.trace_id.unwrap_or_default(),
                    status: RunStatus::Failed,
                    step: 0,
                    internal_trace_id: Uuid::nil(),
                    internal_span_id: Uuid::nil(),
                    updated_at: chrono::Utc::now(),
                    event_id: None,
                    error_message: Some("No message found for run_id".to_string()),
                });
                log::error!("No message found for run_id {}, skipping", run_id);
                continue;
            }
        };

        let run = build_run(signal_message);

        // Process inline response
        let (step_result, new_run_messages) = process_single_response(
            &response,
            signal_message,
            &run,
            clickhouse.clone(),
            queue.clone(),
            config.clone(),
        )
        .await;

        new_messages.extend(new_run_messages);

        match step_result {
            StepResult::Failed {
                error,
                finish_reason,
            } => {
                // Store finish reason for retry logic
                if let Some(fr) = finish_reason {
                    run_to_finish_reason.insert(run_id, fr);
                }
                failed_runs.push(run.failed(error));
            }
            StepResult::RequiresNextStep { tool_result: _ } => {
                // Mark this run for next step processing
                pending_run_ids.insert(run_id);
            }
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
                        let error = format!("Failed to create event: {}", e);
                        failed_runs.push(run.failed(error));
                    }
                }
            }
        }
    }

    // Find runs that didn't get any response (e.g., response missing run_id)
    // Mark them as failed
    let processed_run_ids: HashSet<Uuid> = succeeded_runs
        .iter()
        .map(|r| r.run_id)
        .chain(failed_runs.iter().map(|r| r.run_id))
        .chain(pending_run_ids.iter().copied())
        .collect();

    for (run_id, msg) in run_to_message.iter() {
        if !processed_run_ids.contains(run_id) {
            failed_runs.push(build_run(msg).failed("No response received for run"));
        }
    }

    log::debug!(
        "[SIGNAL JOB] Batch {} results: succeeded={}, failed={}, pending={}",
        message.batch_id,
        succeeded_runs.len(),
        failed_runs.len(),
        pending_run_ids.len()
    );

    // Insert new messages into ClickHouse
    insert_signal_run_messages(clickhouse.clone(), &new_messages).await?;

    // Insert succeeded runs into ClickHouse
    let succeeded_runs_ch: Vec<CHSignalRun> = succeeded_runs
        .iter()
        .map(|r| CHSignalRun::from(r))
        .collect();
    insert_signal_runs(clickhouse.clone(), &succeeded_runs_ch).await?;

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
                let run = build_run(msg).next_step(); // Build with incremented step
                failed_runs.push(run.failed(format!("Failed to enqueue for next step: {}", e)));
            }
        }
    }

    // Handle failed runs: use helper function to retry or permanently fail them
    let (permanently_failed_runs, retried_count) = retry_or_fail_runs(
        failed_runs,
        &run_to_message,
        &run_to_finish_reason,
        queue.clone(),
    )
    .await;

    // Insert permanently failed runs into ClickHouse
    if !permanently_failed_runs.is_empty() {
        let failed_runs_ch: Vec<CHSignalRun> = permanently_failed_runs
            .iter()
            .map(CHSignalRun::from)
            .collect();
        insert_signal_runs(clickhouse.clone(), &failed_runs_ch).await?;
    }

    // Delete messages for finished runs (succeeded and permanently failed, but not retried)
    let finished_project_run_pairs: Vec<(Uuid, Uuid)> = succeeded_runs
        .iter()
        .chain(permanently_failed_runs.iter())
        .map(|run| (run.project_id, run.run_id))
        .collect();

    delete_signal_run_messages(clickhouse.clone(), &finished_project_run_pairs).await?;

    // Update job stats - group by job_id since runs may belong to different jobs
    let mut stats_by_job: HashMap<Uuid, (i32, i32)> = HashMap::new();
    for run in &succeeded_runs {
        if let Some(job_id) = run.job_id {
            let entry = stats_by_job.entry(job_id).or_insert((0, 0));
            entry.0 += 1;
        }
    }
    for run in &permanently_failed_runs {
        if let Some(job_id) = run.job_id {
            let entry = stats_by_job.entry(job_id).or_insert((0, 0));
            entry.1 += 1;
        }
    }
    for (job_id, (succeeded_count, failed_count)) in stats_by_job {
        if let Err(e) =
            update_signal_job_stats(&db.pool, job_id, succeeded_count, failed_count).await
        {
            log::error!("Failed to update job statistics for job {}: {}", job_id, e);
        }
    }

    if retried_count > 0 {
        log::info!(
            "[SIGNAL JOB] Batch {} successfully enqueued {} failed runs for retry",
            message.batch_id,
            retried_count
        );
    }

    Ok(())
}

/// Handle an inline response of a single run, return step result and new messages
async fn process_single_response(
    response: &ParsedInlineResponse,
    signal_message: &SignalMessage,
    run: &SignalRun,
    clickhouse: clickhouse::Client,
    queue: Arc<MessageQueue>,
    config: Arc<SignalWorkerConfig>,
) -> (StepResult, Vec<CHSignalRunMessage>) {
    let mut new_messages: Vec<CHSignalRunMessage> = Vec::new();

    // Check if response contains an error
    let error = if response.has_error {
        let error = match &response.error_message {
            Some(msg) => format!("LLM response contains error:\n {}", msg),
            None => "LLM response contains error".to_string(),
        };
        Some(error)
    } else {
        None
    };

    let finish_reason = response.finish_reason.clone();

    let span_output = if let Some(content) = &response.content {
        serde_json::to_value(content).ok()
    } else if let Some(function_call) = &response.function_call {
        serde_json::to_value(function_call).ok()
    } else if let Some(finish_reason) = &response.finish_reason {
        serde_json::to_value(finish_reason).ok()
    } else {
        None
    };

    let span_error = if let Some(error) = &error {
        Some(error.clone())
    } else if let Some(finish_reason) = &response.finish_reason {
        if finish_reason.is_success() {
            None
        } else {
            serde_json::to_string(finish_reason).ok()
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
            start_time: chrono::Utc::now(),
            input: None,
            output: span_output,
            input_tokens: response.input_tokens,
            output_tokens: response.output_tokens,
            model: LLM_MODEL.clone(),
            provider: LLM_PROVIDER.clone(),
            internal_project_id: config.internal_project_id,
            job_id: run.job_id,
            error: span_error,
        },
    )
    .await;

    if let Some(error) = error {
        return (
            StepResult::Failed {
                error,
                finish_reason,
            },
            vec![],
        );
    }

    // Check if response contains a function call or text
    if let Some(function_call) = &response.function_call {
        // Save LLM output to new messages
        let llm_output_msg = CHSignalRunMessage::new(
            signal_message.project_id,
            run.run_id,
            chrono::Utc::now(),
            response.content.clone().unwrap_or_default(),
        );
        // only insert if there is a valid function call
        new_messages.push(llm_output_msg);
        let tool_call_start_time = chrono::Utc::now();
        let step_result =
            handle_tool_call(signal_message, &run, &function_call, clickhouse.clone()).await;

        // Internal tracing span for tool call
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
                output_tokens: None,
                model: LLM_MODEL.clone(),
                provider: LLM_PROVIDER.clone(),
                internal_project_id: config.internal_project_id,
                job_id: run.job_id,
                error: None,
            },
        )
        .await;

        match step_result {
            StepResult::Failed {
                error,
                finish_reason,
            } => {
                let error = format!("Tool call failed: {}", error);
                return (
                    StepResult::Failed {
                        error,
                        finish_reason,
                    },
                    new_messages,
                );
            }
            StepResult::CompletedNoEvent => {
                return (StepResult::CompletedNoEvent, new_messages);
            }
            StepResult::CompletedWithEvent {
                attributes,
                summary,
            } => {
                return (
                    StepResult::CompletedWithEvent {
                        attributes,
                        summary,
                    },
                    new_messages,
                );
            }
            StepResult::RequiresNextStep { tool_result } => {
                // Add tool result to new messages
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
                    serde_json::to_string(&function_response_content)
                        .map_err(|e| {
                            log::error!("Failed to serialize function response content: {}", e)
                        })
                        .unwrap_or_default(),
                );
                new_messages.push(tool_output_msg);

                // If step number is greater than maximum allowed, mark run as failed
                if run.step >= config.max_allowed_steps {
                    let error = "Maximum step count exceeded".to_string();
                    return (
                        StepResult::Failed {
                            error,
                            finish_reason,
                        },
                        new_messages,
                    );
                }

                return (StepResult::RequiresNextStep { tool_result }, new_messages);
            }
        }
    } else {
        let error = format!(
            "Expected function call in LLM response, got finish reason: {:?}",
            finish_reason,
        );
        return (
            StepResult::Failed {
                error,
                finish_reason,
            },
            new_messages,
        );
    }
}

/// Handle a tool call, return the StepResult
async fn handle_tool_call(
    signal_message: &SignalMessage,
    run: &SignalRun,
    function_call: &FunctionCall,
    clickhouse: clickhouse::Client,
) -> StepResult {
    log::debug!(
        "[SIGNAL JOB] Processing tool call '{}' for run {}",
        function_call.name,
        run.run_id
    );

    match function_call.name.as_str() {
        "get_full_span_info" => {
            // Extract span_ids from args
            let span_ids: Vec<usize> = function_call
                .args
                .as_ref()
                .and_then(|args| args.get("span_ids"))
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_u64().map(|n| n as usize))
                        .collect()
                })
                .unwrap_or_default();

            if span_ids.is_empty() {
                return StepResult::Failed {
                    error: "get_full_span_info called with no span_ids".to_string(),
                    finish_reason: None,
                };
            }

            // Execute the tool
            let tool_result = match get_full_span_info(
                clickhouse,
                signal_message.project_id,
                run.trace_id,
                span_ids,
            )
            .await
            {
                Ok(spans) => serde_json::json!({ "spans": spans }),
                Err(e) => {
                    log::error!("Error fetching full span info: {}", e);
                    serde_json::json!({ "error": e.to_string() })
                }
            };

            return StepResult::RequiresNextStep { tool_result };
        }
        "submit_identification" => {
            let identified = function_call
                .args
                .as_ref()
                .and_then(|args| args.get("identified"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            let attributes: Option<serde_json::Value> = function_call
                .args
                .as_ref()
                .and_then(|args| args.get("data").cloned());

            let summary: Option<String> = function_call
                .args
                .as_ref()
                .and_then(|args| args.get("_summary"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            log::debug!(
                "[SIGNAL JOB] submit_identification, identified: {:?}",
                identified,
            );

            if identified {
                let attrs = attributes.unwrap_or(serde_json::Value::Null);
                return StepResult::CompletedWithEvent {
                    attributes: attrs,
                    summary: summary.unwrap_or_default(),
                };
            }

            return StepResult::CompletedNoEvent;
        }
        unknown => {
            return StepResult::Failed {
                finish_reason: None,
                error: format!("Unknown function called: {}", unknown),
            };
        }
    }
}

/// Create event, push for notifications and clustering processing
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

    // Get trace spans
    let (ch_spans, uuid_to_seq) = get_trace_spans_with_id_mapping(
        clickhouse.clone(),
        signal_message.project_id,
        run.trace_id,
    )
    .await?;

    if ch_spans.is_empty() {
        anyhow::bail!("No spans found for trace {}", run.trace_id);
    }

    // Use root span's end_time as event timestamp
    let root_span = &ch_spans[0];
    let timestamp = nanoseconds_to_datetime(root_span.end_time);

    // Replace span tags with markdown links
    let seq_to_uuid: HashMap<usize, Uuid> = uuid_to_seq
        .iter()
        .map(|(uuid, seq)| (*seq, *uuid))
        .collect();

    let attrs = replace_span_tags_with_links(
        attributes,
        &seq_to_uuid,
        signal_message.project_id,
        run.trace_id,
    )?;

    // Create signal event
    let event_id = Uuid::new_v4();
    let signal_event = CHSignalEvent::new(
        event_id,
        signal_message.project_id,
        signal_message.signal.id,
        run.trace_id,
        run.run_id,
        signal_message.signal.name.clone(),
        attrs.clone(),
        timestamp,
    );

    // Insert into ClickHouse signal_events table
    insert_signal_events(clickhouse, vec![signal_event.clone()]).await?;

    log::debug!(
        "[SIGNAL JOB] Created signal event '{}' for trace {} (run {})",
        signal_message.signal.name,
        run.trace_id,
        run.run_id
    );

    // Process notifications
    process_event_notifications_and_clustering(
        db,
        queue.clone(),
        signal_message.project_id,
        run.trace_id,
        signal_event,
        summary,
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
            input: Some(serde_json::json!({
                "id": event_id,
                "signal_id": signal_message.signal.id,
                "trace_id": run.trace_id,
                "run_id": run.run_id,
                "name": signal_message.signal.name,
            })),
            output: None,
            input_tokens: None,
            output_tokens: None,
            model: LLM_MODEL.clone(),
            provider: LLM_PROVIDER.clone(),
            internal_project_id,
            job_id: run.job_id,
            error: None,
        },
    )
    .await;

    Ok(event_id)
}
