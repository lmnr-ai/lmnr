pub mod browser_events;
pub mod cloud;
pub mod data_plane;
pub mod datapoints;
pub mod evaluation_datapoints;
pub mod labeling_queue_items;
pub mod limits;
pub mod llm_messages;
pub mod logs;
pub mod notification_deliveries;
pub mod notifications;
pub mod service;
pub mod signal_events;
pub mod signal_run_messages;
pub mod spans;
pub mod traces;
pub mod utils;

pub use data_plane::DataPlaneBatch;

use std::sync::LazyLock;

use anyhow::Result;
use async_trait::async_trait;
use clickhouse::{RowOwned, RowWrite, insert::Insert};
use serde::Serialize;

use crate::db::workspaces::WorkspaceDeployment;

/// Cap for CH's adaptive `async_insert_busy_timeout` on the hot ingest tables
/// (`spans`, `traces_replacing`, `llm_messages`). Read once from
/// `SPANS_CH_WAIT_FOR_ASYNC_INSERT_MS`, defaults to 400 ms when unset OR set to
/// an empty string (common with k8s ConfigMap keys whose values aren't filled in).
pub static SPANS_CH_ASYNC_INSERT_BUSY_TIMEOUT_MAX_MS: LazyLock<String> = LazyLock::new(|| {
    std::env::var("SPANS_CH_WAIT_FOR_ASYNC_INSERT_MS")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "400".to_string())
});

#[derive(Serialize, Clone, Copy, Debug)]
#[serde(rename_all = "snake_case")]
pub enum Table {
    Spans,
    Traces,
    NotificationDeliveries,
    Notifications,
    LlmMessages,
}

impl Table {
    pub const fn as_str(&self) -> &'static str {
        match self {
            Table::Spans => "spans",
            Table::Traces => "traces_replacing",
            Table::NotificationDeliveries => "notification_deliveries",
            Table::Notifications => "notifications",
            Table::LlmMessages => "llm_messages",
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
