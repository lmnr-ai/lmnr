//! This module reads LLM batch submissions from RabbitMQ and processes them:
//! - Makes batch API calls to LLMs (Gemini, etc.)
//! - Pushes results to the Pending Queue for polling

use async_trait::async_trait;
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    ch::signal_run_messages::{CHSignalRunMessage, insert_signal_run_messages},
    db::DB,
    mq::MessageQueue,
    signals::{
        SignalRun, SignalWorkerConfig, llm_model, llm_provider,
        provider::{LanguageModelClient, ProviderClient, models::ProviderRequestItem},
        queue::{
            SignalJobPendingBatchMessage, SignalJobSubmissionBatchMessage, SignalMessage,
            push_to_pending_queue, push_to_realtime_queue, push_to_signals_queue,
        },
        utils::extract_batch_id_from_operation,
    },
    utils::get_unsigned_env_with_default,
    worker::{HandlerError, MessageHandler},
};

use crate::signals::common::{ProcessRunResult, handle_failed_runs, process_run};

pub struct SignalJobSubmissionBatchHandler {
    pub db: Arc<DB>,
    pub queue: Arc<MessageQueue>,
    pub clickhouse: clickhouse::Client,
    pub llm_client: Arc<ProviderClient>,
    pub config: Arc<SignalWorkerConfig>,
}

impl SignalJobSubmissionBatchHandler {
    pub fn new(
        db: Arc<DB>,
        queue: Arc<MessageQueue>,
        clickhouse: clickhouse::Client,
        llm_client: Arc<ProviderClient>,
        config: Arc<SignalWorkerConfig>,
    ) -> Self {
        Self {
            db,
            queue,
            clickhouse,
            llm_client,
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
            self.llm_client.clone(),
            self.config.clone(),
        )
        .await
    }
}

async fn process(
    msg: SignalJobSubmissionBatchMessage,
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    queue: Arc<MessageQueue>,
    llm_client: Arc<ProviderClient>,
    config: Arc<SignalWorkerConfig>,
) -> Result<(), HandlerError> {
    let mut requests: Vec<ProviderRequestItem> = Vec::with_capacity(msg.messages.len());
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
            &llm_model(),
            &llm_provider(),
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
        return Ok(());
    }

    // Insert new messages into ClickHouse
    if !all_new_messages.is_empty() {
        insert_signal_run_messages(clickhouse.clone(), &all_new_messages)
            .await
            .map_err(|e| {
                HandlerError::Transient(anyhow::anyhow!("Failed to insert messages: {}", e))
            })?;
    }

    // Submit batch to LLM API
    let batch_result = submit_batch_to_llm(
        &llm_model(),
        llm_client,
        requests,
        successful_messages,
        queue,
    )
    .await;

    match batch_result {
        Ok(()) => {
            // Batch submitted successfully, handle any runs that failed during processing
            handle_failed_runs(clickhouse, db, failed_runs).await;
            Ok(())
        }
        Err((batch_failed_runs, handler_error)) => {
            // Only handle failed runs for permanent errors (transient errors will be retried)
            if matches!(handler_error, HandlerError::Permanent(_)) {
                failed_runs.extend(batch_failed_runs);
                handle_failed_runs(clickhouse, db, failed_runs).await;
            }
            Err(handler_error)
        }
    }
}

/// Submit batch to LLM API and push to pending queue on success.
/// On failure, returns the failed runs and the handler error.
async fn submit_batch_to_llm(
    model: &str,
    llm_client: Arc<ProviderClient>,
    requests: Vec<ProviderRequestItem>,
    messages: Vec<SignalMessage>,
    queue: Arc<MessageQueue>,
) -> Result<(), (Vec<SignalRun>, HandlerError)> {
    match llm_client
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
            log::error!("[SIGNAL JOB] Failed to submit batch to LLM: {:?}", e);

            let error_msg = format!("Batch submission failed: {}", e);

            if matches!(e, crate::signals::provider::ProviderError::NotSupported(_)) {
                log::info!(
                    "[SIGNAL JOB] Batch API not supported by provider, falling back to realtime API"
                );
                for message in messages {
                    if let Err(push_err) = push_to_realtime_queue(message, queue.clone()).await {
                        log::error!(
                            "Failed to push to realtime queue after batch not supported: {:?}",
                            push_err
                        );
                    }
                }
                return Ok(());
            }

            if e.is_retryable() {
                let max_retry_count = get_unsigned_env_with_default("SIGNALS_MAX_RETRY_COUNT", 4);

                for mut message in messages {
                    // only increment on 429 so we can push to realtime queue when batch API's overloaded
                    message.retry_count += if e.is_resource_exhausted() { 1 } else { 0 };

                    if message.retry_count >= max_retry_count {
                        if let Err(push_err) = push_to_realtime_queue(message, queue.clone()).await
                        {
                            log::error!(
                                "Failed to push to realtime queue after max retries: {:?}",
                                push_err
                            );
                        }
                    } else {
                        // Still under retry limit - push back to signals queue to try batch again
                        if let Err(push_err) = push_to_signals_queue(message, queue.clone()).await {
                            log::error!(
                                "Failed to push back to signals queue for retry: {:?}",
                                push_err
                            );
                        }
                    }
                }
                // Return Ok because we've re-enqueued individual items for retry
                return Ok(());
            }

            let batch_failed_runs = messages
                .iter()
                .map(|message| {
                    SignalRun::from_message(message, message.signal.id).failed(&error_msg)
                })
                .collect();

            Err((batch_failed_runs, HandlerError::permanent(e)))
        }
    }
}
