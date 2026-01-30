pub mod batching;
pub mod queue;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::ch::signal_events::CHSignalEvent;
use crate::worker_stateful::message_handler::UniqueId;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ClusteringMessage {
    pub id: Uuid,
    pub project_id: Uuid,
    pub signal_event: CHSignalEvent,
    pub value_template: String,
}

impl UniqueId for ClusteringMessage {
    fn get_unique_id(&self) -> String {
        return self.id.to_string();
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ClusteringBatchMessage {
    pub events: Vec<ClusteringMessage>,
}
