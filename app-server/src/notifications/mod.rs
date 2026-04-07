use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use backoff::ExponentialBackoffBuilder;
use resend_rs::Resend;
use resend_rs::types::{CreateAttachment, CreateEmailBaseOptions};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::cache::{Cache, CacheTrait, keys::USAGE_WARNING_SEND_LOCK_KEY};
use crate::ch::notifications::{CHNotification, CHNotificationDelivery};
use crate::ch::service::ClickhouseService;
use crate::db::usage_warnings::{self, UsageItem};
use crate::db::{self, DB};
use crate::mq::{MessageQueue, MessageQueueTrait};
use crate::reports::email_template::ReportData;
use crate::worker::{HandlerError, MessageHandler};

mod email;
mod slack;

pub const NOTIFICATIONS_EXCHANGE: &str = "notifications";
pub const NOTIFICATIONS_QUEUE: &str = "notifications";
pub const NOTIFICATIONS_ROUTING_KEY: &str = "notifications";

const LAMINAR_LOGO_PNG: &[u8] = include_bytes!("../../data/logo.png");
const LAMINAR_LOGO_CID: &str = "laminar-logo";

/// How long the per-notification send lock is held. Long enough to cover email
/// delivery + DB write; short enough to allow retry if the worker crashes.
const USAGE_WARNING_SEND_LOCK_TTL_SECONDS: u64 = 300; // 5 minutes

const ALERT_FROM_EMAIL: &str = "Laminar <alerts@mail.lmnr.ai>";
const REPORT_FROM_EMAIL: &str = "Laminar <reports@mail.lmnr.ai>";
const USAGE_WARNING_FROM_EMAIL: &str = "Laminar <usage@mail.lmnr.ai>";

/// Core notification event data for a signal event alert.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EventIdentificationPayload {
    pub project_id: Uuid,
    pub trace_id: Uuid,
    pub event_name: String,
    pub extracted_information: Option<serde_json::Value>,
}

/// Core notification event data for a signals report.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SignalReportPayload {
    pub report_id: Uuid,
    pub report: ReportData,
    pub title: String,
}

/// Core notification event data for a usage warning.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct UsageWarningPayload {
    pub workspace_name: String,
    pub usage_item: UsageItem,
    pub limit_value: i64,
    pub formatted_limit: String,
    pub usage_label: String,
    pub warning_id: Uuid,
}

/// The kind of notification event. The consumer uses this to determine
/// how to format messages and where to fetch targets.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum NotificationKind {
    EventIdentification(EventIdentificationPayload),
    SignalReport(SignalReportPayload),
    UsageWarning(UsageWarningPayload),
}

impl NotificationKind {
    pub fn kind_str(&self) -> &'static str {
        match self {
            Self::EventIdentification(_) => "EVENT_IDENTIFICATION",
            Self::SignalReport(_) => "SIGNAL_REPORT",
            Self::UsageWarning(_) => "USAGE_WARNING",
        }
    }
}

/// A notification message sent through the queue.
///
/// Producers are responsible only for specifying what notification event happened.
/// The consumer handles: fetching receivers, formatting messages, and delivery.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct NotificationMessage {
    pub workspace_id: Uuid,
    pub payload: NotificationKind,
}

/// Push a notification message to the notification queue.
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
        "Pushed notification message to queue: workspace_id={}, kind={}",
        message.workspace_id,
        message.payload.kind_str(),
    );

    Ok(())
}

/// Handler for notifications
pub struct NotificationHandler {
    pub db: Arc<DB>,
    pub cache: Arc<Cache>,
    pub slack_client: reqwest::Client,
    pub resend: Option<Arc<Resend>>,
    pub ch_service: Arc<ClickhouseService>,
}

