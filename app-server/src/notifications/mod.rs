use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use backoff::ExponentialBackoffBuilder;
use resend_rs::Resend;
use resend_rs::types::{CreateAttachment, CreateEmailBaseOptions};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::ch::notification_logs::CHNotificationLog;
use crate::ch::service::ClickhouseService;
use crate::db::DB;
use crate::mq::{MessageQueue, MessageQueueTrait};
use crate::worker::{HandlerError, MessageHandler};

mod slack;
pub use slack::{EventIdentificationPayload, ReportPayload, SlackMessagePayload};

pub const NOTIFICATIONS_EXCHANGE: &str = "notifications";
pub const NOTIFICATIONS_QUEUE: &str = "notifications";
pub const NOTIFICATIONS_ROUTING_KEY: &str = "notifications";

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum NotificationType {
    Slack,
    Email,
}

/// The delivery channel for a notification target, as stored in the database.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TargetType {
    Email,
    Slack,
}

impl std::str::FromStr for TargetType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "EMAIL" => Ok(Self::Email),
            "SLACK" => Ok(Self::Slack),
            other => Err(format!("unknown target type: {other}")),
        }
    }
}

impl std::fmt::Display for TargetType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Email => f.write_str("EMAIL"),
            Self::Slack => f.write_str("SLACK"),
        }
    }
}

impl From<TargetType> for NotificationType {
    fn from(t: TargetType) -> Self {
        match t {
            TargetType::Email => Self::Email,
            TargetType::Slack => Self::Slack,
        }
    }
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
    /// The notification payload. For both Slack and Email this is the inner struct
    /// (e.g. `EventIdentificationPayload` or `EmailPayload`) — no enum wrapper.
    /// The handler wraps it as needed for delivery and logs it directly to ClickHouse.
    pub payload: serde_json::Value,
    /// Metadata for notification logging.
    /// Fields below use `serde(default)` for backward compatibility with in-flight
    /// messages enqueued before this schema change.
    #[serde(default)]
    pub workspace_id: Uuid,
    #[serde(default)]
    pub definition_type: String,
    #[serde(default)]
    pub definition_id: Uuid,
    #[serde(default)]
    pub target_id: Uuid,
    #[serde(default)]
    pub target_type: String,
}

/// Push a notification message to the notification queue.
///
/// Returns a plain `anyhow::Result` – callers on the handler side are responsible
/// for checking payload size and mapping errors to `HandlerError` variants.
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
    pub ch_service: Arc<ClickhouseService>,
}

impl NotificationHandler {
    pub fn new(
        db: Arc<DB>,
        slack_client: reqwest::Client,
        resend: Option<Arc<Resend>>,
        ch_service: Arc<ClickhouseService>,
    ) -> Self {
        Self {
            db,
            slack_client,
            resend,
            ch_service,
        }
    }
}

#[async_trait]
impl MessageHandler for NotificationHandler {
    type Message = NotificationMessage;

    async fn handle(&self, message: Self::Message) -> Result<(), HandlerError> {
        let delivered = match message.notification_type {
            NotificationType::Slack => self.handle_slack(&message).await?,
            NotificationType::Email => self.handle_email(&message).await?,
        };

        if delivered {
            let now_ms = chrono::Utc::now().timestamp_millis();
            let log_entry = CHNotificationLog {
                id: Uuid::new_v4(),
                workspace_id: message.workspace_id,
                project_id: message.project_id,
                definition_type: message.definition_type,
                definition_id: message.definition_id,
                target_id: message.target_id,
                target_type: message.target_type,
                payload: message.payload.to_string(),
                created_at: now_ms,
            };

            if let Err(e) = self
                .ch_service
                .insert_batch_for_workspace(message.workspace_id, &[log_entry])
                .await
            {
                log::error!("Failed to insert notification log: {:?}", e);
            }
        }

        Ok(())
    }
}

impl NotificationHandler {
    /// Returns `Ok(true)` if the Slack message was actually sent,
    /// `Ok(false)` if delivery was skipped (e.g. integration not found).
    async fn handle_slack(&self, message: &NotificationMessage) -> Result<bool, HandlerError> {
        let slack_payload = serde_json::from_value::<EventIdentificationPayload>(
            message.payload.clone(),
        )
        .map(SlackMessagePayload::EventIdentification)
        .or_else(|_| {
            serde_json::from_value::<slack::ReportPayload>(message.payload.clone())
                .map(SlackMessagePayload::Report)
        })
        .or_else(|_| {
            serde_json::from_value::<SlackMessagePayload>(message.payload.clone())
        })
        .map_err(|e| anyhow::anyhow!("Failed to parse Slack payload: {}", e))?;

        let integration = crate::db::slack_integrations::get_integration_by_id(
            &self.db.pool,
            slack_payload.integration_id(),
        )
        .await
        .map_err(|e| anyhow::anyhow!("Failed to get Slack integration: {}", e))?;

        let Some(integration) = integration else {
            log::warn!(
                "Slack integration not found for integration_id: {}",
                slack_payload.integration_id()
            );
            return Ok(false);
        };

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

        Ok(true)
    }

    /// Returns `Ok(true)` if the email was actually sent to at least one recipient,
    /// `Ok(false)` if delivery was skipped (e.g. Resend not configured, no recipients).
    async fn handle_email(&self, message: &NotificationMessage) -> Result<bool, HandlerError> {
        let resend = match &self.resend {
            Some(r) => r.clone(),
            None => {
                log::warn!(
                    "[Notifications] Resend client not configured (RESEND_API_KEY not set), \
                     skipping email notification"
                );
                return Ok(false);
            }
        };

        let email_payload: EmailPayload = serde_json::from_value(message.payload.clone())
            .map_err(|e| anyhow::anyhow!("Failed to parse EmailPayload: {}", e))?;

        if email_payload.to.is_empty() {
            log::warn!("[Notifications] Email notification has no recipients, skipping");
            return Ok(false);
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

        Ok(true)
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
