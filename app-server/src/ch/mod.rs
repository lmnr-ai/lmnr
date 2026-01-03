pub mod browser_events;
pub mod datapoints;
pub mod evaluation_datapoint_outputs;
pub mod evaluation_datapoints;
pub mod evaluation_scores;
pub mod evaluator_scores;
pub mod events;
pub mod limits;
mod route;
pub mod spans;
pub mod tags;
pub mod traces;
pub mod utils;

// Re-export routing types
pub use route::{ClickhouseInsertable, DataPlaneBatch, Table, get_workspace_deployment};

use anyhow::Result;
use sqlx::PgPool;
use std::sync::Arc;
use tracing::instrument;
use uuid::Uuid;

use crate::cache::Cache;
use crate::data_plane_client::write::write_to_data_plane;
use crate::db::workspaces::DeploymentMode;

/// Manager for ClickHouse operations that handles routing between direct
/// ClickHouse writes and data plane writes based on deployment mode.
pub struct ClickhouseManager {
    clickhouse: clickhouse::Client,
    pool: PgPool,
    cache: Arc<Cache>,
    http_client: reqwest::Client,
}

impl ClickhouseManager {
    pub fn new(
        clickhouse: clickhouse::Client,
        pool: PgPool,
        cache: Arc<Cache>,
        http_client: reqwest::Client,
    ) -> Self {
        Self {
            clickhouse,
            pool,
            cache,
            http_client,
        }
    }

    /// Insert a batch of items, routing to ClickHouse or data plane based on deployment mode.
    #[instrument(skip(self, items))]
    pub async fn insert_batch<T: ClickhouseInsertable>(
        &self,
        project_id: Uuid,
        items: &[T],
    ) -> Result<()> {
        if items.is_empty() {
            return Ok(());
        }

        let config = get_workspace_deployment(&self.pool, self.cache.clone(), project_id).await?;

        match config.mode {
            DeploymentMode::CLOUD => insert_batch_direct(&self.clickhouse, items).await,
            DeploymentMode::HYBRID => {
                write_to_data_plane(
                    &self.http_client,
                    &config,
                    T::into_data_plane_batch(items.to_vec()),
                )
                .await
            }
        }
    }
}

/// Insert a batch of objects directly into ClickHouse.
#[instrument(skip(clickhouse, objects))]
async fn insert_batch_direct<T: ClickhouseInsertable>(
    clickhouse: &clickhouse::Client,
    objects: &[T],
) -> Result<()> {
    if objects.is_empty() {
        return Ok(());
    }

    let table_name = T::TABLE.as_str();
    let insert = clickhouse.insert::<T>(table_name).await?;
    let mut insert = T::configure_insert(insert);

    for object in objects {
        insert.write(object).await?;
    }

    insert.end().await.map_err(|e| {
        anyhow::anyhow!(
            "Clickhouse batch insertion into '{}' failed: {:?}",
            table_name,
            e
        )
    })
}