impl NotificationHandler {
    pub fn new(
        db: Arc<DB>,
        cache: Arc<Cache>,
        slack_client: reqwest::Client,
        resend: Option<Arc<Resend>>,
        ch_service: Arc<ClickhouseService>,
    ) -> Self {
        Self {
            db,
            cache,
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
        let workspace_id = message.workspace_id;
        let notification_kind = message.payload.kind_str().to_string();
        let notification_id = Uuid::new_v4();

        // Serialize the payload for storage in the notifications table
        let payload_json =
            serde_json::to_string(&message.payload).unwrap_or_else(|_| "{}".to_string());

        // For usage warnings, run the dedup check *before* inserting the
        // notification record so that duplicate messages don't leave orphan rows
        // in the `notifications` table.
        if let NotificationKind::UsageWarning(ref payload) = message.payload {
            if !self.acquire_usage_warning_lock(payload).await? {
                return Ok(());
            }
        }

        // Insert into `notifications` table (one entry per event)
        let now_ms = chrono::Utc::now().timestamp_millis();
        let ch_notification = CHNotification {
            id: notification_id,
            workspace_id,
            notification_kind: notification_kind.clone(),
            payload: payload_json,
            created_at: now_ms,
        };

        if let Err(e) = self
            .ch_service
            .insert_batch_for_workspace(workspace_id, &[ch_notification])
            .await
        {
            log::error!("Failed to insert notification: {:?}", e);
        }

        // Dispatch based on notification kind
        match message.payload {
            NotificationKind::EventIdentification(payload) => {
                self.handle_event_identification(workspace_id, notification_id, &payload)
                    .await?;
            }
            NotificationKind::SignalReport(payload) => {
                self.handle_signal_report(workspace_id, notification_id, &payload)
                    .await?;
            }
            NotificationKind::UsageWarning(payload) => {
                // Lock already acquired above; proceed directly to sending.
                // If the handler fails (e.g. transient DB error fetching owner
                // emails), release the lock so that a retry can re-acquire it
                // instead of being silently dropped as a duplicate.
                if let Err(e) = self
                    .handle_usage_warning(workspace_id, notification_id, &payload)
                    .await
                {
                    let lock_key = format!("{USAGE_WARNING_SEND_LOCK_KEY}:{}", payload.warning_id);
                    if let Err(release_err) = self.cache.release_lock(&lock_key).await {
                        log::warn!(
                            "[Notifications] Failed to release usage warning lock for [{}]: {:?}",
                            payload.warning_id,
                            release_err
                        );
                    }
                    return Err(e);
                }
            }
        }

        Ok(())
    }
}

/// Target information for delivering notifications
struct DeliveryTarget {
    channel: DeliveryChannel,
}

enum DeliveryChannel {
    Email {
        address: String,
    },
    Slack {
        channel_id: String,
        integration_id: Uuid,
    },
}

impl DeliveryTarget {
    /// Build a list of delivery targets from raw DB target rows.
    /// Works with any type that has the standard target fields
    /// (type, email, channel_id, integration_id).
    fn from_raw_targets(
        targets: &[(String, Option<String>, Option<String>, Option<Uuid>)],
    ) -> Vec<Self> {
        targets
            .iter()
            .filter_map(|(target_type, email, channel_id, integration_id)| {
                match target_type.as_str() {
                    "EMAIL" => email.as_ref().map(|email| DeliveryTarget {
                        channel: DeliveryChannel::Email {
                            address: email.clone(),
                        },
                    }),
                    "SLACK" => match (channel_id, integration_id) {
                        (Some(channel_id), Some(integration_id)) => Some(DeliveryTarget {
                            channel: DeliveryChannel::Slack {
                                channel_id: channel_id.clone(),
                                integration_id: *integration_id,
                            },
                        }),
                        _ => None,
                    },
                    _ => None,
                }
            })
            .collect()
    }
}

impl NotificationHandler {
    /// Handle an event identification (alert) notification.
    /// Fetches alert targets from DB, then sends to each.
    async fn handle_event_identification(
        &self,
        workspace_id: Uuid,
        notification_id: Uuid,
        payload: &EventIdentificationPayload,
    ) -> Result<(), HandlerError> {
        let targets = db::alert_targets::get_targets_for_event(
            &self.db.pool,
            payload.project_id,
            &payload.event_name,
        )
        .await
        .map_err(|e| {
            HandlerError::transient(anyhow::anyhow!("Failed to fetch alert targets: {}", e))
        })?;

        let raw: Vec<_> = targets
            .iter()
            .map(|t| {
                (
                    t.r#type.clone(),
                    t.email.clone(),
                    t.channel_id.clone(),
                    t.integration_id,
                )
            })
            .collect();
        let delivery_targets = DeliveryTarget::from_raw_targets(&raw);

        let email_subject = format!("Alert: {}", payload.event_name);
        let email_html = email::render_alert_email(payload);
        let slack_blocks = slack::format_event_identification_blocks(payload);

        self.deliver_to_targets(
            workspace_id,
            notification_id,
            &delivery_targets,
            ALERT_FROM_EMAIL,
            &email_subject,
            &email_html,
            &slack_blocks,
        )
        .await;

        Ok(())
    }

