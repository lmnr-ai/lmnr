pub mod message_handler;
pub mod worker;
pub mod worker_pool;

use serde::Serialize;

/// Batch Worker type enumeration
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
pub enum BatchWorkerType {
    ClusteringBatching,
    BrowserEvents,
}

impl std::fmt::Display for BatchWorkerType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BatchWorkerType::ClusteringBatching => write!(f, "clustering_batch"),
            BatchWorkerType::BrowserEvents => write!(f, "browser_events"),
        }
    }
}
