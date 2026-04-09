//! notification_deliveries_consumer — stage 2: format + send + log
//!
//! This module handles the final delivery of notifications to email and Slack
//! targets. It receives `NotificationDeliveryMessage`s from the deliveries queue,
//! formats the content, sends it, and records the delivery in ClickHouse.

use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use backoff::ExponentialBackoffBuilder;
use resend_rs::Resend;
use resend_rs::types::{CreateAttachment, CreateEmailBaseOptions};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{NotificationKind, TargetType, email, slack};
use crate::ch::notification_deliveries::CHNotificationDelivery;
use crate::ch::service::ClickhouseService;
use crate::db::DB;
use crate::mq::{MessageQueue, MessageQueueTrait};
use crate::worker::{HandlerError, MessageHandler};

// ── Notification deliveries queue (notifications_consumer → deliveries_consumer) ──

pub const NOTIFICATION_DELIVERIES_EXCHANGE: &str = "notification_deliveries";
pub const NOTIFICATION_DELIVERIES_QUEUE: &str = "notification_deliveries";
pub const NOTIFICATION_DELIVERIES_ROUTING_KEY: &str = "notification_deliveries";

// ── NotificationDeliveryMessage (notifications_consumer → deliveries queue) ──

/// A delivery target resolved by the notifications consumer.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DeliveryTarget {
    pub target_id: Uuid,
    pub target_type: TargetType,
    pub email: Option<String>,
    pub channel_id: Option<String>,
    pub integration_id: Option<Uuid>,
}

/// Message pushed to the `notification_deliveries` queue.
/// Contains the target info at the top level and the list of notification events.
/// The deliveries consumer combines all notifications into a single email/slack message.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct NotificationDeliveryMessage {
    pub workspace_id: Uuid,
    pub project_id: Option<Uuid>, // optional for workspace-level notifications
    pub target: DeliveryTarget,
    /// IDs assigned to each notification. Matches `notifications` order.
    pub notification_ids: Vec<Uuid>,
    pub notifications: Vec<NotificationKind>,
}

pub(crate) async fn push_to_deliveries_queue(
    message: NotificationDeliveryMessage,
    queue: Arc<MessageQueue>,
) -> anyhow::Result<()> {
    let serialized = serde_json::to_vec(&message)?;

    queue
        .publish(
            &serialized,
            NOTIFICATION_DELIVERIES_EXCHANGE,
            NOTIFICATION_DELIVERIES_ROUTING_KEY,
            None,
        )
        .await?;

    Ok(())
}

const LAMINAR_LOGO_PNG: &[u8] = include_bytes!("../../data/logo.png");
const LAMINAR_LOGO_CID: &str = "laminar-logo";

pub struct NotificationDeliveryHandler {
    pub db: Arc<DB>,
    pub slack_client: reqwest::Client,
    pub resend: Option<Arc<Resend>>,
    pub ch_service: Arc<ClickhouseService>,
}

impl NotificationDeliveryHandler {
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
impl MessageHandler for NotificationDeliveryHandler {
    type Message = NotificationDeliveryMessage;

