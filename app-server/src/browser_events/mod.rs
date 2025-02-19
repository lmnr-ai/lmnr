use std::sync::Arc;

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

        // We could further tune async_insert by setting
        // - `async_insert_max_data_size` (bytes)
        // - `async_insert_busy_timeout_ms`
        // These are defaulted globally to 10MiB and 1000ms respectively.
        // More: https://clickhouse.com/docs/en/optimize/asynchronous-inserts
        let mut query = String::from(
            "
        INSERT INTO browser_session_events (
            event_id, session_id, trace_id, timestamp,
            event_type, data, project_id
        )
        SETTINGS async_insert = 1,
            wait_for_async_insert = 1
        VALUES ",
        );

        for i in 0..batch.events.len() {
            if i > 0 {
                query.push_str(", ");
            }
            query.push_str("(generateUUIDv4(), ?, ?, ?, ?, ?, ?)");
        }

        let values = batch
            .events
            .into_iter()
            .flat_map(|event| {
                vec![
                    batch.session_id.to_string(),
                    batch.trace_id.to_string(),
                    event.timestamp.to_string(),
                    event.event_type.to_string(),
                    // TODO: see if we can get away with not cloning the data
                    // for now it is causing issues with temporary lifetimes.
                    event.data.get().to_string(),
                    project_id.to_string(),
                ]
            })
            .collect::<Vec<_>>();

        // Execute batch insert with individual bindings
        let mut query_with_bindings = clickhouse.query(&query);
        for value in values {
            query_with_bindings = query_with_bindings.bind(value);
        }
        let final_query = query_with_bindings;
        let insert_browser_events = || async {
            final_query.clone().execute().await
                .map_err(|e| {
                    log::error!(
                        "Failed attempt to insert browser events. Will retry according to backoff policy. Error: {:?}",
                        e
                    );
                    backoff::Error::Transient {
                        err: e,
                        retry_after: None,
                    }
                })
        };

        // Starting with 1 second delay, delay multiplies by random factor between 1 and 2
        // up to 1 minute and until the total elapsed time is 60 seconds
        // https://docs.rs/backoff/latest/backoff/default/index.html
        let exponential_backoff = ExponentialBackoffBuilder::new()
            .with_initial_interval(std::time::Duration::from_millis(1000))
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

        // Only ack the message after all chunks have been processed
        if let Err(e) = acker.ack().await {
            log::error!("Failed to ack MQ delivery (browser events): {:?}", e);
        }
    }
}
