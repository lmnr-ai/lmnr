//! This module is responsible for postprocessing responses from the signal events.
//!
//! It is responsible for:
//! - Clustering the signal events
//! - Sending notifications to the users (Slack and Email)

use std::sync::Arc;
use uuid::Uuid;

use crate::ch::signal_events::CHSignalEvent;
use crate::clustering::queue::push_to_event_clustering_queue;
use crate::db;
use crate::features::{Feature, is_feature_enabled};
use crate::mq::MessageQueue;
use crate::mq::utils::mq_max_payload;
use crate::notifications::{
    self, EventIdentificationPayload, NotificationKind, NotificationMessage,
};

/// Process notifications and clustering for an identified signal event.
///
/// The producer sends only core event data. The consumer handles fetching
/// receivers, formatting messages, and delivery.
pub async fn process_event_notifications_and_clustering(
    db: Arc<db::DB>,
    queue: Arc<MessageQueue>,
    project_id: Uuid,
    trace_id: Uuid,
    signal_event: CHSignalEvent,
) -> anyhow::Result<()> {
    let event_name = signal_event.name().to_string();
    let attributes = signal_event.payload_value().unwrap_or_default();

    // Look up workspace_id from alert targets (we need at least one target to know
    // the workspace). If no targets exist, there's nothing to notify.
    let targets =
        db::alert_targets::get_targets_for_event(&db.pool, project_id, &event_name).await?;

    if let Some(first_target) = targets.first() {
        let workspace_id = first_target.workspace_id;

        let notification_message = NotificationMessage {
            workspace_id,
            payload: NotificationKind::EventIdentification(EventIdentificationPayload {
                project_id,
                trace_id,
                event_name: event_name.clone(),
                extracted_information: Some(attributes),
            }),
        };

        let serialized_size = serde_json::to_vec(&notification_message)
            .map(|v| v.len())
            .unwrap_or(0);
        if serialized_size >= mq_max_payload() {
            log::error!(
                "MQ payload limit exceeded for event notification: payload size [{}]",
                serialized_size,
            );
        } else if let Err(e) =
            notifications::push_to_notification_queue(notification_message, queue.clone()).await
        {
            log::error!(
                "Failed to push event notification to queue for event {}: {:?}",
                event_name,
                e
            );
        }
    }

    if is_feature_enabled(Feature::Clustering) {
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
