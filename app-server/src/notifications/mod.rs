use std::sync::Arc;

use async_trait::async_trait;
use resend_rs::types::CreateEmailBaseOptions;
use resend_rs::Resend;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::DB;
use crate::mq::{MessageQueue, MessageQueueTrait, utils::mq_max_payload};
use crate::worker::{HandlerError, MessageHandler};

mod slack;
pub use slack::{EventIdentificationPayload, SlackMessagePayload};

pub const NOTIFICATIONS_EXCHANGE: &str = "notifications";
pub const NOTIFICATIONS_QUEUE: &str = "notifications";
pub const NOTIFICATIONS_ROUTING_KEY: &str = "notifications";

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum NotificationType {
    Slack,
    Email,
}

/// Payload for email notifications sent through the notification queue
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EmailPayload {
    pub from: String,
    pub to: Vec<String>,
    pub subject: String,
    pub html: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct NotificationMessage {
    pub project_id: Uuid,
    pub trace_id: Uuid,
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

    if serialized.len() >= mq_max_payload() {
        log::warn!(
            "[Notifications] MQ payload limit exceeded. payload size: [{}], event_name: [{}]",
            serialized.len(),
            message.event_name,
        );
        return Err(anyhow::anyhow!(
            "Notification payload size ({} bytes) exceeds MQ limit",
            serialized.len()
        ));
    }

    queue
        .publish(
            &serialized,
            NOTIFICATIONS_EXCHANGE,
            NOTIFICATIONS_ROUTING_KEY,
            None,
        )
        .await?;

    log::debug!(
        "Pushed notification message to queue: project_id={}, trace_id={}, event_name={}",
        message.project_id,
        message.trace_id,
        message.event_name
    );

    Ok(())
}

/// Handler for notifications
pub struct NotificationHandler {
    pub db: Arc<DB>,
    pub slack_client: reqwest::Client,
    pub resend: Option<Arc<Resend>>,
}

impl NotificationHandler {
    pub fn new(db: Arc<DB>, slack_client: reqwest::Client, resend: Option<Arc<Resend>>) -> Self {
        Self {
            db,
            slack_client,
            resend,
        }
    }
}

#[async_trait]
impl MessageHandler for NotificationHandler {
    type Message = NotificationMessage;

    async fn handle(&self, message: Self::Message) -> Result<(), HandlerError> {
        match message.notification_type {
            NotificationType::Slack => self.handle_slack(message).await,
            NotificationType::Email => self.handle_email(message).await,
        }
    }
}

impl NotificationHandler {
    async fn handle_slack(&self, message: NotificationMessage) -> Result<(), HandlerError> {
        let slack_payload: SlackMessagePayload = serde_json::from_value(message.payload.clone())
            .map_err(|e| anyhow::anyhow!("Failed to parse SlackMessagePayload: {}", e))?;

        let integration_id = match &slack_payload {
            SlackMessagePayload::EventIdentification(payload) => payload.integration_id,
        };

        let integration =
            crate::db::slack_integrations::get_integration_by_id(&self.db.pool, &integration_id)
                .await
                .map_err(|e| anyhow::anyhow!("Failed to get Slack integration: {}", e))?;

        if let Some(integration) = integration {
            let decrypted_token = slack::decode_slack_token(
                &integration.team_id,
                &integration.nonce_hex,
                &integration.token,
            )
            .map_err(|e| anyhow::anyhow!("Failed to decode Slack token: {}", e))?;

            let blocks = slack::format_message_blocks(
                &slack_payload,
                &message.project_id.to_string(),
                &message.trace_id.to_string(),
                &message.event_name,
            );

            let channel_id = slack::get_channel_id(&slack_payload);

            slack::send_message(&self.slack_client, &decrypted_token, channel_id, blocks)
                .await
                .map_err(|e| anyhow::anyhow!("Failed to send Slack message: {}", e))?;

            log::debug!(
                "Successfully sent Slack notification for trace_id={}",
                message.trace_id
            );
        } else {
            log::warn!(
                "Slack integration not found for integration_id: {}",
                integration_id
            );
        }

        Ok(())
    }

    async fn handle_email(&self, message: NotificationMessage) -> Result<(), HandlerError> {
        let resend = match &self.resend {
            Some(r) => r.clone(),
            None => {
                log::warn!(
                    "[Notifications] Resend client not configured (RESEND_API_KEY not set), \
                     skipping email notification"
                );
                return Ok(());
            }
        };

        let email_payload: EmailPayload = serde_json::from_value(message.payload.clone())
            .map_err(|e| anyhow::anyhow!("Failed to parse EmailPayload: {}", e))?;

        if email_payload.to.is_empty() {
            log::warn!("[Notifications] Email notification has no recipients, skipping");
            return Ok(());
        }

        let mut send_failures = 0;
        let total = email_payload.to.len();

        for recipient in &email_payload.to {
            let email = CreateEmailBaseOptions::new(
                &email_payload.from,
                [recipient.as_str()],
                &email_payload.subject,
            )
            .with_html(&email_payload.html);

            match resend.emails.send(email).await {
                Ok(response) => {
                    log::info!(
                        "[Notifications] Email sent to recipient. Email ID: {:?}",
                        response.id
                    );
                }
                Err(e) => {
                    send_failures += 1;
                    log::error!(
                        "[Notifications] Failed to send email: {:?}",
                        e
                    );
                }
            }
        }

        if send_failures == total {
            return Err(HandlerError::transient(anyhow::anyhow!(
                "Failed to send email to all {} recipients",
                total
            )));
        }

        if send_failures > 0 {
            log::warn!(
                "[Notifications] Failed to send email to {}/{} recipients",
                send_failures,
                total
            );
        }

        Ok(())
    }
}
