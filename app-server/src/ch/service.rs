//! ClickHouse service for routing data ingestion.

use anyhow::Result;
use sqlx::PgPool;
use std::sync::Arc;
use tracing::instrument;
use uuid::Uuid;

use crate::cache::Cache;
use crate::data_plane::get_workspace_deployment;
use crate::db::workspaces::DeploymentMode;

use super::data_plane::DataPlaneClickhouse;
use super::direct::DirectClickhouse;
use super::{ClickhouseInsertable, ClickhouseTrait};

/// Service for ClickHouse operations that handles routing between direct
/// ClickHouse writes and data plane writes based on deployment mode.
pub struct ClickhouseService {
    direct: DirectClickhouse,
    pool: PgPool,
    cache: Arc<Cache>,
    http_client: reqwest::Client,
}

impl ClickhouseService {
    pub fn new(
        clickhouse: clickhouse::Client,
        pool: PgPool,
        cache: Arc<Cache>,
        http_client: reqwest::Client,
    ) -> Self {
        Self {
            direct: DirectClickhouse::new(clickhouse),
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
            DeploymentMode::CLOUD => self.direct.insert_batch(items).await,
            DeploymentMode::HYBRID => {
                // Create DataPlaneClickhouse with workspace-specific config
                let data_plane = DataPlaneClickhouse::new(self.http_client.clone(), config);
                data_plane.insert_batch(items).await
            }
        }
    }
}
