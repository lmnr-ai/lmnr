//! This module reads LLM batch submissions from RabbitMQ and processes them:
//! - Makes batch API calls to LLMs (Gemini, etc.)
//! - Pushes results to the Pending Queue for polling

use async_trait::async_trait;
use std::{sync::Arc, time::Duration};
use uuid::Uuid;

use crate::{
    ch::signal_run_messages::{CHSignalRunMessage, insert_signal_run_messages},
    db::DB,
    mq::MessageQueue,
    signals::{
        LLM_MODEL, LLM_PROVIDER, SignalRun, SignalWorkerConfig,
        gemini::{GeminiClient, InlineRequestItem},
        queue::{
            SignalJobPendingBatchMessage, SignalJobSubmissionBatchMessage, SignalMessage,
            push_to_pending_queue,
        },
        utils::extract_batch_id_from_operation,
    },
    utils::get_unsigned_env_with_default,
    worker::{HandlerError, MessageHandler},
};

use crate::signals::common::{ProcessRunResult, handle_failed_runs, process_run};
use crate::signals::realtime_api::process_realtime_messages;

const DEFAULT_SLEEP_DURATION_FOR_DELAYED_RETRY: usize = 60;

pub struct SignalJobSubmissionBatchHandler {
    pub db: Arc<DB>,
    pub cache: Arc<crate::cache::Cache>,
    pub queue: Arc<MessageQueue>,
    pub clickhouse: clickhouse::Client,
    pub gemini: Arc<GeminiClient>,
    pub config: Arc<SignalWorkerConfig>,
}

impl SignalJobSubmissionBatchHandler {
    pub fn new(
        db: Arc<DB>,
        cache: Arc<crate::cache::Cache>,
        queue: Arc<MessageQueue>,
        clickhouse: clickhouse::Client,
        gemini: Arc<GeminiClient>,
        config: Arc<SignalWorkerConfig>,
    ) -> Self {
        Self {
            db,
            cache,
            queue,
            clickhouse,
            gemini,
            config,
        }
    }
}

#[async_trait]
impl MessageHandler for SignalJobSubmissionBatchHandler {
    type Message = SignalJobSubmissionBatchMessage;

    async fn handle(&self, message: Self::Message) -> Result<(), HandlerError> {
        log::debug!(
            "[SIGNAL JOB] Processing submission message. runs: {}",
            message.messages.len(),
        );

        process(
            message,
            self.db.clone(),
            self.clickhouse.clone(),
            self.queue.clone(),
            self.gemini.clone(),
            self.config.clone(),
            self.cache.clone(),
        )
        .await
    }
}

async fn process(
    msg: SignalJobSubmissionBatchMessage,
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    queue: Arc<MessageQueue>,
    gemini: Arc<GeminiClient>,
    config: Arc<SignalWorkerConfig>,
    cache: Arc<crate::cache::Cache>,
) -> Result<(), HandlerError> {
    let mut requests: Vec<InlineRequestItem> = Vec::with_capacity(msg.messages.len());
    let mut all_new_messages: Vec<CHSignalRunMessage> = Vec::new();
    let mut failed_runs: Vec<SignalRun> = Vec::new();
    let mut successful_messages: Vec<SignalMessage> = Vec::new();

    for message in msg.messages.iter() {
        let project_id = message.project_id;
        let signal = &message.signal;
        let trace_id = message.trace_id;

        match process_run(
            project_id,
            trace_id,
            message.run_id,
            message.step,
            message.internal_trace_id,
            message.internal_span_id,
            message.job_id,
            &signal.prompt,
            &signal.name,
            &signal.structured_output_schema,
            &LLM_MODEL,
            &LLM_PROVIDER,
            clickhouse.clone(),
            queue.clone(),
            config.internal_project_id,
        )
        .await
        {
            Ok(ProcessRunResult {
                request,
                new_messages,
                request_start_time,
            }) => {
                requests.push(request);
                all_new_messages.extend(new_messages);
                let mut updated_message = message.clone();
                updated_message.request_start_time = request_start_time;
                successful_messages.push(updated_message);
            }
            Err(e) => {
                log::error!(
                    "[SIGNAL JOB] Failed to process run {}: {:?}",
                    message.run_id,
                    e
                );
                failed_runs.push(
                    SignalRun::from_message(message, signal.id)
                        .failed(&format!("Failed to process run: {}", e)),
                );
            }
        }
    }

    if requests.is_empty() {
        log::error!("[SIGNAL JOB] No requests to submit");
        // All runs failed during processing, handle them before returning
        handle_failed_runs(clickhouse, db, failed_runs).await;
        return Err(HandlerError::permanent(anyhow::anyhow!(
            "No requests to submit"
        )));
    }

    // Insert new messages into ClickHouse
    if !all_new_messages.is_empty() {
        insert_signal_run_messages(clickhouse.clone(), &all_new_messages)
            .await
            .map_err(|e| {
                HandlerError::Transient(anyhow::anyhow!("Failed to insert messages: {}", e))
            })?;
    }

    // Handle failed runs before processing
    handle_failed_runs(clickhouse.clone(), db.clone(), failed_runs).await;

    let mut realtime_requests = Vec::new();
    let mut realtime_messages = Vec::new();
    let mut batch_requests = Vec::new();
    let mut batch_messages = Vec::new();

    for (request, message) in requests.into_iter().zip(successful_messages.into_iter()) {
        if message.use_realtime_api {
            realtime_requests.push(request);
            realtime_messages.push(message);
        } else {
            batch_requests.push(request);
            batch_messages.push(message);
        }
    }

    if !realtime_requests.is_empty() {
        process_realtime_messages(
            realtime_requests,
            realtime_messages,
            &LLM_MODEL,
            gemini.clone(),
            db.clone(),
            clickhouse.clone(),
            queue.clone(),
            config.clone(),
            cache.clone(),
        )
        .await;
    }

    if !batch_requests.is_empty() {
        // Submit batch to Gemini API
        let batch_result =
            submit_batch_to_gemini(&LLM_MODEL, gemini, batch_requests, batch_messages, queue).await;

        if let Err((batch_failed_runs, handler_error)) = batch_result {
            // Only handle failed runs for permanent errors (transient errors will be retried)
            if matches!(handler_error, HandlerError::Permanent(_)) {
                handle_failed_runs(clickhouse, db, batch_failed_runs).await;
            }
            return Err(handler_error);
        }
    }

    Ok(())
}

