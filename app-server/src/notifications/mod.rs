use std::collections::BTreeMap;
use std::sync::Arc;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::cache::{Cache, CacheTrait, keys::USAGE_WARNING_SEND_LOCK_KEY};
use crate::ch::notifications::CHNotification;
use crate::ch::service::ClickhouseService;
use crate::db::DB;
use crate::mq::utils::mq_max_payload;
use crate::mq::{MessageQueue, MessageQueueTrait};
use crate::reports::email_template::NoteworthyEvent;
use crate::worker::{HandlerError, MessageHandler};

pub mod delivery;
mod email;
mod slack;
mod utils;

use delivery::{DeliveryTarget, NotificationDeliveryMessage, push_to_deliveries_queue};

// ── Notifications queue (producers → notifications_consumer) ──

pub const NOTIFICATIONS_EXCHANGE: &str = "notifications";
pub const NOTIFICATIONS_QUEUE: &str = "notifications";
pub const NOTIFICATIONS_ROUTING_KEY: &str = "notifications";

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
#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum NotificationKind {
    EventIdentification {
        project_id: Uuid,
        #[serde(default)]
        signal_id: Uuid,
        trace_id: Uuid,
        #[serde(default)]
        event_id: Option<Uuid>,
        event_name: String,
        severity: u8,
        extracted_information: Option<serde_json::Value>,
        #[serde(default)]
        alert_name: String,
    },
    SignalsReport {
        workspace_name: String,
        project_id: Uuid,
        project_name: String,
        title: String,
        period_label: String,
        period_start: String,
        period_end: String,
        signal_event_counts: BTreeMap<String, u64>,
        ai_summary: String,
        noteworthy_events: Vec<NoteworthyEvent>,
    },
    UsageWarning {
        workspace_name: String,
        usage_label: String,
        formatted_limit: String,
        usage_item: String,
    },
}

// ── NotificationMessage (producers → notifications queue) ──

/// Message pushed to the `notifications` queue by producers (reports generator,
/// signal processor, usage limits checker).
///
/// Contains a list of notification events sharing the same definition. All notifications from
/// the message are delivered together.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct NotificationMessage {
    pub definition_type: NotificationDefinitionType,
    pub definition_id: Uuid,
    pub workspace_id: Uuid,
    /// Optional project scope. Set for alerts and per-project report notifications.
    /// `None` for workspace-level notifications (usage warnings, multi-project reports).
    pub project_id: Option<Uuid>,
    pub notifications: Vec<NotificationKind>,
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
        "Pushed notification message to queue: workspace_id={}, definition_type={}, count={}",
        message.workspace_id,
        message.definition_type,
        message.notifications.len(),
    );

    Ok(())
}

// ══════════════════════════════════════════════════════════════════════════════
// notifications_consumer — stage 1: persist notifications + fan-out to targets
// ══════════════════════════════════════════════════════════════════════════════

