pub mod batching;
pub mod queue;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::batch_worker::message_handler::UniqueId;
use crate::ch::signal_events::CHSignalEvent;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ClusteringMessage {
    #[serde(default = "Uuid::new_v4")]
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
