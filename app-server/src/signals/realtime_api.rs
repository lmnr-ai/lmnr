use backoff::ExponentialBackoffBuilder;
use std::{sync::Arc, time::Duration};
use uuid::Uuid;

use crate::{
    cache::Cache,
    db::DB,
    mq::MessageQueue,
    signals::{
        SignalRun, SignalWorkerConfig,
        common::handle_failed_runs,
        gemini::{
            GeminiClient, GenerateContentBatchOutput, InlineRequestItem, InlineResponse,
            InlinedResponsesWrapper,
        },
        pendings_consumer::process_succeeded_batch,
        queue::{SignalJobPendingBatchMessage, SignalMessage, push_to_signals_queue},
    },
    utils::get_unsigned_env_with_default,
};

pub async fn process_realtime_messages(
    requests: Vec<InlineRequestItem>,
    messages: Vec<SignalMessage>,
    model: &str,
    gemini: Arc<GeminiClient>,
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    queue: Arc<MessageQueue>,
    config: Arc<SignalWorkerConfig>,
    cache: Arc<Cache>,
) {
    let max_retry_count = get_unsigned_env_with_default("SIGNALS_MAX_RETRY_COUNT", 4);

    for (request, message) in requests.into_iter().zip(messages.into_iter()) {
        let model_str = model.to_string();
        let gemini_clone = gemini.clone();
        let req_clone = request.request.clone();

        let generate_fn = || async {
            gemini_clone
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
                let inline_response = InlineResponse {
                    response: Some(response),
                    error: None,
                    metadata: Some(serde_json::json!({
                        "run_id": message.run_id,
                        "trace_id": message.trace_id,
                    })),
                };

                let batch_output = GenerateContentBatchOutput {
                    inlined_responses: InlinedResponsesWrapper {
                        inlined_responses: vec![inline_response],
                    },
                };

                let pending_message = SignalJobPendingBatchMessage {
                    messages: vec![message.clone()],
                    batch_id: format!("realtime_{}", Uuid::new_v4()),
                };

                if let Err(e) = process_succeeded_batch(
                    &pending_message,
                    Some(batch_output),
                    db.clone(),
                    queue.clone(),
                    clickhouse.clone(),
                    config.clone(),
                    cache.clone(),
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

                    if let Err(enqueue_err) = push_to_signals_queue(retry_msg, queue.clone()).await
                    {
                        log::error!(
                            "Failed to enqueue retry for realtime request: {:?}",
                            enqueue_err
                        );
                        handle_failed_runs(clickhouse.clone(), db.clone(), vec![failed_run]).await;
                    }
                } else {
                    handle_failed_runs(clickhouse.clone(), db.clone(), vec![failed_run]).await;
                }
            }
        }
    }
}
