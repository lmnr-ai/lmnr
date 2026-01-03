//! Routing types and traits for ClickHouse data ingestion.
//!
//! Contains the core abstractions for routing data to either direct ClickHouse
//! or via the data plane based on deployment configuration.

use anyhow::Result;
use clickhouse::{RowOwned, RowWrite, insert::Insert};
use serde::Serialize;
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

use crate::cache::{Cache, CacheTrait, keys::WORKSPACE_DEPLOYMENTS_CACHE_KEY};
use crate::db::workspaces::{WorkspaceDeployment, get_workspace_deployment_by_project_id};

use super::spans::CHSpan;
use super::tags::CHTag;
use super::traces::CHTrace;

#[derive(Serialize, Clone, Copy, Debug)]
#[serde(rename_all = "snake_case")]
pub enum Table {
    Spans,
    Traces,
    Tags,
}

impl Table {
    pub const fn as_str(&self) -> &'static str {
        match self {
            Table::Spans => "spans",
            Table::Traces => "traces_replacing",
            Table::Tags => "tags",
        }
    }
}

/// Batched data for data plane write requests.
/// Each variant represents a batch of items to insert into a specific table.
#[derive(Serialize, Clone, Debug)]
#[serde(tag = "table", content = "data", rename_all = "snake_case")]
pub enum DataPlaneBatch {
    Spans(Vec<CHSpan>),
    Traces(Vec<CHTrace>),
    Tags(Vec<CHTag>),
}

/// Trait for ClickHouse row types that can be inserted directly or via data plane.
pub trait ClickhouseInsertable: RowOwned + RowWrite + Clone + Sized {
    /// The table type for this row
    const TABLE: Table;

    /// Configure the insert with custom options (e.g., async insert settings).
    /// Default implementation returns the insert unchanged.
    fn configure_insert(insert: Insert<Self>) -> Insert<Self> {
        insert
    }

    /// Convert items to DataPlaneBatch for data plane requests
    fn into_data_plane_batch(items: Vec<Self>) -> DataPlaneBatch;
}

/// Get workspace deployment configuration with caching.
pub async fn get_workspace_deployment(
    pool: &PgPool,
    cache: Arc<Cache>,
    project_id: Uuid,
) -> Result<WorkspaceDeployment> {
    let cache_key = format!("{WORKSPACE_DEPLOYMENTS_CACHE_KEY}:{project_id}");
    let cache_res = cache.get::<WorkspaceDeployment>(&cache_key).await;

    match cache_res {
        Ok(Some(config)) => Ok(config),
        Ok(None) | Err(_) => {
            let workspace_deployment =
                get_workspace_deployment_by_project_id(pool, &project_id).await?;

            cache
                .insert::<WorkspaceDeployment>(&cache_key, workspace_deployment.clone())
                .await?;
            Ok(workspace_deployment)
        }
    }
}