    /// Handle a signal report notification.
    /// Fetches report targets from DB, then sends to each.
    async fn handle_signal_report(
        &self,
        workspace_id: Uuid,
        notification_id: Uuid,
        payload: &SignalReportPayload,
    ) -> Result<(), HandlerError> {
        let targets =
            db::reports::get_report_targets(&self.db.pool, &payload.report_id, &workspace_id)
                .await
                .map_err(|e| {
                    HandlerError::transient(anyhow::anyhow!(
                        "Failed to fetch report targets: {}",
                        e
                    ))
                })?;

        let raw: Vec<_> = targets
            .iter()
            .map(|t| {
                (
                    t.r#type.clone(),
                    t.email.clone(),
                    t.channel_id.clone(),
                    t.integration_id,
                )
            })
            .collect();
        let delivery_targets = DeliveryTarget::from_raw_targets(&raw);

        if delivery_targets.is_empty() {
            log::info!(
                "[Notifications] No targets found for signal report in workspace {}",
                workspace_id
            );
            return Ok(());
        }

        let email_html = email::render_report_email(&payload.report);
        let email_subject = payload.title.clone();
        let slack_blocks = slack::format_report_blocks(payload);

        self.deliver_to_targets(
            workspace_id,
            notification_id,
            &delivery_targets,
            REPORT_FROM_EMAIL,
            &email_subject,
            &email_html,
            &slack_blocks,
        )
        .await;

        Ok(())
    }

    /// Try to acquire the dedup lock for a usage warning. Returns `true` if
    /// the lock was acquired (i.e. processing should proceed), `false` if
    /// another worker already holds it (i.e. this is a duplicate).
    async fn acquire_usage_warning_lock(
        &self,
        payload: &UsageWarningPayload,
    ) -> Result<bool, HandlerError> {
        let lock_key = format!("{USAGE_WARNING_SEND_LOCK_KEY}:{}", payload.warning_id);
        match self
            .cache
            .try_acquire_lock(&lock_key, USAGE_WARNING_SEND_LOCK_TTL_SECONDS)
            .await
        {
            Ok(true) => Ok(true),
            Ok(false) => {
                log::debug!(
                    "[Notifications] Usage warning send lock held for warning [{}], skipping",
                    payload.warning_id
                );
                Ok(false)
            }
            Err(e) => {
                log::warn!(
                    "[Notifications] Failed to acquire send lock for warning [{}]: {:?}",
                    payload.warning_id,
                    e
                );
                Err(HandlerError::Transient(anyhow::anyhow!(
                    "Cache error when trying to acquire lock for usage warning cache {}",
                    e
                )))
            }
        }
    }

    /// Handle a usage warning notification.
    /// Fetches workspace owner emails, then sends email notification.
    /// The dedup lock must already be acquired before calling this method.
    async fn handle_usage_warning(
        &self,
        workspace_id: Uuid,
        notification_id: Uuid,
        payload: &UsageWarningPayload,
    ) -> Result<(), HandlerError> {
        let owner_emails = usage_warnings::get_workspace_owner_emails(&self.db.pool, workspace_id)
            .await
            .map_err(|e| {
                HandlerError::transient(anyhow::anyhow!("Failed to get owner emails: {}", e))
            })?;

        if owner_emails.is_empty() {
            log::warn!(
                "[Notifications] No owner emails found for workspace [{}], skipping usage warning",
                workspace_id
            );
            return Ok(());
        }

        let subject = format!(
            "Usage warning: {} reached {} \u{2013} {}",
            payload.usage_label, payload.formatted_limit, payload.workspace_name
        );
        let html = email::render_usage_warning_email(payload, workspace_id);

        for email_address in &owner_emails {
            let delivered = self
                .send_email(
                    USAGE_WARNING_FROM_EMAIL,
                    &[email_address.clone()],
                    &subject,
                    &html,
                    true,
                )
                .await;
            self.log_delivery(
                workspace_id,
                notification_id,
                "EMAIL",
                email_address,
                delivered,
            )
            .await;
        }

        Ok(())
    }

