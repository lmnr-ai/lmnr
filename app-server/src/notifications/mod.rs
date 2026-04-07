use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use backoff::ExponentialBackoffBuilder;
use resend_rs::Resend;
use resend_rs::types::{CreateAttachment, CreateEmailBaseOptions};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::cache::{Cache, CacheTrait, keys::USAGE_WARNING_NOTIFICATION_LOCK_KEY};
use crate::ch::notification_logs::CHNotificationLog;
use crate::ch::notifications::CHNotification;
use crate::ch::service::ClickhouseService;
use crate::db::DB;
use crate::mq::{MessageQueue, MessageQueueTrait};
use crate::reports::email_template::ReportData;
use crate::worker::{HandlerError, MessageHandler};

mod email;
mod slack;

// ── Notifications queue (producers → notifications_consumer) ──

pub const NOTIFICATIONS_EXCHANGE: &str = "notifications";
pub const NOTIFICATIONS_QUEUE: &str = "notifications";
pub const NOTIFICATIONS_ROUTING_KEY: &str = "notifications";

// ── Notification deliveries queue (notifications_consumer → deliveries_consumer) ──

pub const NOTIFICATION_DELIVERIES_EXCHANGE: &str = "notification_deliveries";
pub const NOTIFICATION_DELIVERIES_QUEUE: &str = "notification_deliveries";
pub const NOTIFICATION_DELIVERIES_ROUTING_KEY: &str = "notification_deliveries";

// ── Shared types ──

/// The delivery channel for a notification target, as stored in the database.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
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

#[derive(Serialize, Deserialize, Debug, Clone, Eq, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum NotificationDefinitionType {
    Alert,
    Report,
    UsageWarning,
}

impl std::fmt::Display for NotificationDefinitionType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Alert => f.write_str("ALERT"),
            Self::Report => f.write_str("REPORT"),
            Self::UsageWarning => f.write_str("USAGE_WARNING"),
        }
    }
}

// ── Notification kind: the core event data ──

/// Core notification data produced by various subsystems.
/// Contains only the essential event information — no channel IDs, emails, or formatting.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum NotificationKind {
    /// A signal event was detected (alert).
    EventIdentification {
        project_id: Uuid,
        trace_id: Uuid,
        event_name: String,
        extracted_information: Option<serde_json::Value>,
    },
    /// A periodic signals report was generated.
    SignalsReport {
        report_data: ReportData,
        /// Human-readable title, e.g. "Signal Events Summary – My Workspace".
        title: String,
    },
    /// A usage threshold was reached.
    UsageWarning {
        workspace_name: String,
        usage_label: String,
        formatted_limit: String,
        /// "bytes" or "signal_runs"
        usage_item: String,
    },
}

// ── NotificationMessage (producers → notifications queue) ──

/// Message pushed to the `notifications` queue by producers (reports generator,
/// signal postprocessor, usage limits checker).
///
/// Contains only the core event data. Target fetching and formatting happen
/// downstream in the consumer pipeline.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct NotificationMessage {
    pub project_id: Uuid,
    pub workspace_id: Uuid,
    pub definition_type: NotificationDefinitionType,
    pub definition_id: Uuid,
    pub notification_kind: NotificationKind,
}

/// Push a notification message to the notifications queue.
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
        "Pushed notification message to queue: workspace_id={}, definition_type={}",
        message.workspace_id,
        message.definition_type,
    );

    Ok(())
}

// ── NotificationDeliveryMessage (notifications_consumer → deliveries queue) ──

/// A delivery target resolved by the notifications consumer.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DeliveryTarget {
    pub target_type: TargetType,
    /// Email address (for Email targets).
    pub email: Option<String>,
    /// Slack channel ID (for Slack targets).
    pub channel_id: Option<String>,
    /// Slack integration ID (for Slack targets).
    pub integration_id: Option<Uuid>,
}

/// Message pushed to the `notification_deliveries` queue.
/// Contains the notification data plus a resolved delivery target.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct NotificationDeliveryMessage {
    pub notification_id: Uuid,
    pub project_id: Uuid,
    pub workspace_id: Uuid,
    pub definition_type: NotificationDefinitionType,
    pub definition_id: Uuid,
    pub notification_kind: NotificationKind,
    pub target: DeliveryTarget,
}

