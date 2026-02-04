use std::sync::Arc;

use crate::clustering::{ClusteringBatchMessage, ClusteringMessage};
use crate::mq::{MessageQueue, MessageQueueTrait};

use crate::ch::signal_events::CHSignalEvent;
use uuid::Uuid;

pub const EVENT_CLUSTERING_QUEUE: &str = "event_clustering_queue";
pub const EVENT_CLUSTERING_EXCHANGE: &str = "event_clustering_exchange";
pub const EVENT_CLUSTERING_ROUTING_KEY: &str = "event_clustering_routing_key";

pub const EVENT_CLUSTERING_BATCH_EXCHANGE: &str = "event_clustering_batch_exchange";
pub const EVENT_CLUSTERING_BATCH_QUEUE: &str = "event_clustering_batch_queue";
pub const EVENT_CLUSTERING_BATCH_ROUTING_KEY: &str = "event_clustering_batch_routing_key";

pub async fn push_to_event_clustering_queue(
    project_id: Uuid,
    signal_event: CHSignalEvent,
    value_template: String,
    queue: Arc<MessageQueue>,
) -> anyhow::Result<()> {
    let message = ClusteringMessage {
        id: uuid::Uuid::new_v4(),
        project_id,
        signal_event,
        value_template,
    };

    let serialized = serde_json::to_vec(&message)?;

    queue
        .publish(
            &serialized,
            EVENT_CLUSTERING_EXCHANGE,
            EVENT_CLUSTERING_ROUTING_KEY,
            None,
        )
        .await?;

    log::debug!(
        "Pushed event clustering message to queue: project_id={}",
        project_id,
    );

    Ok(())
}

pub async fn push_to_clustering_batch_queue(
    messages: Vec<ClusteringMessage>,
    queue: Arc<MessageQueue>,
) -> anyhow::Result<()> {
    log::debug!("Pushing clustering batch to queue: len={}", messages.len());
    let batch_message = ClusteringBatchMessage { events: messages };
    let serialized = serde_json::to_vec(&batch_message)?;
    queue
        .publish(
            &serialized,
            EVENT_CLUSTERING_BATCH_EXCHANGE,
            EVENT_CLUSTERING_BATCH_ROUTING_KEY,
            None,
        )
        .await?;
    Ok(())
}
