pub mod browser_events;
pub mod cloud;
pub mod data_plane;
pub mod datapoints;
pub mod evaluation_datapoints;
pub mod limits;
pub mod logs;
pub mod service;
pub mod signal_events;
pub mod signal_run_messages;
pub mod signal_runs;
pub mod spans;
pub mod traces;
pub mod utils;

pub use data_plane::DataPlaneBatch;

use anyhow::Result;
use async_trait::async_trait;
use clickhouse::{RowOwned, RowWrite, insert::Insert};
use serde::Serialize;

use crate::db::workspaces::WorkspaceDeployment;

#[derive(Serialize, Clone, Copy, Debug)]
#[serde(rename_all = "snake_case")]
pub enum Table {
    Spans,
    Traces,
}

impl Table {
    pub const fn as_str(&self) -> &'static str {
        match self {
            Table::Spans => "spans",
            Table::Traces => "traces_replacing",
        }
    }
}

/// Trait for ClickHouse row types that can be inserted directly or via data plane.
pub trait ClickhouseInsertable: RowOwned + RowWrite + Clone + Sized + Send + Sync {
    /// The table type for this row
    const TABLE: Table;

    /// Configure the direct insert with custom options (e.g., async insert settings).
    /// Default implementation returns the insert unchanged.
    fn configure_insert(insert: Insert<Self>) -> Insert<Self> {
        insert
    }

    /// Convert items to DataPlaneBatch for data plane requests
    fn to_data_plane_batch(items: Vec<Self>) -> DataPlaneBatch;
}

/// Trait for ClickHouse operations.
/// Implemented by CloudClickhouse (direct inserts) and DataPlaneClickhouse (via data plane).
#[async_trait]
pub trait ClickhouseTrait: Send + Sync {
    /// Insert a batch of items into ClickHouse.
    async fn insert_batch<T: ClickhouseInsertable>(
        &self,
        items: &[T],
        config: Option<&WorkspaceDeployment>,
    ) -> Result<()>;
}
