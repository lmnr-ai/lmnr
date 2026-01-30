pub mod message_handler;
pub mod worker;
pub mod worker_pool;

use serde::Serialize;

/// Stateful Worker type enumeration
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
pub enum StatefulWorkerType {
    ClusteringBatching,
}

impl std::fmt::Display for StatefulWorkerType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StatefulWorkerType::ClusteringBatching => write!(f, "clustering_batch"),
        }
    }
}
