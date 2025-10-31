use std::sync::Arc;

use backoff::ExponentialBackoffBuilder;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::DB;
use crate::mq::{
    MessageQueue, MessageQueueAcker, MessageQueueDeliveryTrait, MessageQueueReceiverTrait,
    MessageQueueTrait,
};

mod slack;
pub use slack::{EventIdentificationPayload, SlackMessagePayload, TraceAnalysisPayload};

pub const NOTIFICATIONS_EXCHANGE: &str = "notifications";
pub const NOTIFICATIONS_QUEUE: &str = "notifications";
pub const NOTIFICATIONS_ROUTING_KEY: &str = "notifications";

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum NotificationType {
    Slack,
}
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct NotificationMessage {
    pub project_id: Uuid,
    pub trace_id: Uuid,
    pub span_id: Uuid,
    #[serde(rename = "type")]
    pub notification_type: NotificationType,
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
pub async fn process_notifications(
    db: Arc<DB>,
    slack_client: Arc<Client>,
    queue: Arc<MessageQueue>,
) {
    loop {
        inner_process_notifications(db.clone(), slack_client.clone(), queue.clone()).await;
        log::warn!("Notification listener exited. Rebinding queue connection...");
    }
}

async fn inner_process_notifications(
    db: Arc<DB>,
    slack_client: Arc<Client>,
    queue: Arc<MessageQueue>,
) {
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

        if let Err(e) = process_single_notification(
            &db.pool,
            slack_client.as_ref(),
            notification_message,
            acker,
        )
        .await
        {
            log::error!("Failed to process notification: {:?}", e);
        }
    }

    log::warn!("Notification queue closed connection. Shutting down notification listener");
}

async fn process_single_notification(
    pool: &sqlx::PgPool,
    slack_client: &Client,
    message: NotificationMessage,
    acker: MessageQueueAcker,
) -> anyhow::Result<()> {
    log::info!(
        "Processing notification: project_id={}, trace_id={}, span_id={}, event_name={}",
        message.project_id,
        message.trace_id,
        message.span_id,
        message.event_name
    );

    let result = match message.notification_type {
        NotificationType::Slack => {
            let slack_payload: SlackMessagePayload =
                serde_json::from_value(message.payload.clone())
                    .map_err(|e| anyhow::anyhow!("Failed to parse SlackMessagePayload: {}", e))?;

            let integration_id = match &slack_payload {
                SlackMessagePayload::TraceAnalysis(payload) => payload.integration_id,
                SlackMessagePayload::EventIdentification(payload) => payload.integration_id,
            };

            let integration =
                crate::db::slack_integrations::get_integration_by_id(pool, &integration_id).await?;

            if let Some(integration) = integration {
                let decrypted_token = slack::decode_slack_token(
                    &integration.team_id,
                    &integration.nonce_hex,
                    &integration.token,
                )?;

                // Build blocks from the payload
                let blocks = slack::format_message_blocks(
                    &slack_payload,
                    &message.project_id.to_string(),
                    &message.trace_id.to_string(),
                    &message.event_name,
                );

                // Get the channel ID from the payload
                let channel_id = slack::get_channel_id(&slack_payload);

                // Send the message with blocks and channel_id
                slack::send_message(slack_client, &decrypted_token, channel_id, blocks).await?;

                log::debug!(
                    "Successfully sent Slack notification for trace_id={}",
                    message.trace_id
                );
            }

            Ok(())
        }
        _ => {
            log::warn!("Unknown notification type: {:?}", message.notification_type);
            Ok(())
        }
    };

    match result {
        Ok(_) => {
            if let Err(e) = acker.ack().await {
                log::error!("Failed to ack notification message: {:?}", e);
            }
        }
        Err(e) => {
            log::error!("Error processing notification: {:?}", e);
            if let Err(e) = acker.reject(false).await {
                log::error!("Failed to reject notification message: {:?}", e);
            }
            return Err(e);
        }
    }

    Ok(())
}
