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

    // Look up the alert definition for this event to get the definition_id and workspace_id.
    let targets =
        db::alert_targets::get_targets_for_event(&db.pool, project_id, &event_name).await?;

    // We only need the alert_id and workspace_id from the first target to build
    // the notification message. The consumer will re-fetch targets for fan-out.
    if let Some(first_target) = targets.first() {
        let notification_message = notifications::NotificationMessage {
            project_id,
            workspace_id: first_target.workspace_id,
            definition_type: NotificationDefinitionType::Alert,
            definition_id: first_target.alert_id,
            notification_kind: NotificationKind::EventIdentification {
                project_id,
                trace_id,
                event_name: event_name.clone(),
                extracted_information: Some(attributes.clone()),
            },
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
