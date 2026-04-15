//! This module is responsible for postprocessing responses from the signal events.
//!
//! It is responsible for:
//! - Enqueueing signal events for clustering (alerts are triggered by the
//!   clustering handler when new clusters are detected)

use std::sync::Arc;
use uuid::Uuid;

use crate::ch::signal_events::CHSignalEvent;
use crate::clustering::queue::push_to_event_clustering_queue;
use crate::features::{Feature, is_feature_enabled};
use crate::mq::MessageQueue;

/// Enqueue a signal event for clustering. Alert notifications are handled
/// downstream by the clustering handler when new event types are detected.
pub async fn process_event_clustering(
    queue: Arc<MessageQueue>,
    project_id: Uuid,
    signal_event: CHSignalEvent,
) -> anyhow::Result<()> {
    let event_name = signal_event.name().to_string();

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
