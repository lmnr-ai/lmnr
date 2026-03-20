use async_trait::async_trait;
use backoff::ExponentialBackoffBuilder;
use std::{sync::Arc, time::Duration};

use crate::{
    cache::Cache,
    ch::signal_run_messages::insert_signal_run_messages,
    db::DB,
    mq::MessageQueue,
    signals::{
        SignalRun, SignalWorkerConfig,
        common::{ProcessRunResult, handle_failed_runs, process_run},
        llm_model, llm_provider,
        provider::{
            LanguageModelClient, ProviderClient,
            models::{ProviderBatchOutput, ProviderInlineResponse},
        },
        queue::{SignalMessage, push_to_realtime_queue},
        response_processor::{finalize_runs, process_provider_responses},
    },
    utils::get_unsigned_env_with_default,
    worker::{HandlerError, MessageHandler},
};

pub struct SignalJobRealtimeHandler {
    pub db: Arc<DB>,
    pub cache: Arc<Cache>,
    pub queue: Arc<MessageQueue>,
    pub clickhouse: clickhouse::Client,
    pub llm_client: Arc<ProviderClient>,
    pub config: Arc<SignalWorkerConfig>,
}

impl SignalJobRealtimeHandler {
    pub fn new(
        db: Arc<DB>,
        cache: Arc<Cache>,
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
impl MessageHandler for SignalJobRealtimeHandler {
    type Message = SignalMessage;

    async fn handle(&self, message: Self::Message) -> Result<(), HandlerError> {
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
            self.clickhouse.clone(),
            self.queue.clone(),
            self.config.internal_project_id,
        )
        .await
        {
            Ok(ProcessRunResult {
                request,
                new_messages,
                request_start_time,
            }) => {
                let mut updated_message = message.clone();
                updated_message.request_start_time = request_start_time;

                if !new_messages.is_empty() {
                    insert_signal_run_messages(self.clickhouse.clone(), &new_messages)
                        .await
                        .map_err(|e| {
                            HandlerError::Transient(anyhow::anyhow!(
                                "Failed to insert messages: {}",
                                e
                            ))
                        })?;
                }

                self.process_realtime_request(request.request, updated_message)
                    .await;
            }
            Err(e) => {
                log::error!(
                    "[SIGNAL JOB] Failed to process realtime run {}: {:?}",
                    message.run_id,
                    e
                );
                let failed_run = SignalRun::from_message(&message, signal.id)
                    .failed(&format!("Failed to process run: {}", e));
                handle_failed_runs(self.clickhouse.clone(), self.db.clone(), vec![failed_run])
                    .await;
            }
        }

        Ok(())
    }
}

impl SignalJobRealtimeHandler {
    async fn process_realtime_request(
        &self,
        request: crate::signals::provider::models::ProviderRequest,
        message: SignalMessage,
    ) {
        let model_str = llm_model();
        let llm_client = self.llm_client.clone();
        let req_clone = request.clone();

        let generate_fn = || async {
            llm_client
                .generate_content(&model_str, &req_clone)
                .await
                .map_err(|e| {
                    if e.is_retryable() {
                        backoff::Error::transient(e)
                    } else {
                        backoff::Error::permanent(e)
                    }
                })
        };

        let backoff = ExponentialBackoffBuilder::new()
            .with_initial_interval(Duration::from_secs(1))
            .with_multiplier(1.5)
            .with_max_interval(Duration::from_secs(10))
            .with_max_elapsed_time(Some(Duration::from_secs(60)))
            .build();

        match backoff::future::retry(backoff, generate_fn).await {
            Ok(response) => {
                let inline_response = ProviderInlineResponse {
                    response: Some(response),
                    error: None,
                    metadata: Some(serde_json::json!({
                        "run_id": message.run_id,
                        "trace_id": message.trace_id,
                    })),
                };

                let batch_output = ProviderBatchOutput {
                    responses: vec![inline_response],
                };

                let processed = match process_provider_responses(
                    &[message.clone()],
                    &batch_output.responses,
                    None,
                    self.clickhouse.clone(),
                    self.queue.clone(),
                    self.config.clone(),
                    self.db.clone(),
                )
                .await
                {
                    Ok(p) => p,
                    Err(e) => {
                        log::error!("[SIGNAL JOB] Failed to process realtime response: {:?}", e);
                        return;
                    }
                };

                // Insert new conversation messages BEFORE routing any runs to queues.
                // A consumer could pick up the run before finalize_runs persists them, causing
                // process_run to read stale message history (e.g. missing retry guidance).
                if let Err(e) =
                    insert_signal_run_messages(self.clickhouse.clone(), &processed.new_messages)
                        .await
                {
                    log::error!(
                        "[SIGNAL JOB] Failed to insert messages for realtime run: {:?}",
                        e
                    );
                    // Treat as fatal for this run — don't route it to queue with missing context.
                    let permanently_failed: Vec<SignalRun> = processed
                        .run_to_message
                        .values()
                        .map(|msg| {
                            SignalRun::from_message(msg, msg.signal.id)
                                .failed(format!("Failed to insert messages: {}", e))
                        })
                        .collect();
                    if let Err(fe) = finalize_runs(
                        &[],
                        &permanently_failed,
                        self.clickhouse.clone(),
                        self.db.clone(),
                        self.cache.clone(),
                    )
                    .await
                    {
                        log::error!(
                            "[SIGNAL JOB] Failed to finalize after message insert error: {:?}",
                            fe
                        );
                    }
                    return;
                }

                // Route pending runs back to the realtime queue
                let mut extra_failed: Vec<SignalRun> = Vec::new();
                for run_id in &processed.pending_run_ids {
                    let msg = processed.run_to_message.get(run_id).unwrap();
                    let mut next_step_msg = msg.clone();
                    next_step_msg.step += 1;

                    if let Err(e) = push_to_realtime_queue(next_step_msg, self.queue.clone()).await
                    {
                        log::error!(
                            "[SIGNAL JOB] Failed to push pending realtime run {} to realtime queue: {:?}",
                            run_id,
                            e
                        );
                        let run = SignalRun::from_message(msg, msg.signal.id).next_step();
                        extra_failed
                            .push(run.failed(format!("Failed to enqueue for next step: {}", e)));
                    }
                }

                // Permanently fail any response-processing failures (API-level retries are
                // handled above by the backoff; no further retry routing needed here).
                let permanently_failed: Vec<SignalRun> = processed
                    .failed_runs
                    .into_iter()
                    .chain(extra_failed)
                    .collect();

                if let Err(e) = finalize_runs(
                    &processed.succeeded_runs,
                    &permanently_failed,
                    self.clickhouse.clone(),
                    self.db.clone(),
                    self.cache.clone(),
                )
                .await
                {
                    log::error!("[SIGNAL JOB] Failed to finalize realtime runs: {:?}", e);
                }
            }
            Err(e) => {
                log::error!("[SIGNAL JOB] Realtime API error after backoff: {:?}", e);
                let failed_run = SignalRun::from_message(&message, message.signal.id)
                    .failed(&format!("Realtime API failed: {}", e));

                if e.is_retryable() {
                    log::info!(
                        "[SIGNAL JOB] Retrying realtime run {} via queue (retry {})",
                        message.run_id,
                        message.retry_count,
                    );

                    if let Err(enqueue_err) =
                        push_to_realtime_queue(message, self.queue.clone()).await
                    {
                        log::error!(
                            "Failed to enqueue retry for realtime request: {:?}",
                            enqueue_err
                        );
                        handle_failed_runs(
                            self.clickhouse.clone(),
                            self.db.clone(),
                            vec![failed_run],
                        )
                        .await;
                    }
                } else {
                    handle_failed_runs(self.clickhouse.clone(), self.db.clone(), vec![failed_run])
                        .await;
                }
            }
        }
    }
}
