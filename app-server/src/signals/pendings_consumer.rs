use async_trait::async_trait;
use std::{collections::HashMap, sync::Arc};
use uuid::Uuid;

use crate::{
    cache::Cache,
    ch::{
        signal_run_messages::insert_signal_run_messages,
        signal_runs::{CHSignalRun, insert_signal_runs},
    },
    db::DB,
    mq::MessageQueue,
    signals::SignalRun,
    signals::{
        SignalWorkerConfig,
        provider::{LanguageModelClient, ProviderClient, models::ProviderBatchOutput},
        push_to_signals_queue,
        queue::{SignalJobPendingBatchMessage, SignalMessage, push_to_realtime_queue, push_to_waiting_queue},
        response_processor::{FailureMetadata, finalize_runs, process_provider_responses},
    },
    worker::{HandlerError, MessageHandler},
};

const DEFAULT_RETRY_COUNT: u32 = 4;

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

    let mut processed = process_provider_responses(
        &message.messages,
        &response.responses,
        Some(message.batch_id.clone()),
        clickhouse.clone(),
        queue.clone(),
        config.clone(),
        db.clone(),
    )
    .await?;

    // Insert new conversation messages BEFORE routing any runs to queues.
    // A consumer could pick up the run before finalize_runs persists them, causing
    // process_run to read stale message history (e.g. missing retry guidance).
    insert_signal_run_messages(clickhouse.clone(), &processed.new_messages).await?;

    // Route pending runs to the realtime queue to utilize cached tokens
    for run_id in &processed.pending_run_ids {
        let msg = processed.run_to_message.get(run_id).unwrap();
        let mut next_step_msg = msg.clone();
        next_step_msg.step += 1;

        if let Err(e) = push_to_realtime_queue(next_step_msg, queue.clone()).await {
            log::error!(
                "[SIGNAL JOB] Failed to push pending run {} to realtime queue: {:?}",
                run_id,
                e
            );
            let run = SignalRun::from_message(msg, msg.signal.id).next_step();
            processed
                .failed_runs
                .push(run.failed(format!("Failed to enqueue for next step: {}", e)));
        }
    }

    let (permanently_failed_runs, retried_count) = retry_or_fail_runs(
        processed.failed_runs,
        &processed.run_to_message,
        &processed.failure_metadata,
        queue.clone(),
    )
    .await;

    finalize_runs(
        &processed.succeeded_runs,
        &permanently_failed_runs,
        clickhouse.clone(),
        db.clone(),
        cache.clone(),
        queue.clone(),
    )
    .await?;

    log::debug!(
        "[SIGNAL JOB] Batch processing complete. Succeeded: {}, Retried: {}, Permanently Failed: {}",
        processed.succeeded_runs.len(),
        retried_count,
        permanently_failed_runs.len(),
    );

    Ok(())
}
