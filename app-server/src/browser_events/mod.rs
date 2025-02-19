use std::{env, sync::Arc};

use backoff::ExponentialBackoffBuilder;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    api::v1::browser_sessions::{
        EventBatch, BROWSER_SESSIONS_EXCHANGE, BROWSER_SESSIONS_QUEUE, BROWSER_SESSIONS_ROUTING_KEY,
    },
    mq::{MessageQueue, MessageQueueDeliveryTrait, MessageQueueReceiverTrait, MessageQueueTrait},
};

#[derive(Serialize, Deserialize, Clone)]
pub struct QueueBrowserEventMessage {
    pub batch: EventBatch,
    pub project_id: Uuid,
}

pub async fn process_browser_events(
    clickhouse: clickhouse::Client,
    browser_events_message_queue: Arc<MessageQueue>,
) {
    loop {
        inner_process_browser_events(clickhouse.clone(), browser_events_message_queue.clone())
            .await;
    }
}

async fn inner_process_browser_events(clickhouse: clickhouse::Client, queue: Arc<MessageQueue>) {
    let mut receiver = queue
        .get_receiver(
            BROWSER_SESSIONS_QUEUE,
            BROWSER_SESSIONS_EXCHANGE,
            BROWSER_SESSIONS_ROUTING_KEY,
        )
        .await
        .unwrap();

    while let Some(delivery) = receiver.receive().await {
        if let Err(e) = delivery {
            log::error!("Failed to receive message from queue: {:?}", e);
            continue;
        }
        let delivery = delivery.unwrap();
        let acker = delivery.acker();
        let message = match serde_json::from_slice::<QueueBrowserEventMessage>(&delivery.data()) {
            Ok(message) => message,
            Err(e) => {
                log::error!("Failed to deserialize message from queue: {:?}", e);
                let _ = acker.reject(false).await;
                continue;
            }
        };

        let project_id = message.project_id;
        let batch = message.batch;

        if batch.events.is_empty() {
            continue;
        }

        let max_batch_size = env::var("BROWSER_EVENTS_MAX_BATCH_SIZE")
            .unwrap_or(String::from("64"))
            .parse()
            .unwrap_or(64);

        // Split large batches into smaller chunks
        for chunk in batch.events.chunks(max_batch_size) {
            let chunk_batch = EventBatch {
                events: chunk.to_vec(),
                session_id: batch.session_id,
                trace_id: batch.trace_id,
            };

            // We could further tune async_insert by setting
            // - `async_insert_max_data_size` (bytes)
            // - `async_insert_busy_timeout_ms`
            // These are defaulted globally to 10MiB and 1000ms respectively.
            // More: https://clickhouse.com/docs/en/optimize/asynchronous-inserts
            let query = "
                INSERT INTO browser_session_events (
                    event_id, session_id, trace_id, timestamp,
                    event_type, data, project_id
                )
                SELECT
                    event_id,
                    session_id,
                    trace_id,
                    timestamp,
                    event_type,
                    data,
                    project_id
                FROM (
                    SELECT
                        generateUUIDv4() as event_id,
                        ? as session_id,
                        ? as trace_id,
                        arr.1 as timestamp,
                        arr.2 as event_type,
                        arr.3 as data,
                        ? as project_id
                    FROM (
                        SELECT arrayJoin(arrayZip(?, ?, ?)) as arr
                    )
                )
                SETTINGS async_insert = 1,
                    wait_for_async_insert = 1";

            // Prepare arrays for batch insert
            let timestamps: Vec<String> = chunk_batch
                .events
                .iter()
                .map(|e| e.timestamp.to_string())
                .collect();
            let event_types: Vec<String> = chunk_batch
                .events
                .iter()
                .map(|e| e.event_type.to_string())
                .collect();
            let event_data: Vec<&str> = chunk_batch.events.iter().map(|e| e.data.get()).collect();

            let final_query = clickhouse
                .query(query)
                .bind(chunk_batch.session_id.to_string())
                .bind(chunk_batch.trace_id.to_string())
                .bind(project_id.to_string())
                .bind(timestamps)
                .bind(event_types)
                .bind(event_data);

            let insert_browser_events = || async {
                final_query.clone().execute().await
                    .map_err(|e| {
                        log::error!(
                            "Failed attempt to insert chunk of browser events. Will retry according to backoff policy. Error: {:?}",
                            e
                        );
                        backoff::Error::Transient {
                            err: e,
                            retry_after: None,
                        }
                    })
            };
            // Starting with 0.5 second delay, delay multiplies by random factor between 1 and 2
            // up to 1 minute and until the total elapsed time is 60 seconds
            // https://docs.rs/backoff/latest/backoff/default/index.html
            let exponential_backoff = ExponentialBackoffBuilder::new()
                .with_initial_interval(std::time::Duration::from_millis(500))
                .with_multiplier(1.5)
                .with_randomization_factor(0.5)
                .with_max_interval(std::time::Duration::from_secs(60))
                .with_max_elapsed_time(Some(std::time::Duration::from_secs(60)))
                .build();

            let _ = backoff::future::retry(exponential_backoff, insert_browser_events)
                .await
                .map_err(|e| {
                    log::error!("Failed to insert chunk of browser events: {:?}", e);
                });
        }

        // Only ack the message after all chunks have been processed
        if let Err(e) = acker.ack().await {
            log::error!("Failed to ack MQ delivery (browser events): {:?}", e);
        }
    }
}
