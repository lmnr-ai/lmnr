//! This module is responsible for postprocessing responses from the signal events.
//!
//! It is responsible for:
//! - Clustering the signal events
//! - Sending notifications to the users

use std::sync::Arc;
use uuid::Uuid;

use crate::ch::notification_logs::{CHNotificationLog, insert_notification_logs};
use crate::ch::signal_events::CHSignalEvent;
use crate::clustering::queue::push_to_event_clustering_queue;
use crate::db;
use crate::features::{Feature, is_feature_enabled};
use crate::mq::MessageQueue;
use crate::notifications::{
    self, EventIdentificationPayload, NotificationType, SlackMessagePayload,
};

/// Process notifications and clustering for an identified signal event
pub async fn process_event_notifications_and_clustering(
    db: Arc<db::DB>,
    queue: Arc<MessageQueue>,
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    trace_id: Uuid,
    signal_event: CHSignalEvent,
) -> anyhow::Result<()> {
    let event_name = signal_event.name().to_string();
    let attributes = signal_event.payload_value().unwrap_or_default();

    let targets =
        db::alert_targets::get_slack_targets_for_event(&db.pool, project_id, &event_name).await?;

    let now_ms = chrono::Utc::now().timestamp_millis();
    let mut queued_notifications = Vec::new();

    for target in &targets {
        let payload = EventIdentificationPayload {
            event_name: event_name.to_string(),
            extracted_information: Some(attributes.clone()),
            channel_id: target.channel_id.clone(),
            integration_id: target.integration_id,
        };

        let message_payload =
            serde_json::to_value(SlackMessagePayload::EventIdentification(payload))?;

        let notification_message = notifications::NotificationMessage {
            project_id,
            trace_id,
            notification_type: NotificationType::Slack,
            event_name: event_name.to_string(),
            payload: message_payload.clone(),
        };

        match notifications::push_to_notification_queue(notification_message, queue.clone()).await {
            Ok(()) => queued_notifications.push((target, message_payload)),
            Err(e) => {
                log::error!(
                    "Failed to push to notification queue for channel {}: {:?}",
                    target.channel_id,
                    e
                );
            }
        }
    }

    // Log only successfully queued alert notifications to ClickHouse
    let notification_logs: Vec<CHNotificationLog> = queued_notifications
        .iter()
        .map(|(target, message_payload)| CHNotificationLog {
            id: Uuid::new_v4(),
            workspace_id: target.workspace_id,
            project_id,
            definition_type: "ALERT".to_string(),
            definition_id: target.alert_id,
            target_id: target.id,
            target_type: "SLACK".to_string(),
            payload: message_payload.to_string(),
            created_at: now_ms,
        })
        .collect();

    if let Err(e) = insert_notification_logs(clickhouse, notification_logs).await {
        log::error!(
            "Failed to insert alert notification log for event {}: {:?}",
            event_name,
            e
        );
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
