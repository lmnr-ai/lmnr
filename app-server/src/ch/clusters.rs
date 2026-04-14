use clickhouse::Row;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::utils::chrono_to_nanoseconds;
use super::{ClickhouseInsertable, DataPlaneBatch, Table};

#[derive(Row, Serialize, Deserialize, Debug, Clone)]
pub struct CHCluster {
    #[serde(with = "clickhouse::serde::uuid")]
    pub id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub signal_id: Uuid,
    pub name: String,
    pub level: u8,
    #[serde(with = "clickhouse::serde::uuid")]
    pub parent_id: Uuid,
    pub num_signal_events: u32,
    pub num_children_clusters: u16,
    pub created_at: i64,
    pub updated_at: i64,
}

impl CHCluster {
    pub fn new(
        id: Uuid,
        project_id: Uuid,
        signal_id: Uuid,
        name: String,
        level: u8,
        parent_id: Option<Uuid>,
        num_signal_events: u32,
        num_children_clusters: u16,
    ) -> Self {
        let now = chrono_to_nanoseconds(chrono::Utc::now());
        Self {
            id,
            project_id,
            signal_id,
            name,
            level,
            parent_id: parent_id.unwrap_or(Uuid::nil()),
            num_signal_events,
            num_children_clusters,
            created_at: now,
            updated_at: now,
        }
    }
}

impl ClickhouseInsertable for CHCluster {
    const TABLE: Table = Table::SignalEventClusters;

    fn to_data_plane_batch(items: Vec<Self>) -> DataPlaneBatch {
        DataPlaneBatch::SignalEventClusters(items)
    }
}
