//! ClickHouse service for routing data ingestion.

use anyhow::Result;
use sqlx::PgPool;
use std::sync::Arc;
use tracing::instrument;
use uuid::Uuid;

use crate::cache::Cache;
use crate::data_plane::get_workspace_deployment;
use crate::db::workspaces::DeploymentMode;

use super::cloud::CloudClickhouse;
use super::data_plane::DataPlaneClickhouse;
use super::{ClickhouseInsertable, ClickhouseTrait};

/// Service for ClickHouse operations that handles routing between direct
/// ClickHouse writes and data plane writes based on deployment mode.
pub struct ClickhouseService {
    cloud: CloudClickhouse,
    data_plane: DataPlaneClickhouse,
    pool: PgPool,
    cache: Arc<Cache>,
}

impl ClickhouseService {
    #[allow(dead_code)]
    pub fn new(
        clickhouse: clickhouse::Client,
        pool: PgPool,
        cache: Arc<Cache>,
        http_client: reqwest::Client,
    ) -> Self {
        Self {
            cloud: CloudClickhouse::new(clickhouse),
            data_plane: DataPlaneClickhouse::new(http_client, cache.clone()),
            pool,
            cache,
        }
    }

    /// Insert a batch of items, routing to ClickHouse or data plane based on deployment mode.
    #[instrument(skip(self, items))]
    #[allow(dead_code)]
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
            DeploymentMode::CLOUD => self.cloud.insert_batch(items, None).await,
            DeploymentMode::HYBRID => self.data_plane.insert_batch(items, Some(&config)).await,
        }
    }
}
