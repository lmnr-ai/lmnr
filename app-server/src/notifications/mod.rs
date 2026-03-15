use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use backoff::ExponentialBackoffBuilder;
use resend_rs::Resend;
use resend_rs::types::{CreateAttachment, CreateEmailBaseOptions};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::ch::ClickhouseTrait;
use crate::ch::cloud::CloudClickhouse;
use crate::ch::notification_logs::CHNotificationLog;
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

const LAMINAR_LOGO_PNG: &[u8] = include_bytes!("../../data/logo.png");
const LAMINAR_LOGO_CID: &str = "laminar-logo";

/// Payload for email notifications sent through the notification queue
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EmailPayload {
    pub from: String,
    pub to: Vec<String>,
    pub subject: String,
    pub html: String,
    /// When true, the Laminar logo PNG is attached inline with CID for email rendering.
    #[serde(default)]
    pub inline_logo: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct NotificationMessage {
    pub project_id: Uuid,
    pub trace_id: Uuid,
    #[serde(rename = "type")]
    pub notification_type: NotificationType,
    pub event_name: String,
    pub payload: serde_json::Value,
    /// Metadata for notification logging
    pub workspace_id: Uuid,
    pub definition_type: String,
    pub definition_id: Uuid,
    pub target_id: Uuid,
    pub target_type: String,
    /// Payload serialized for the notification log (inner struct, not the queue envelope)
    pub log_payload: String,
}

/// Push a notification message to the notification queue.
///
/// Returns `HandlerError::Permanent` for payload size violations (retrying won't help)
/// and `HandlerError::Transient` for publish failures (may be a temporary MQ issue).
pub async fn push_to_notification_queue(
    message: NotificationMessage,
    queue: Arc<MessageQueue>,
) -> Result<(), HandlerError> {
    let serialized = serde_json::to_vec(&message)
        .map_err(|e| HandlerError::permanent(anyhow::anyhow!("Failed to serialize notification: {}", e)))?;

    if serialized.len() >= mq_max_payload() {
        log::warn!(
            "[Notifications] MQ payload limit exceeded. payload size: [{}], event_name: [{}]",
            serialized.len(),
            message.event_name,
        );
        return Err(HandlerError::permanent(anyhow::anyhow!(
            "Notification payload size ({} bytes) exceeds MQ limit",
            serialized.len()
        )));
    }

    queue
        .publish(
            &serialized,
            NOTIFICATIONS_EXCHANGE,
            NOTIFICATIONS_ROUTING_KEY,
            None,
        )
        .await
        .map_err(|e| HandlerError::transient(e))?;

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
    pub ch: CloudClickhouse,
}

impl NotificationHandler {
    pub fn new(
        db: Arc<DB>,
        slack_client: reqwest::Client,
        resend: Option<Arc<Resend>>,
        ch: CloudClickhouse,
    ) -> Self {
        Self {
            db,
            slack_client,
            resend,
            ch,
        }
    }
}

#[async_trait]
impl MessageHandler for NotificationHandler {
    type Message = NotificationMessage;

    async fn handle(&self, message: Self::Message) -> Result<(), HandlerError> {
        let result = match message.notification_type {
            NotificationType::Slack => self.handle_slack(&message).await,
            NotificationType::Email => self.handle_email(&message).await,
        };

        if result.is_ok() {
            let now_ms = chrono::Utc::now().timestamp_millis();
            let log_entry = CHNotificationLog {
                id: Uuid::new_v4(),
                workspace_id: message.workspace_id,
                project_id: message.project_id,
                definition_type: message.definition_type,
                definition_id: message.definition_id,
                target_id: message.target_id,
                target_type: message.target_type,
                payload: message.log_payload,
                created_at: now_ms,
            };

            if let Err(e) = self.ch.insert_batch(&[log_entry], None).await {
                log::error!("Failed to insert notification log: {:?}", e);
            }
        }

        result
    }
}

impl NotificationHandler {
    async fn handle_slack(&self, message: &NotificationMessage) -> Result<(), HandlerError> {
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

    async fn handle_email(&self, message: &NotificationMessage) -> Result<(), HandlerError> {
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
            let mut email = CreateEmailBaseOptions::new(
                &email_payload.from,
                [recipient.as_str()],
                &email_payload.subject,
            )
            .with_html(&email_payload.html);

            if email_payload.inline_logo {
                email = email.with_attachment(
                    CreateAttachment::from_content(LAMINAR_LOGO_PNG.to_vec())
                        .with_filename("logo.png")
                        .with_content_type("image/png")
                        .with_content_id(LAMINAR_LOGO_CID),
                );
            }

            match send_email_with_retry(&resend, email).await {
                Ok(response) => {
                    log::info!(
                        "[Notifications] Email sent to recipient. Email ID: {:?}",
                        response.id
                    );
                }
                Err(e) => {
                    send_failures += 1;
                    log::error!("[Notifications] Failed to send email: {:?}", e);
                }
            }
        }

        if send_failures == total {
            // Use permanent error: if every recipient fails, the cause is most likely
            // a configuration issue (invalid API key, bad sender domain, etc.) that
            // will not resolve on retry. This is consistent with the Slack handler.
            return Err(HandlerError::permanent(anyhow::anyhow!(
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

async fn send_email_with_retry(
    resend: &Resend,
    email: CreateEmailBaseOptions,
) -> resend_rs::Result<resend_rs::types::CreateEmailResponse> {
    let backoff = ExponentialBackoffBuilder::new()
        .with_initial_interval(Duration::from_secs(1))
        .with_max_elapsed_time(Some(Duration::from_secs(10)))
        .build();

    backoff::future::retry(backoff, || async {
        resend
            .emails
            .send(email.clone())
            .await
            .map_err(|e| match &e {
                resend_rs::Error::RateLimit { .. } => {
                    log::info!("[Notifications] Rate limited, will retry");
                    backoff::Error::transient(e)
                }
                _ => backoff::Error::permanent(e),
            })
    })
    .await
}