    async fn handle(&self, message: Self::Message) -> Result<(), HandlerError> {
        let raw_message = match message.target.target_type {
            TargetType::Slack => self.handle_slack(&message).await?,
            TargetType::Email => self.handle_email(&message).await?,
        };

        if let Some(raw_message) = raw_message {
            let now_ms = chrono::Utc::now().timestamp_millis();

            // Record one delivery entry per notification in the batch.
            let delivery_entries: Vec<CHNotificationDelivery> = message
                .notification_ids
                .iter()
                .zip(message.notifications.iter())
                .map(|(notification_id, kind)| {
                    let project_id = match kind {
                        NotificationKind::EventIdentification { project_id, .. } => *project_id,
                        NotificationKind::SignalsReport { project_id, .. } => *project_id,
                        _ => Uuid::nil(), // some notifications are workspace-level
                    };
                    CHNotificationDelivery {
                        workspace_id: message.workspace_id,
                        project_id,
                        notification_id: *notification_id,
                        delivery_id: Uuid::new_v4(),
                        target_id: message.target.target_id,
                        target_type: message.target.target_type.to_string(),
                        message: raw_message.clone(),
                        created_at: now_ms,
                    }
                })
                .collect();

            if !delivery_entries.is_empty() {
                if let Err(e) = self
                    .ch_service
                    .insert_batch_for_workspace(message.workspace_id, &delivery_entries)
                    .await
                {
                    log::error!(
                        "[NotificationDelivery] Failed to insert {} delivery records: {:?}",
                        delivery_entries.len(),
                        e
                    );
                }
            }
        }

        Ok(())
    }
}

impl NotificationDeliveryHandler {
    /// Format and send a Slack notification combining all notifications in the batch.
    /// Returns `Ok(Some(raw_message))` with the Slack blocks JSON on success,
    /// `Ok(None)` if delivery was skipped.
    async fn handle_slack(
        &self,
        message: &NotificationDeliveryMessage,
    ) -> Result<Option<String>, HandlerError> {
        let (Some(channel_id), Some(integration_id)) =
            (&message.target.channel_id, message.target.integration_id)
        else {
            log::error!("[NotificationDelivery] Slack target missing channel_id or integration_id");
            return Ok(None);
        };

        let integration =
            crate::db::slack_integrations::get_integration_by_id(&self.db.pool, &integration_id)
                .await
                .map_err(|e| {
                    HandlerError::transient(anyhow::anyhow!(
                        "Failed to get Slack integration: {}",
                        e
                    ))
                })?;

        let Some(integration) = integration else {
            log::error!(
                "[NotificationDelivery] Slack integration not found: {}",
                integration_id
            );
            return Ok(None);
        };

        let decrypted_token = slack::decode_slack_token(
            &integration.team_id,
            &integration.nonce_hex,
            &integration.token,
        )
        .map_err(|e| anyhow::anyhow!("Failed to decode Slack token: {}", e))?;

        let blocks =
            slack::format_message_blocks_batch(&message.notifications, message.workspace_id);

        slack::send_message(
            &self.slack_client,
            &decrypted_token,
            channel_id,
            blocks.clone(),
        )
        .await
        .map_err(|e| {
            HandlerError::transient(anyhow::anyhow!("Failed to send Slack message: {}", e))
        })?;

        log::debug!(
            "[NotificationDelivery] Slack notification sent ({} items)",
            message.notifications.len(),
        );

        let raw_message = serde_json::to_string(&blocks).unwrap_or_default();
        Ok(Some(raw_message))
    }

    /// Format and send an email combining all notifications in the batch.
    /// Returns `Ok(Some(html))` with the raw email HTML on success,
    /// `Ok(None)` if delivery was skipped.
    async fn handle_email(
        &self,
        message: &NotificationDeliveryMessage,
    ) -> Result<Option<String>, HandlerError> {
        let resend = match &self.resend {
            Some(r) => r.clone(),
            None => {
                log::error!("[NotificationDelivery] Resend client not configured, skipping email");
                return Ok(None);
            }
        };

        let Some(ref recipient) = message.target.email else {
            log::error!("[NotificationDelivery] Email target missing email address");
            return Ok(None);
        };

        // Format the email combining all notifications in the batch.
        let (from, subject, html) =
            email::format_email_batch(&message.notifications, &message.workspace_id);

        let mut email_opts =
            CreateEmailBaseOptions::new(&from, [recipient.as_str()], &subject).with_html(&html);

        // Attach inline logo for all notification emails.
        email_opts = email_opts.with_attachment(
            CreateAttachment::from_content(LAMINAR_LOGO_PNG.to_vec())
                .with_filename("logo.png")
                .with_content_type("image/png")
                .with_content_id(LAMINAR_LOGO_CID),
        );

        match send_email_with_retry(&resend, email_opts).await {
            Ok(response) => {
                log::info!(
                    "[NotificationDelivery] Email sent ({} items). Email ID: {:?}",
                    message.notifications.len(),
                    response.id
                );
            }
            Err(e) => {
                log::error!("[NotificationDelivery] Failed to send email: {:?}", e);
                return Err(HandlerError::permanent(anyhow::anyhow!(
                    "Failed to send email: {:?}",
                    e
                )));
            }
        }

        Ok(Some(html))
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
                    log::info!("[NotificationDelivery] Rate limited, will retry");
                    backoff::Error::transient(e)
                }
                _ => backoff::Error::permanent(e),
            })
    })
    .await
}
