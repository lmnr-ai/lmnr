use std::sync::Arc;

use backoff::ExponentialBackoffBuilder;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    api::v1::browser_sessions::{
        EventBatch, BROWSER_SESSIONS_EXCHANGE, BROWSER_SESSIONS_QUEUE, BROWSER_SESSIONS_ROUTING_KEY,
    },
    ch::browser_events::insert_browser_events,
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

        let insert_browser_events = || async {
            insert_browser_events(&clickhouse, project_id, &batch).await.map_err(|e| {
                log::error!("Failed attempt to insert browser events. Will retry according to backoff policy. Error: {:?}", e);
                backoff::Error::transient(e)
            })?;

            Ok::<(), backoff::Error<clickhouse::error::Error>>(())
        };
        // Starting with 1 second delay, delay multiplies by random factor between 1 and 2
        // up to 1 minute and until the total elapsed time is 1 minute
        // https://docs.rs/backoff/latest/backoff/default/index.html
        let exponential_backoff = ExponentialBackoffBuilder::new()
            .with_initial_interval(std::time::Duration::from_millis(1000))
            .with_multiplier(1.5)
            .with_randomization_factor(0.5)
            .with_max_interval(std::time::Duration::from_secs(1 * 60))
            .with_max_elapsed_time(Some(std::time::Duration::from_secs(1 * 60)))
            .build();

        match backoff::future::retry(exponential_backoff, insert_browser_events).await {
            Ok(_) => {
                if let Err(e) = acker.ack().await {
                    log::error!("Failed to ack MQ delivery (browser events): {:?}", e);
                }
            }
            Err(e) => {
                log::error!(
                    "Exhausted backoff retries. Failed to insert browser events: {:?}",
                    e
                );
                // TODO: Implement proper nacks and DLX
                if let Err(e) = acker.reject(false).await {
                    log::error!("Failed to reject MQ delivery (browser events): {:?}", e);
                }
            }
        }
    }
}
