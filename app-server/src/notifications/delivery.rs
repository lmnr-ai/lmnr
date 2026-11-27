//! notification_deliveries_consumer — stage 2: format + send + log
//!
//! This module handles the final delivery of notifications to email and Slack
//! targets. It receives `NotificationDeliveryMessage`s from the deliveries queue,
//! formats the content, sends it, and records the delivery in ClickHouse.

use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use backon::Retryable;
use resend_rs::Resend;
use resend_rs::types::{CreateAttachment, CreateEmailBaseOptions, EmailTemplate};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{
    MetricAlertNotification, NotificationKind, TargetType,
    email::{self, EmailBody},
    slack::{self, SlackMessage, ThreadReply},
};
use crate::ch::notification_deliveries::CHNotificationDelivery;
use crate::ch::service::ClickhouseService;
use crate::db::{
    DB,
    metric_alerts::{get_incident, replace_slack_thread, set_slack_thread},
};
use crate::metric_alerts::engine::TransitionKind;
use crate::mq::{MessageQueue, MessageQueueTrait};
use crate::utils::retry;
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
                .map(|(notification_id, kind)| CHNotificationDelivery {
                    workspace_id: message.workspace_id,
                    project_id: kind.project_id(),
                    notification_id: *notification_id,
                    delivery_id: Uuid::new_v4(),
                    target_id: message.target.target_id,
                    target_type: message.target.target_type.to_string(),
                    message: raw_message.clone(),
                    created_at: now_ms,
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

        // Slack is a paid feature: a Free workspace keeps its integration but gets no deliveries.
        if integration.free_tier {
            return Ok(None);
        }

        let decrypted_token = slack::decode_slack_token(
            &integration.team_id,
            &integration.nonce_hex,
            &integration.token,
        )
        .map_err(|e| {
            HandlerError::permanent(anyhow::anyhow!("Failed to decode Slack token: {}", e))
        })?;

        // Metric alerts keep one thread per incident, so they pick their own layout.
        if let Some(NotificationKind::MetricAlert(alert)) = message.notifications.first() {
            return self
                .send_metric_alert_to_slack(&decrypted_token, channel_id, alert)
                .await;
        }

        let blocks =
            slack::format_message_blocks_batch(&message.notifications, message.workspace_id);

        let slack_message = SlackMessage {
            channel_id,
            blocks: &blocks,
            text: None,
            reply: None,
        };
        slack::send_message(&self.slack_client, &decrypted_token, &slack_message)
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

    /// Sends a metric alert: the first message about an incident in a channel
    /// starts a thread, everything after it replies there.
    async fn send_metric_alert_to_slack(
        &self,
        token: &str,
        channel_id: &str,
        alert: &MetricAlertNotification,
    ) -> Result<Option<String>, HandlerError> {
        let pool = &self.db.pool;
        let incident = get_incident(pool, &alert.project_id, &alert.incident_id)
            .await
            .map_err(|e| {
                HandlerError::transient(anyhow::anyhow!("Failed to get incident: {}", e))
            })?;
        // The rule was deleted while the message was queued.
        let Some(incident) = incident else {
            return Ok(None);
        };
        let thread_ts = incident.slack_threads.0.get(channel_id);

        if let Some(thread_ts) = thread_ts {
            let blocks = slack::metric_alert::reply_blocks(alert);
            let reply = SlackMessage {
                channel_id,
                blocks: &blocks,
                text: Some(slack::metric_alert::fallback_text(alert)),
                reply: Some(ThreadReply {
                    thread_ts,
                    // The channel sees an incident get worse or come back;
                    // everything else stays in the thread.
                    broadcast: matches!(
                        alert.transition,
                        TransitionKind::Escalated | TransitionKind::Reopened
                    ),
                }),
            };
            match slack::send_message(&self.slack_client, token, &reply).await {
                Ok(_) => return Ok(Some(blocks.to_string())),
                // The message that opened the thread was deleted: start a new one.
                Err(e) if e.is_thread_not_found() => {}
                Err(e) => {
                    return Err(HandlerError::transient(anyhow::anyhow!(
                        "Failed to send Slack reply: {}",
                        e
                    )));
                }
            }
        }

        let blocks = slack::metric_alert::message_blocks(alert);
        let opener = SlackMessage {
            channel_id,
            blocks: &blocks,
            text: Some(slack::metric_alert::fallback_text(alert)),
            reply: None,
        };
        let message_ts = slack::send_message(&self.slack_client, token, &opener)
            .await
            .map_err(|e| {
                HandlerError::transient(anyhow::anyhow!("Failed to send Slack message: {}", e))
            })?;

        let stored = if thread_ts.is_some() {
            replace_slack_thread(
                pool,
                &alert.project_id,
                &alert.incident_id,
                channel_id,
                &message_ts,
            )
            .await
        } else {
            set_slack_thread(
                pool,
                &alert.project_id,
                &alert.incident_id,
                channel_id,
                &message_ts,
            )
            .await
        };
        // The message is out, and a retry would post it twice. Without the
        // thread the next message about this incident starts one.
        if let Err(e) = stored {
            log::error!(
                "[NotificationDelivery] Failed to store Slack thread for incident {}: {:?}",
                alert.incident_id,
                e
            );
        }

        Ok(Some(blocks.to_string()))
    }

    /// Format and send an email combining all notifications in the batch.
    /// Returns `Ok(Some(raw_message))` on success — the email HTML, or the
    /// template id and variables for template-rendered emails — and `Ok(None)`
    /// if delivery was skipped.
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

        // Email carries the turning points of an incident, not its reminders.
        if let Some(NotificationKind::MetricAlert(alert)) = message.notifications.first()
            && !alert.is_major()
        {
            return Ok(None);
        }

        let content = email::format_email_batch(&message.notifications, &message.workspace_id);

        let email_opts =
            CreateEmailBaseOptions::new(&content.from, [recipient.as_str()], &content.subject);
        let (email_opts, raw_message) = match content.body {
            // Inline-rendered emails reference the logo by content id.
            EmailBody::Html(html) => {
                let mut email_opts = email_opts.with_html(&html).with_attachment(
                    CreateAttachment::from_content(LAMINAR_LOGO_PNG.to_vec())
                        .with_filename("logo.png")
                        .with_content_type("image/png")
                        .with_content_id(LAMINAR_LOGO_CID),
                );
                // Only referenced icons: clients list unreferenced inline images as attachments.
                for (cid, png) in email::SEVERITY_ICONS {
                    if html.contains(&format!("cid:{cid}")) {
                        email_opts = email_opts.with_attachment(
                            CreateAttachment::from_content(png.to_vec())
                                .with_filename(&format!("{cid}.png"))
                                .with_content_type("image/png")
                                .with_content_id(cid),
                        );
                    }
                }
                (email_opts, html)
            }
            EmailBody::Template { id, variables } => {
                let raw_message =
                    serde_json::json!({ "template": id, "variables": variables }).to_string();
                (
                    email_opts.with_template(EmailTemplate::new(&id).with_variables(variables)),
                    raw_message,
                )
            }
        };

        match send_email_with_retry(&resend, email_opts).await {
            Ok(response) => {
                log::info!(
                    "[NotificationDelivery] Email sent ({} items). Email ID: {:?}",
                    message.notifications.len(),
                    response.id
                );
            }
            // The emails endpoint itself always exists, so a 404 is a missing
            // template; retrying cannot fix it.
            Err(resend_rs::Error::Resend(e)) if e.status_code == 404 => {
                return Err(HandlerError::permanent(anyhow::anyhow!(
                    "Failed to send email, Resend template not found: {}",
                    e
                )));
            }
            Err(e) => {
                log::error!("[NotificationDelivery] Failed to send email: {:?}", e);
                return Err(HandlerError::transient(anyhow::anyhow!(
                    "Failed to send email: {:?}",
                    e
                )));
            }
        }

        Ok(Some(raw_message))
    }
}

async fn send_email_with_retry(
    resend: &Resend,
    email: CreateEmailBaseOptions,
) -> resend_rs::Result<resend_rs::types::CreateEmailResponse> {
    let backoff = retry::bounded_delay(
        Duration::from_secs(1),
        Duration::from_secs(60),
        Duration::from_secs(10),
    );

    (|| async { resend.emails.send(email.clone()).await })
        .retry(backoff)
        .when(|e| matches!(e, resend_rs::Error::RateLimit { .. }))
        .notify(|_, _| log::info!("[NotificationDelivery] Rate limited, will retry"))
        .await
}
