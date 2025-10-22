use std::sync::Arc;

use backoff::ExponentialBackoffBuilder;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    api::v1::browser_sessions::{
        BROWSER_SESSIONS_EXCHANGE, BROWSER_SESSIONS_QUEUE, BROWSER_SESSIONS_ROUTING_KEY, EventBatch,
    },
    cache::Cache,
    ch::browser_events::insert_browser_events,
    db::DB,
    features::{Feature, is_feature_enabled},
    mq::{MessageQueue, MessageQueueDeliveryTrait, MessageQueueReceiverTrait, MessageQueueTrait},
    traces::limits::update_workspace_limit_exceeded_by_project_id,
};

#[derive(Serialize, Deserialize, Clone)]
pub struct QueueBrowserEventMessage {
    pub batch: EventBatch,
    pub project_id: Uuid,
}

pub async fn process_browser_events(
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    cache: Arc<Cache>,
    browser_events_message_queue: Arc<MessageQueue>,
) {
    loop {
        inner_process_browser_events(
            db.clone(),
            clickhouse.clone(),
            cache.clone(),
            browser_events_message_queue.clone(),
        )
        .await;
    }
}

async fn inner_process_browser_events(
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    cache: Arc<Cache>,
    queue: Arc<MessageQueue>,
) {
    // Add retry logic with exponential backoff for connection failures
    let get_receiver = || async {
        queue
            .get_receiver(
                BROWSER_SESSIONS_QUEUE,
                BROWSER_SESSIONS_EXCHANGE,
                BROWSER_SESSIONS_ROUTING_KEY,
            )
            .await
            .map_err(|e| {
                log::error!("Failed to get receiver from browser events queue: {:?}", e);
                backoff::Error::transient(e)
            })
    };

    let backoff = ExponentialBackoffBuilder::new()
        .with_initial_interval(std::time::Duration::from_secs(1))
        .with_max_interval(std::time::Duration::from_secs(60))
        .with_max_elapsed_time(Some(std::time::Duration::from_secs(300))) // 5 minutes max
        .build();

    let mut receiver = match backoff::future::retry(backoff, get_receiver).await {
        Ok(receiver) => {
            log::info!("Successfully connected to browser events queue");
            receiver
        }
        Err(e) => {
            log::error!(
                "Failed to connect to browser events queue after retries: {:?}",
                e
            );
            return;
        }
    };

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

        let insert_browser_events_fn = || async {
            let bytes_written = insert_browser_events(&clickhouse, project_id, &batch).await.map_err(|e| {
                log::error!("Failed attempt to insert browser events. Will retry according to backoff policy. Error: {:?}", e);
                backoff::Error::transient(e)
                })?;

            Ok::<usize, backoff::Error<clickhouse::error::Error>>(bytes_written)
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

        match backoff::future::retry(exponential_backoff, insert_browser_events_fn).await {
            Ok(bytes_written) => {
                if let Err(e) = acker.ack().await {
                    log::error!("Failed to ack MQ delivery (browser events): {:?}", e);
                }

                // Update workspace limits cache
                if is_feature_enabled(Feature::UsageLimit) {
                    if let Err(e) = update_workspace_limit_exceeded_by_project_id(
                        db.clone(),
                        clickhouse.clone(),
                        cache.clone(),
                        project_id,
                        bytes_written,
                    )
                    .await
                    {
                        log::error!(
                            "Failed to update workspace limit exceeded for project [{}]: {:?}",
                            project_id,
                            e
                        );
                    }
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
