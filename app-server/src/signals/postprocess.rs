//! This module is responsible for postprocessing responses from the signal events.
//!
//! It is responsible for:
//! - Clustering the signal events
//! - Pushing notification messages for detected events

use std::sync::Arc;
use uuid::Uuid;

use crate::ch::signal_events::CHSignalEvent;
use crate::clustering::queue::push_to_event_clustering_queue;
use crate::db;
use crate::features::{Feature, is_feature_enabled};
use crate::mq::MessageQueue;
use crate::mq::utils::mq_max_payload;
use crate::notifications::{self, NotificationDefinitionType, NotificationKind};

/// Process notifications and clustering for an identified signal event
pub async fn process_event_notifications_and_clustering(
    db: Arc<db::DB>,
    queue: Arc<MessageQueue>,
    project_id: Uuid,
    trace_id: Uuid,
    signal_event: CHSignalEvent,
) -> anyhow::Result<()> {
    let event_name = signal_event.name().to_string();
    let attributes = signal_event.payload_value().unwrap_or_default();

    {
        let alerts =
            db::alert_targets::get_alerts_for_event(&db.pool, project_id, &event_name).await?;

        for alert in alerts {
            // Check if the event severity meets the alert's minimum severity threshold.
            // Default to CRITICAL (2) for alerts without metadata (historical data).
            let min_severity = alert
                .metadata
                .as_ref()
                .and_then(|m| m.get("severity"))
                .and_then(|v| v.as_u64())
                .unwrap_or(2) as u8;

            if signal_event.severity < min_severity {
                continue;
            }

            let notification_message = notifications::NotificationMessage {
                definition_type: NotificationDefinitionType::Alert,
                definition_id: alert.alert_id,
                workspace_id: alert.workspace_id,
                project_id: Some(project_id),
                notifications: vec![NotificationKind::EventIdentification {
                    project_id,
                    trace_id,
                    event_name: event_name.clone(),
                    severity: signal_event.severity,
                    extracted_information: Some(attributes.clone()),
                }],
            };

            let serialized_size = serde_json::to_vec(&notification_message)
                .map(|v| v.len())
                .unwrap_or(0);
            if serialized_size >= mq_max_payload() {
                log::error!(
                    "MQ payload limit exceeded for event {}: payload size [{}]",
                    event_name,
                    serialized_size,
                );
            } else if let Err(e) =
                notifications::push_to_notification_queue(notification_message, queue.clone()).await
            {
                log::error!(
                    "Failed to push to notification queue for event {}: {:?}",
                    event_name,
                    e
                );
            }
        }
    }

    if is_feature_enabled(Feature::Clustering) {
        // Check for event clustering configuration
        if let Err(e) =
            push_to_event_clustering_queue(project_id, signal_event, queue.clone()).await
        {
            log::error!(
                "Failed to push to event clustering queue for event {}: {:?}",
                event_name,
                e
            );
        }
    }

    Ok(())
}
