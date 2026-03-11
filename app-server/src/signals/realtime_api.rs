use async_trait::async_trait;
use backoff::ExponentialBackoffBuilder;
use std::{sync::Arc, time::Duration};
use uuid::Uuid;

use crate::{
    cache::Cache,
    ch::signal_run_messages::insert_signal_run_messages,
    db::DB,
    mq::MessageQueue,
    signals::{
        LLM_MODEL, SignalRun, SignalWorkerConfig, llm_provider,
        common::{ProcessRunResult, handle_failed_runs, process_run},
        pendings_consumer::process_succeeded_batch,
        provider::{
            LanguageModelClient, ProviderClient,
            models::{ProviderBatchOutput, ProviderInlineResponse, ProviderRequestItem},
        },
        queue::{SignalJobPendingBatchMessage, SignalMessage, push_to_realtime_queue},
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
            &LLM_MODEL,
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

                self.process_realtime_request(request, updated_message)
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
    async fn process_realtime_request(&self, request: ProviderRequestItem, message: SignalMessage) {
        let max_retry_count = get_unsigned_env_with_default("SIGNALS_MAX_RETRY_COUNT", 4);
        let model_str = LLM_MODEL.to_string();
        let llm_client = self.llm_client.clone();
        let req_clone = request.request.clone();

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

                let pending_message = SignalJobPendingBatchMessage {
                    messages: vec![message.clone()],
                    batch_id: format!("realtime_{}", Uuid::new_v4()),
                };

                if let Err(e) = process_succeeded_batch(
                    &pending_message,
                    Some(batch_output),
                    self.db.clone(),
                    self.queue.clone(),
                    self.clickhouse.clone(),
                    self.config.clone(),
                    self.cache.clone(),
                )
                .await
                {
                    log::error!("[SIGNAL JOB] Failed to process realtime response: {:?}", e);
                }
            }
            Err(e) => {
                log::error!("[SIGNAL JOB] Realtime API error after backoff: {:?}", e);
                let failed_run = SignalRun::from_message(&message, message.signal.id)
                    .failed(&format!("Realtime API failed: {}", e));

                if e.is_retryable() && message.retry_count < max_retry_count {
                    let mut retry_msg = message.clone();
                    retry_msg.retry_count += 1;

                    log::info!(
                        "[SIGNAL JOB] Retrying realtime run {} via queue (retry {}/{})",
                        retry_msg.run_id,
                        retry_msg.retry_count,
                        max_retry_count
                    );

                    if let Err(enqueue_err) =
                        push_to_realtime_queue(retry_msg, self.queue.clone()).await
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
