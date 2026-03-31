use async_trait::async_trait;
use backoff::{ExponentialBackoff, ExponentialBackoffBuilder};
use std::{sync::Arc, time::Duration};

use crate::{
    cache::Cache,
    ch::signal_run_messages::insert_signal_run_messages,
    db::{DB, spans::SpanType},
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
        utils::{InternalSpan, emit_internal_span, request_to_span_input, request_to_tools_attr},
    },
    worker::{HandlerError, MessageHandler},
};

fn default_realtime_backoff() -> ExponentialBackoff {
    ExponentialBackoffBuilder::new()
        .with_initial_interval(Duration::from_secs(1))
        .with_multiplier(1.5)
        .with_max_interval(Duration::from_secs(10))
        .with_max_elapsed_time(Some(Duration::from_secs(60)))
        .build()
}

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
            &signal.prompt,
            &signal.structured_output_schema,
            self.clickhouse.clone(),
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

                self.process_realtime_request(
                    request.request,
                    updated_message,
                    default_realtime_backoff(),
                )
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
    fn build_submit_span(
        message: &SignalMessage,
        config: &SignalWorkerConfig,
        input: serde_json::Value,
        tools: Option<serde_json::Value>,
        error: Option<String>,
    ) -> InternalSpan {
        InternalSpan {
            name: format!("step_{}.submit_realtime_request", message.step),
            trace_id: message.internal_trace_id,
            run_id: message.run_id,
            signal_name: message.signal.name.clone(),
            parent_span_id: Some(message.internal_span_id),
            span_type: SpanType::LLM,
            start_time: message.request_start_time,
            input: Some(input),
            output: None,
            input_tokens: None,
            input_cached_tokens: None,
            output_tokens: None,
            model: llm_model(),
            provider: llm_provider(),
            internal_project_id: config.internal_project_id,
            job_id: message.job_id,
            error,
            provider_batch_id: None,
            metadata: None,
            tools,
        }
    }

    async fn process_realtime_request(
        &self,
        request: crate::signals::provider::models::ProviderRequest,
        message: SignalMessage,
        backoff: ExponentialBackoff,
    ) {
        let span_input = request_to_span_input(&request);
        let span_tools = request_to_tools_attr(&request);

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

        match backoff::future::retry(backoff, generate_fn).await {
            Ok(response) => {
                emit_internal_span(
                    self.queue.clone(),
                    Self::build_submit_span(&message, &self.config, span_input.clone(), span_tools.clone(), None),
                )
                .await;
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
                emit_internal_span(
                    self.queue.clone(),
                    Self::build_submit_span(
                        &message,
                        &self.config,
                        span_input,
                        span_tools,
                        Some(format!("{}", e)),
                    ),
                )
                .await;

                let failed_run = SignalRun::from_message(&message, message.signal.id)
                    .failed(&format!("Realtime API failed: {}", e));

                if e.is_retryable() {
                    let mut retry_msg = message;
                    retry_msg.retry_count += 1;
                    log::info!(
                        "[SIGNAL JOB] Retrying realtime run {} via queue (retry {})",
                        retry_msg.run_id,
                        retry_msg.retry_count,
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::in_memory::InMemoryCache;
    use crate::db::signals::Signal;
    use crate::mq::tokio_mpsc::TokioMpscQueue;
    use crate::mq::{
        MessageQueue, MessageQueueDeliveryTrait, MessageQueueReceiverTrait, MessageQueueTrait,
    };
    use crate::signals::provider::mock::{GenerateFailureMode, MockProviderClient};
    use crate::signals::provider::models::ProviderRequest;
    use crate::signals::queue::{SIGNALS_REALTIME_EXCHANGE, SIGNALS_REALTIME_ROUTING_KEY};
    use std::time::Duration;
    use uuid::Uuid;

    fn empty_request() -> ProviderRequest {
        ProviderRequest {
            contents: vec![],
            system_instruction: None,
            tools: None,
            generation_config: None,
        }
    }

    /// Create a backoff that expires almost immediately for fast tests.
    fn test_backoff() -> ExponentialBackoff {
        ExponentialBackoffBuilder::new()
            .with_initial_interval(Duration::from_millis(1))
            .with_multiplier(1.1)
            .with_max_interval(Duration::from_millis(5))
            .with_max_elapsed_time(Some(Duration::from_millis(50)))
            .build()
    }

    fn create_test_queue() -> Arc<MessageQueue> {
        let queue = TokioMpscQueue::new();
        queue.register_queue(SIGNALS_REALTIME_EXCHANGE, SIGNALS_REALTIME_ROUTING_KEY);
        Arc::new(MessageQueue::TokioMpsc(queue))
    }

    fn create_test_message(retry_count: usize) -> SignalMessage {
        SignalMessage {
            trace_id: Uuid::new_v4(),
            project_id: Uuid::new_v4(),
            trigger_id: None,
            signal: Signal {
                id: Uuid::new_v4(),
                name: "test_signal".to_string(),
                prompt: "test prompt".to_string(),
                structured_output_schema: serde_json::json!({}),
                sample_rate: None,
            },
            run_id: Uuid::new_v4(),
            internal_trace_id: Uuid::new_v4(),
            internal_span_id: Uuid::new_v4(),
            job_id: None,
            step: 0,
            retry_count,
            request_start_time: chrono::Utc::now(),
            mode: 1,
        }
    }

    fn create_test_handler(
        queue: Arc<MessageQueue>,
        llm_client: MockProviderClient,
    ) -> SignalJobRealtimeHandler {
        let db = Arc::new(DB {
            pool: sqlx::postgres::PgPoolOptions::new()
                .connect_lazy("postgres://test:test@localhost:5432/test")
                .unwrap(),
        });
        let cache = Arc::new(Cache::InMemory(InMemoryCache::new(None)));
        let clickhouse = clickhouse::Client::default();
        let config = Arc::new(SignalWorkerConfig {
            max_allowed_steps: 5,
            internal_project_id: None,
            waiting_queue_ttl_ms: 300_000,
        });
        let provider_client = Arc::new(ProviderClient::Mock(llm_client));

        SignalJobRealtimeHandler::new(db, cache, queue, clickhouse, provider_client, config)
    }

    /// When generate_content always returns a retryable 429 error, after backoff is exhausted
    /// the message should be re-enqueued to the realtime queue.
    #[tokio::test]
    async fn test_retryable_error_requeues_message() {
        let queue = create_test_queue();
        let mut receiver = queue
            .get_receiver(
                "test",
                SIGNALS_REALTIME_EXCHANGE,
                SIGNALS_REALTIME_ROUTING_KEY,
                128,
            )
            .await
            .unwrap();

        let mock_client = MockProviderClient::with_generate_failure(
            usize::MAX,
            GenerateFailureMode::Retryable429,
        );

        let handler = create_test_handler(queue.clone(), mock_client);
        let message = create_test_message(0);
        let original_run_id = message.run_id;
        let original_retry_count = message.retry_count;

        handler
            .process_realtime_request(empty_request(), message, test_backoff())
            .await;

        // The message should have been re-enqueued
        let delivery = tokio::time::timeout(Duration::from_secs(2), receiver.receive())
            .await
            .expect("Expected a message on the queue within timeout")
            .expect("Queue channel should not be closed")
            .expect("Delivery should be Ok");

        let requeued_msg: SignalMessage =
            serde_json::from_slice(&delivery.data()).expect("Should deserialize as SignalMessage");

        assert_eq!(requeued_msg.run_id, original_run_id);
        // The PR change: retry_count should NOT be incremented
        assert_eq!(requeued_msg.retry_count, original_retry_count + 1);
    }

    /// When generate_content always returns a retryable 429 error with a nonzero retry_count,
    /// the message should still be re-enqueued (no max retry cap).
    #[tokio::test]
    async fn test_retryable_error_requeues_regardless_of_retry_count() {
        let queue = create_test_queue();
        let mut receiver = queue
            .get_receiver(
                "test",
                SIGNALS_REALTIME_EXCHANGE,
                SIGNALS_REALTIME_ROUTING_KEY,
                128,
            )
            .await
            .unwrap();

        let mock_client = MockProviderClient::with_generate_failure(
            usize::MAX,
            GenerateFailureMode::Retryable429,
        );

        let handler = create_test_handler(queue.clone(), mock_client);
        // Use a high retry_count to prove there's no cap
        let message = create_test_message(100);
        let original_run_id = message.run_id;

        handler
            .process_realtime_request(empty_request(), message, test_backoff())
            .await;

        // The message should still be re-enqueued despite retry_count=100
        let delivery = tokio::time::timeout(Duration::from_secs(2), receiver.receive())
            .await
            .expect("Expected a message on the queue within timeout")
            .expect("Queue channel should not be closed")
            .expect("Delivery should be Ok");

        let requeued_msg: SignalMessage =
            serde_json::from_slice(&delivery.data()).expect("Should deserialize as SignalMessage");

        assert_eq!(requeued_msg.run_id, original_run_id);
        // retry_count should remain unchanged
        assert_eq!(requeued_msg.retry_count, 100 + 1);
    }

    /// When generate_content returns a non-retryable error, the message should NOT be re-enqueued.
    #[tokio::test]
    async fn test_non_retryable_error_does_not_requeue() {
        let queue = create_test_queue();
        let mut receiver = queue
            .get_receiver(
                "test",
                SIGNALS_REALTIME_EXCHANGE,
                SIGNALS_REALTIME_ROUTING_KEY,
                128,
            )
            .await
            .unwrap();

        let mock_client = MockProviderClient::with_generate_failure(
            usize::MAX,
            GenerateFailureMode::NonRetryable,
        );

        let handler = create_test_handler(queue.clone(), mock_client);
        let message = create_test_message(0);

        handler
            .process_realtime_request(empty_request(), message, test_backoff())
            .await;

        // No message should be on the queue
        let result = tokio::time::timeout(Duration::from_millis(200), receiver.receive()).await;

        assert!(
            result.is_err(),
            "Expected no message on queue for non-retryable error, but got one"
        );
    }

    /// When generate_content returns retryable errors, verify the mock is actually called
    /// multiple times (confirming in-process backoff retries are happening).
    #[tokio::test]
    async fn test_retryable_error_triggers_multiple_backoff_retries() {
        let queue = create_test_queue();
        let _receiver = queue
            .get_receiver(
                "test",
                SIGNALS_REALTIME_EXCHANGE,
                SIGNALS_REALTIME_ROUTING_KEY,
                128,
            )
            .await
            .unwrap();

        let mock_client = MockProviderClient::with_generate_failure(
            usize::MAX,
            GenerateFailureMode::Retryable429,
        );

        let handler = create_test_handler(queue.clone(), mock_client.clone());
        let message = create_test_message(0);

        handler
            .process_realtime_request(empty_request(), message, test_backoff())
            .await;

        // The mock should have been called multiple times via backoff
        assert!(
            mock_client.generate_call_count() > 1,
            "Expected multiple retries via backoff, but generate_content was called {} times",
            mock_client.generate_call_count()
        );
    }
}
