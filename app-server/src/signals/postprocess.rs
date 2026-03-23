//! This module is responsible for postprocessing responses from the signal events.
//!
//! It is responsible for:
//! - Clustering the signal events
//! - Sending notifications to the users

use std::sync::Arc;
use uuid::Uuid;

use crate::ch::signal_events::CHSignalEvent;
use crate::clustering::queue::push_to_event_clustering_queue;
use crate::db;
use crate::features::{Feature, is_feature_enabled};
use crate::mq::MessageQueue;
use crate::mq::utils::mq_max_payload;
use crate::notifications::{self, EventIdentificationPayload, NotificationType};

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

    let targets =
        db::alert_targets::get_slack_targets_for_event(&db.pool, project_id, &event_name).await?;

    for target in &targets {
        let payload = EventIdentificationPayload {
            event_name: event_name.to_string(),
            extracted_information: Some(attributes.clone()),
            channel_id: target.channel_id.clone(),
            integration_id: target.integration_id,
        };

        let message_payload = serde_json::to_value(&payload)?;

        let notification_message = notifications::NotificationMessage {
            project_id,
            trace_id,
            notification_type: NotificationType::Slack,
            event_name: event_name.to_string(),
            payload: message_payload,
            workspace_id: target.workspace_id,
            definition_type: "ALERT".to_string(),
            definition_id: target.alert_id,
            target_id: target.id,
            target_type: "SLACK".to_string(),
        };

        let serialized_size = serde_json::to_vec(&notification_message)
            .map(|v| v.len())
            .unwrap_or(0);
        if serialized_size >= mq_max_payload() {
            log::warn!(
                "MQ payload limit exceeded for channel {}: payload size [{}]",
                target.channel_id,
                serialized_size,
            );
            continue;
        }

        if let Err(e) =
            notifications::push_to_notification_queue(notification_message, queue.clone()).await
        {
            log::error!(
                "Failed to push to notification queue for channel {}: {:?}",
                target.channel_id,
                e
            );
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
