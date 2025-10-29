use std::collections::HashMap;
use std::sync::Arc;

use backoff::ExponentialBackoffBuilder;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::mq::{
    MessageQueue, MessageQueueAcker, MessageQueueDeliveryTrait, MessageQueueReceiverTrait,
    MessageQueueTrait,
};

pub const NOTIFICATIONS_EXCHANGE: &str = "notifications";
pub const NOTIFICATIONS_QUEUE: &str = "notifications";
pub const NOTIFICATIONS_ROUTING_KEY: &str = "notifications";

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TraceAnalysisPayload {
    pub summary: String,
    pub analysis: String,
    pub analysis_preview: String,
    pub span_ids_map: HashMap<String, String>,
    pub channel_id: String,
    pub integration_id: Uuid,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct NotificationMessage {
    pub project_id: Uuid,
    pub trace_id: Uuid,
    pub span_id: Uuid,
    #[serde(rename = "type")]
    pub notification_type: String,
    pub event_name: String,
    pub payload: serde_json::Value,
}

/// Push a notification message to the notification queue
pub async fn push_to_notification_queue(
    message: NotificationMessage,
    queue: Arc<MessageQueue>,
) -> anyhow::Result<()> {
    let serialized = serde_json::to_vec(&message)?;

    queue
        .publish(
            &serialized,
            NOTIFICATIONS_EXCHANGE,
            NOTIFICATIONS_ROUTING_KEY,
        )
        .await?;

    log::debug!(
        "Pushed notification message to queue: project_id={}, trace_id={}, span_id={}, event_name={}",
        message.project_id,
        message.trace_id,
        message.span_id,
        message.event_name
    );

    Ok(())
}

/// Main worker function to process notification messages
pub async fn process_notifications(queue: Arc<MessageQueue>) {
    loop {
        inner_process_notifications(queue.clone()).await;
        log::warn!("Notification listener exited. Rebinding queue connection...");
    }
}

async fn inner_process_notifications(queue: Arc<MessageQueue>) {
    // Add retry logic with exponential backoff for connection failures
    let get_receiver = || async {
        queue
            .get_receiver(
                NOTIFICATIONS_QUEUE,
                NOTIFICATIONS_EXCHANGE,
                NOTIFICATIONS_ROUTING_KEY,
            )
            .await
            .map_err(|e| {
                log::error!("Failed to get receiver from notification queue: {:?}", e);
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
            log::info!("Successfully connected to notification queue");
            receiver
        }
        Err(e) => {
            log::error!(
                "Failed to connect to notification queue after retries: {:?}",
                e
            );
            return;
        }
    };

    log::info!("Started processing notifications from queue");

    while let Some(delivery) = receiver.receive().await {
        if let Err(e) = delivery {
            log::error!("Failed to receive message from notification queue: {:?}", e);
            continue;
        }
        let delivery = delivery.unwrap();
        let acker = delivery.acker();
        let notification_message =
            match serde_json::from_slice::<NotificationMessage>(&delivery.data()) {
                Ok(message) => message,
                Err(e) => {
                    log::error!("Failed to deserialize notification message: {:?}", e);
                    let _ = acker.reject(false).await;
                    continue;
                }
            };

        // Process the notification
        if let Err(e) = process_single_notification(notification_message, acker).await {
            log::error!("Failed to process notification: {:?}", e);
        }
    }

    log::warn!("Notification queue closed connection. Shutting down notification listener");
}

async fn process_single_notification(
    message: NotificationMessage,
    acker: MessageQueueAcker,
) -> anyhow::Result<()> {
    log::info!(
        "Processing notification: project_id={}, trace_id={}, span_id={}, type={}, event_name={}",
        message.project_id,
        message.trace_id,
        message.span_id,
        message.notification_type,
        message.event_name
    );

    // TODO: Implement actual notification processing logic here

    // Acknowledge the message
    if let Err(e) = acker.ack().await {
        log::error!("Failed to ack notification message: {:?}", e);
    }

    Ok(())
}