async fn push_to_deliveries_queue(
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

// ══════════════════════════════════════════════════════════════════════════════
// notifications_consumer — stage 1: persist notification + fan-out to targets
// ══════════════════════════════════════════════════════════════════════════════

/// How long the per-warning dedup lock is held in stage 1.
/// This prevents concurrent ingestion workers from enqueuing duplicate
/// usage-warning notifications for the same warning definition.
const USAGE_WARNING_NOTIFICATION_LOCK_TTL_SECONDS: u64 = 300; // 5 minutes

pub struct NotificationHandler {
    pub db: Arc<DB>,
    pub cache: Arc<Cache>,
    pub queue: Arc<MessageQueue>,
    pub ch_service: Arc<ClickhouseService>,
}

impl NotificationHandler {
    pub fn new(
        db: Arc<DB>,
        cache: Arc<Cache>,
        queue: Arc<MessageQueue>,
        ch_service: Arc<ClickhouseService>,
    ) -> Self {
        Self {
            db,
            cache,
            queue,
            ch_service,
        }
    }
}

#[async_trait]
impl MessageHandler for NotificationHandler {
    type Message = NotificationMessage;

    async fn handle(&self, message: Self::Message) -> Result<(), HandlerError> {
        // For usage warnings, acquire a dedup lock keyed on definition_id (the
        // warning row). Multiple ingestion workers can race through
        // check_soft_limits and enqueue duplicate NotificationMessages for the
        // same warning before mark_warning_as_notified takes effect. The lock
        // here in stage 1 (before fan-out) deduplicates without blocking the
        // per-owner fan-out that stage 2 performs.
        if message.definition_type == NotificationDefinitionType::UsageWarning {
            let lock_key = format!(
                "{}:{}",
                USAGE_WARNING_NOTIFICATION_LOCK_KEY, message.definition_id
            );
            match self
                .cache
                .try_acquire_lock(&lock_key, USAGE_WARNING_NOTIFICATION_LOCK_TTL_SECONDS)
                .await
            {
                Ok(true) => {} // Lock acquired – proceed.
                Ok(false) => {
                    log::debug!(
                        "[Notifications] Usage warning dedup lock held for [{}], skipping",
                        message.definition_id
                    );
                    return Ok(());
                }
                Err(e) => {
                    return Err(HandlerError::Transient(anyhow::anyhow!(
                        "Cache error acquiring usage warning notification lock: {}",
                        e
                    )));
                }
            }
        }

        let notification_id = Uuid::new_v4();
        let now_ms = chrono::Utc::now().timestamp_millis();

        // 1. Persist the raw notification event to ClickHouse `notifications` table.
        let notification_data = serde_json::to_string(&message.notification_kind).map_err(|e| {
            HandlerError::permanent(anyhow::anyhow!(
                "Failed to serialize notification_kind: {}",
                e
            ))
        })?;

        let ch_notification = CHNotification {
            id: notification_id,
            project_id: message.project_id,
            workspace_id: message.workspace_id,
            definition_type: message.definition_type.to_string(),
            notification_data,
            created_at: now_ms,
        };

        if let Err(e) = self
            .ch_service
            .insert_batch_for_workspace(message.workspace_id, &[ch_notification])
            .await
        {
            log::error!(
                "[Notifications] Failed to insert notification to CH: {:?}",
                e
            );
            // Non-fatal: continue with delivery fan-out.
        }

        // 2. Fetch targets based on definition_type.
        let targets = self.fetch_targets(&message).await?;

        if targets.is_empty() {
            log::info!(
                "[Notifications] No targets for definition_type={}, definition_id={}",
                message.definition_type,
                message.definition_id,
            );
            return Ok(());
        }

        // 3. Fan-out: publish a delivery message per target.
        let mut failures = 0;
        let total = targets.len();

        for target in targets {
            let delivery = NotificationDeliveryMessage {
                notification_id,
                project_id: message.project_id,
                workspace_id: message.workspace_id,
                definition_type: message.definition_type.clone(),
                definition_id: message.definition_id,
                notification_kind: message.notification_kind.clone(),
                target,
            };

            if let Err(e) = push_to_deliveries_queue(delivery, self.queue.clone()).await {
                failures += 1;
                log::error!("[Notifications] Failed to push delivery message: {:?}", e);
            }
        }

        if failures == total {
            return Err(HandlerError::transient(anyhow::anyhow!(
                "Failed to push all {} delivery messages for notification {}",
                total,
                notification_id,
            )));
        }

        Ok(())
    }
}

impl NotificationHandler {
    /// Fetch delivery targets based on the notification definition type.
    async fn fetch_targets(
        &self,
        message: &NotificationMessage,
    ) -> Result<Vec<DeliveryTarget>, HandlerError> {
        match message.definition_type {
            NotificationDefinitionType::Alert => {
                let NotificationKind::EventIdentification {
                    project_id,
                    ref event_name,
                    ..
                } = message.notification_kind
                else {
                    return Err(HandlerError::permanent(anyhow::anyhow!(
                        "Alert notification must have EventIdentification kind"
                    )));
                };

                let targets = crate::db::alert_targets::get_targets_for_event(
                    &self.db.pool,
                    project_id,
                    event_name,
                )
                .await
                .map_err(|e| HandlerError::transient(e))?;

                // Filter to only the targets belonging to this specific alert
                // (definition_id). The query returns targets for all alerts
                // matching the event name; without this filter, multiple alerts
                // on the same signal would cause duplicate deliveries.
                Ok(targets
                    .into_iter()
                    .filter(|t| t.alert_id == message.definition_id)
                    .filter_map(|t| {
                        let target_type = t.r#type.parse::<TargetType>().ok()?;
                        Some(DeliveryTarget {
                            target_type,
                            email: t.email,
                            channel_id: t.channel_id,
                            integration_id: t.integration_id,
                        })
                    })
                    .collect())
            }
            NotificationDefinitionType::Report => {
                let targets = crate::db::reports::get_report_targets(
                    &self.db.pool,
                    &message.definition_id,
                    &message.workspace_id,
                )
                .await
                .map_err(|e| HandlerError::transient(e))?;

                Ok(targets
                    .into_iter()
                    .filter_map(|t| {
                        let target_type = t.r#type.parse::<TargetType>().ok()?;
                        Some(DeliveryTarget {
                            target_type,
                            email: t.email,
                            channel_id: t.channel_id,
                            integration_id: t.integration_id,
                        })
                    })
                    .collect())
            }
            NotificationDefinitionType::UsageWarning => {
                // Usage warnings go to workspace owners via email.
                let owner_emails = crate::db::usage_warnings::get_workspace_owner_emails(
                    &self.db.pool,
                    message.workspace_id,
                )
                .await
                .map_err(|e| HandlerError::transient(e))?;

                Ok(owner_emails
                    .into_iter()
                    .map(|email| DeliveryTarget {
                        target_type: TargetType::Email,
                        email: Some(email),
                        channel_id: None,
                        integration_id: None,
                    })
                    .collect())
            }
        }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// notification_deliveries_consumer — stage 2: format + send + log
// ══════════════════════════════════════════════════════════════════════════════

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
        let delivered = match message.target.target_type {
            TargetType::Slack => self.handle_slack(&message).await?,
            TargetType::Email => self.handle_email(&message).await?,
        };

        if delivered {
            let now_ms = chrono::Utc::now().timestamp_millis();
            let log_entry = CHNotificationLog {
                id: Uuid::new_v4(),
                workspace_id: message.workspace_id,
                project_id: message.project_id,
                definition_type: message.definition_type.to_string(),
                definition_id: message.definition_id,
                // target_id is Uuid::nil() because delivery targets are no longer
                // identified by a DB row id in the new pipeline. The actual target
                // is described by target_type + the notification_kind payload.
                target_id: Uuid::nil(),
                target_type: message.target.target_type.to_string(),
                payload: match serde_json::to_string(&message.notification_kind) {
                    Ok(s) => s,
                    Err(e) => {
                        log::error!(
                            "[NotificationDelivery] Failed to serialize notification_kind for log: {:?}",
                            e
                        );
                        String::new()
                    }
                },
                created_at: now_ms,
            };

            if let Err(e) = self
                .ch_service
                .insert_batch_for_workspace(message.workspace_id, &[log_entry])
                .await
            {
                log::error!(
                    "[NotificationDelivery] Failed to insert notification log: {:?}",
                    e
                );
            }
        }

        Ok(())
    }
}

impl NotificationDeliveryHandler {
    /// Format and send a Slack notification.
    async fn handle_slack(
        &self,
        message: &NotificationDeliveryMessage,
    ) -> Result<bool, HandlerError> {
        let (Some(channel_id), Some(integration_id)) =
            (&message.target.channel_id, message.target.integration_id)
        else {
            log::warn!("[NotificationDelivery] Slack target missing channel_id or integration_id");
            return Ok(false);
        };

        let integration =
            crate::db::slack_integrations::get_integration_by_id(&self.db.pool, &integration_id)
                .await
                .map_err(|e| anyhow::anyhow!("Failed to get Slack integration: {}", e))?;

        let Some(integration) = integration else {
            log::warn!(
                "[NotificationDelivery] Slack integration not found: {}",
                integration_id
            );
            return Ok(false);
        };

        let decrypted_token = slack::decode_slack_token(
            &integration.team_id,
            &integration.nonce_hex,
            &integration.token,
        )
        .map_err(|e| anyhow::anyhow!("Failed to decode Slack token: {}", e))?;

        let blocks = slack::format_message_blocks(&message.notification_kind);

        slack::send_message(&self.slack_client, &decrypted_token, channel_id, blocks)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to send Slack message: {}", e))?;

        log::debug!(
            "[NotificationDelivery] Slack notification sent for notification_id={}",
            message.notification_id
        );

        Ok(true)
    }

    /// Format and send an email notification.
    async fn handle_email(
        &self,
        message: &NotificationDeliveryMessage,
    ) -> Result<bool, HandlerError> {
        // Usage-warning deduplication is handled upstream in stage 1 (check_soft_limits
        // in limits.rs uses last_notified_at per billing cycle). No per-delivery lock
        // is needed here — doing so would block multi-owner fan-out since all deliveries
        // share the same definition_id.

        let resend = match &self.resend {
            Some(r) => r.clone(),
            None => {
                log::warn!("[NotificationDelivery] Resend client not configured, skipping email");
                return Ok(false);
            }
        };

        let Some(ref recipient) = message.target.email else {
            log::warn!("[NotificationDelivery] Email target missing email address");
            return Ok(false);
        };

        // Format the email based on notification kind.
        let (from, subject, html) =
            email::format_email(&message.notification_kind, &message.workspace_id);

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
                    "[NotificationDelivery] Email sent. Email ID: {:?}",
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
                    log::info!("[NotificationDelivery] Rate limited, will retry");
                    backoff::Error::transient(e)
                }
                _ => backoff::Error::permanent(e),
            })
    })
    .await
}
