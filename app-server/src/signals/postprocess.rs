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
use crate::notifications::{
    self, EventIdentificationPayload, NotificationType, SlackMessagePayload,
};

/// Process notifications and clustering for an identified signal event
pub async fn process_event_notifications_and_clustering(
    db: Arc<db::DB>,
    queue: Arc<MessageQueue>,
    project_id: Uuid,
    trace_id: Uuid,
    signal_event: CHSignalEvent,
    summary: String,
) -> anyhow::Result<()> {
    let event_name = signal_event.name().to_string();
    let attributes = signal_event.payload_value().unwrap_or_default();

    // Check for Slack notifications
    // It's ok to not check for feature flag here, because channels can't be added without Slack integration
    let channels =
        db::slack_channel_to_events::get_channels_for_event(&db.pool, project_id, &event_name)
            .await?;

    // Push a notification for each configured channel
    for channel in channels {
        let payload = EventIdentificationPayload {
            event_name: event_name.to_string(),
            extracted_information: Some(attributes.clone()),
            channel_id: channel.channel_id.clone(),
            integration_id: channel.integration_id,
        };

        let notification_message = notifications::NotificationMessage {
            project_id,
            trace_id,
            notification_type: NotificationType::Slack,
            event_name: event_name.to_string(),
            payload: serde_json::to_value(SlackMessagePayload::EventIdentification(payload))?,
        };

        if let Err(e) =
            notifications::push_to_notification_queue(notification_message, queue.clone()).await
        {
            log::error!(
                "Failed to push to notification queue for channel {}: {:?}",
                channel.channel_id,
                e
            );
        }
    }

    if is_feature_enabled(Feature::Clustering) {
        // Check for event clustering configuration
        if let Err(e) = push_to_event_clustering_queue(
            project_id,
            signal_event,
            // TODO: skull8888888 update value template
            summary,
            queue.clone(),
        )
        .await
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