/// Submit batch to Gemini API and push to pending queue on success.
/// On failure, returns the failed runs and the handler error.
async fn submit_batch_to_gemini(
    model: &str,
    gemini: Arc<GeminiClient>,
    requests: Vec<InlineRequestItem>,
    messages: Vec<SignalMessage>,
    queue: Arc<MessageQueue>,
) -> Result<(), (Vec<SignalRun>, HandlerError)> {
    match gemini
        .create_batch(
            model,
            requests,
            Some(format!("signal_batch_{}", Uuid::new_v4())),
        )
        .await
    {
        Ok(operation) => {
            log::debug!(
                "[SIGNAL JOB] Batch submitted successfully. Operation name: {}",
                operation.name
            );

            let batch_id = extract_batch_id_from_operation(&operation.name).map_err(|e| {
                // If we can't extract batch ID, mark all runs as failed
                let batch_failed_runs = messages
                    .iter()
                    .map(|message| {
                        SignalRun::from_message(message, message.signal.id)
                            .failed(&format!("Failed to extract batch ID: {}", e))
                    })
                    .collect();
                (
                    batch_failed_runs,
                    HandlerError::Permanent(anyhow::anyhow!("Failed to extract batch ID: {}", e)),
                )
            })?;

            let pending_message = SignalJobPendingBatchMessage {
                messages: messages.clone(),
                batch_id,
            };

            push_to_pending_queue(queue, &pending_message)
                .await
                .map_err(|e| {
                    // If we can't push to pending queue, mark all runs as failed
                    let batch_failed_runs = messages
                        .iter()
                        .map(|message| {
                            SignalRun::from_message(message, message.signal.id)
                                .failed(&format!("Failed to push to pending queue: {}", e))
                        })
                        .collect();
                    (batch_failed_runs, HandlerError::transient(e))
                })?;

            Ok(())
        }
        Err(e) => {
            log::error!("[SIGNAL JOB] Failed to submit batch to Gemini: {:?}", e);

            let batch_failed_runs = messages
                .iter()
                .map(|message| {
                    SignalRun::from_message(message, message.signal.id)
                        .failed(&format!("Batch submission failed: {}", e))
                })
                .collect();

            let handler_error = if e.is_retryable() {
                if e.is_resource_exhausted() {
                    let sleep_duration = get_unsigned_env_with_default(
                        "SIGNAL_JOB_SLEEP_BEFORE_RETRY_SEC",
                        DEFAULT_SLEEP_DURATION_FOR_DELAYED_RETRY,
                    );
                    tokio::time::sleep(Duration::from_secs(sleep_duration as u64)).await;
                }
                HandlerError::transient(e)
            } else {
                HandlerError::permanent(e)
            };

            Err((batch_failed_runs, handler_error))
        }
    }
}
