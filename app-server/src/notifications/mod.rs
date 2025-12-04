use std::sync::Arc;

use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::DB;
use crate::mq::{MessageQueue, MessageQueueTrait};
use crate::worker::MessageHandler;

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

/// Handler for notifications
pub struct NotificationHandler {
    pub db: Arc<DB>,
    pub slack_client: Arc<Client>,
}

#[async_trait]
impl MessageHandler for NotificationHandler {
    type Message = NotificationMessage;

    async fn handle(&self, message: Self::Message) -> Result<(), crate::worker::HandlerError> {
        let NotificationType::Slack = message.notification_type;
        
        let slack_payload: SlackMessagePayload = serde_json::from_value(message.payload.clone())
            .map_err(|e| anyhow::anyhow!("Failed to parse SlackMessagePayload: {}", e))?;

        let integration_id = match &slack_payload {
            SlackMessagePayload::TraceAnalysis(payload) => payload.integration_id,
            SlackMessagePayload::EventIdentification(payload) => payload.integration_id,
        };

        let integration = crate::db::slack_integrations::get_integration_by_id(
            &self.db.pool,
            &integration_id,
        )
        .await
        .map_err(|e| anyhow::anyhow!("Failed to get Slack integration: {}", e))?;

        if let Some(integration) = integration {
            let decrypted_token = slack::decode_slack_token(
                &integration.team_id,
                &integration.nonce_hex,
                &integration.token,
            )
            .map_err(|e| anyhow::anyhow!("Failed to decode Slack token: {}", e))?;

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
            slack::send_message(
                self.slack_client.as_ref(),
                &decrypted_token,
                channel_id,
                blocks,
            )
            .await
            .map_err(|e| anyhow::anyhow!("Failed to send Slack message: {}", e))?;

            log::debug!(
                "Successfully sent Slack notification for trace_id={}",
                message.trace_id
            );
        } else {
            log::warn!("Slack integration not found for integration_id: {}", integration_id);
        }

        Ok(())
    }
}