    /// Send an email via Resend. Returns true if sent successfully.
    async fn send_email(
        &self,
        from: &str,
        to: &[String],
        subject: &str,
        html: &str,
        inline_logo: bool,
    ) -> bool {
        let resend = match &self.resend {
            Some(r) => r.clone(),
            None => {
                log::warn!(
                    "[Notifications] Resend client not configured (RESEND_API_KEY not set), \
                     skipping email notification"
                );
                return false;
            }
        };

        let mut success = false;
        for recipient in to {
            let mut email_options =
                CreateEmailBaseOptions::new(from, [recipient.as_str()], subject).with_html(html);

            if inline_logo {
                email_options = email_options.with_attachment(
                    CreateAttachment::from_content(LAMINAR_LOGO_PNG.to_vec())
                        .with_filename("logo.png")
                        .with_content_type("image/png")
                        .with_content_id(LAMINAR_LOGO_CID),
                );
            }

            match send_email_with_retry(&resend, email_options).await {
                Ok(response) => {
                    log::info!(
                        "[Notifications] Email sent to recipient. Email ID: {:?}",
                        response.id
                    );
                    success = true;
                }
                Err(e) => {
                    log::error!("[Notifications] Failed to send email: {:?}", e);
                }
            }
        }

        success
    }

    /// Send a Slack message. Returns true if sent successfully.
    async fn send_slack(
        &self,
        integration_id: &Uuid,
        channel_id: &str,
        blocks: serde_json::Value,
    ) -> bool {
        let integration = match crate::db::slack_integrations::get_integration_by_id(
            &self.db.pool,
            integration_id,
        )
        .await
        {
            Ok(Some(i)) => i,
            Ok(None) => {
                log::warn!(
                    "Slack integration not found for integration_id: {}",
                    integration_id
                );
                return false;
            }
            Err(e) => {
                log::error!("Failed to get Slack integration: {}", e);
                return false;
            }
        };

        let decrypted_token = match slack::decode_slack_token(
            &integration.team_id,
            &integration.nonce_hex,
            &integration.token,
        ) {
            Ok(t) => t,
            Err(e) => {
                log::error!("Failed to decode Slack token: {}", e);
                return false;
            }
        };

        match slack::send_message(&self.slack_client, &decrypted_token, channel_id, blocks).await {
            Ok(()) => true,
            Err(e) => {
                log::error!("Failed to send Slack message: {}", e);
                false
            }
        }
    }

    /// Deliver to all targets, logging each delivery attempt.
    async fn deliver_to_targets(
        &self,
        workspace_id: Uuid,
        notification_id: Uuid,
        targets: &[DeliveryTarget],
        from_email: &str,
        email_subject: &str,
        email_html: &str,
        slack_blocks: &serde_json::Value,
    ) {
        for target in targets {
            match &target.channel {
                DeliveryChannel::Email { address } => {
                    let delivered = self
                        .send_email(
                            from_email,
                            &[address.clone()],
                            email_subject,
                            email_html,
                            true,
                        )
                        .await;
                    self.log_delivery(workspace_id, notification_id, "EMAIL", address, delivered)
                        .await;
                }
                DeliveryChannel::Slack {
                    channel_id,
                    integration_id,
                } => {
                    let delivered = self
                        .send_slack(integration_id, channel_id, slack_blocks.clone())
                        .await;
                    self.log_delivery(
                        workspace_id,
                        notification_id,
                        "SLACK",
                        channel_id,
                        delivered,
                    )
                    .await;
                }
            }
        }
    }

    /// Log a delivery attempt to the `notification_deliveries` ClickHouse table.
    async fn log_delivery(
        &self,
        workspace_id: Uuid,
        notification_id: Uuid,
        channel: &str,
        destination: &str,
        delivered: bool,
    ) {
        let now_ms = chrono::Utc::now().timestamp_millis();
        let delivery = CHNotificationDelivery {
            id: Uuid::new_v4(),
            notification_id,
            workspace_id,
            channel: channel.to_string(),
            destination: destination.to_string(),
            delivered,
            created_at: now_ms,
        };

        if let Err(e) = self
            .ch_service
            .insert_batch_for_workspace(workspace_id, &[delivery])
            .await
        {
            log::error!("Failed to insert notification delivery log: {:?}", e);
        }
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
