pub mod batching;
pub mod clustering;
pub mod queue;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ClusteringMessage {
    pub project_id: Uuid,
    pub signal_id: Uuid,
    pub event_id: Uuid,
    pub content: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ClusteringBatchMessage {
    pub events: Vec<ClusteringMessage>,
}