/// How long the per-warning dedup lock is held.
/// This prevents concurrent ingestion workers from enqueuing duplicate
/// usage-warning notifications for the same warning definition.
const USAGE_WARNING_SEND_LOCK_TTL_SECONDS: u64 = 300; // 5 minutes

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
        // same warning before mark_warning_as_notified takes effect.
        if message.definition_type == NotificationDefinitionType::UsageWarning {
            let lock_key = format!("{}:{}", USAGE_WARNING_SEND_LOCK_KEY, message.definition_id);
            match self
                .cache
                .try_acquire_lock(&lock_key, USAGE_WARNING_SEND_LOCK_TTL_SECONDS)
                .await
            {
                Ok(true) => {} // Lock acquired – proceed.
                Ok(false) => {
                    log::debug!(
                        "[Notifications] Usage warning send lock held for [{}], skipping",
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

        let now_ms = chrono::Utc::now().timestamp_millis();
        // 1. Persist each notification event to ClickHouse `notifications` table.
        let mut notification_ids = Vec::with_capacity(message.notifications.len());
        let mut ch_notifications = Vec::with_capacity(message.notifications.len());

        for kind in &message.notifications {
            let notification_id = Uuid::new_v4();
            notification_ids.push(notification_id);

            let project_id = match kind {
                NotificationKind::EventIdentification { project_id, .. } => *project_id,
                NotificationKind::SignalsReport { project_id, .. } => *project_id,
                NotificationKind::UsageWarning { .. } => Uuid::nil(),
            };

            let payload = serde_json::to_string(kind).map_err(|e| {
                HandlerError::permanent(anyhow::anyhow!(
                    "Failed to serialize notification_kind: {}",
                    e
                ))
            })?;

            ch_notifications.push(CHNotification {
                notification_id,
                project_id,
                workspace_id: message.workspace_id,
                definition_type: message.definition_type.to_string(),
                definition_id: message.definition_id,
                payload,
                created_at: now_ms,
            });
        }

        if !ch_notifications.is_empty() {
            if let Err(e) = self
                .ch_service
                .insert_batch_for_workspace(message.workspace_id, &ch_notifications)
                .await
            {
                log::error!(
                    "[Notifications] Failed to insert {} notifications to CH: {:?}",
                    ch_notifications.len(),
                    e
                );
                // Non-fatal: continue with delivery fan-out. Blocking delivery on CH
                // availability would be worse than having unmatched IDs in logs.
            }
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

        // 3. Fan-out: publish a delivery message per target with the full list of notifications.
        let mut failures = 0;
        let total = targets.len();

        for target in targets {
            let delivery = NotificationDeliveryMessage {
                workspace_id: message.workspace_id,
                project_id: message.project_id,
                target,
                notification_ids: notification_ids.clone(),
                notifications: message.notifications.clone(),
            };

            let serialized_size = match serde_json::to_vec(&delivery) {
                Ok(v) => v.len(),
                Err(e) => {
                    failures += 1;
                    log::error!(
                        "[Notifications] Failed to serialize delivery message: {:?}, target: {:?}",
                        e,
                        delivery.target,
                    );
                    continue;
                }
            };
            if serialized_size >= mq_max_payload() {
                failures += 1;
                log::error!(
                    "[Notifications] MQ payload limit exceeded for delivery message. \
                     payload size: [{}], target: {:?}",
                    serialized_size,
                    delivery.target,
                );
                continue;
            }

            if let Err(e) = push_to_deliveries_queue(delivery, self.queue.clone()).await {
                failures += 1;
                log::error!("[Notifications] Failed to push delivery message: {:?}", e);
            }
        }

        if failures == total {
            // Release the usage warning dedup lock so the requeued message can
            // re-acquire it on retry. Without this, the lock's TTL would cause
            // the retry to silently skip, permanently losing the notification.
            if message.definition_type == NotificationDefinitionType::UsageWarning {
                let lock_key = format!("{}:{}", USAGE_WARNING_SEND_LOCK_KEY, message.definition_id);
                let _ = self.cache.remove(&lock_key).await;
            }
            return Err(HandlerError::transient(anyhow::anyhow!(
                "Failed to push all {} delivery messages for definition {}",
                total,
                message.definition_id,
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
                let project_id = message.project_id.ok_or_else(|| {
                    HandlerError::permanent(anyhow::anyhow!(
                        "Alert notification must have project_id, definition_id={}",
                        message.definition_id,
                    ))
                })?;

                let targets = crate::db::alert_targets::get_targets_for_alert(
                    &self.db.pool,
                    &message.definition_id,
                    &project_id,
                )
                .await
                .map_err(|e| HandlerError::transient(e))?;

                Ok(targets
                    .into_iter()
                    .filter_map(|t| {
                        let target_type = t.r#type.parse::<TargetType>().ok()?;
                        Some(DeliveryTarget {
                            target_id: t.id,
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
                            target_id: t.id,
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
                        target_id: Uuid::nil(),
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
