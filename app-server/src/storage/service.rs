//! Routing types for storage operations.
//!
//! Contains the StorageManager abstraction for routing storage operations
//! to either direct S3 or via the data plane based on deployment configuration.

use anyhow::Result;
use sqlx::PgPool;
use std::sync::Arc;
use tracing::instrument;
use uuid::Uuid;

use crate::cache::Cache;
use crate::ch::get_workspace_deployment;
use crate::data_plane_client::write::data_plane_storage_upload;
use crate::db::workspaces::DeploymentMode;

use super::{Storage, StorageTrait};

/// Manager for storage operations that handles routing between direct
/// S3 writes and data plane writes based on deployment mode.
pub struct StorageService {
    storage: Arc<Storage>,
    pool: PgPool,
    cache: Arc<Cache>,
    http_client: reqwest::Client,
}

impl StorageService {
    pub fn new(
        storage: Arc<Storage>,
        pool: PgPool,
        cache: Arc<Cache>,
        http_client: reqwest::Client,
    ) -> Self {
        Self {
            storage,
            pool,
            cache,
            http_client,
        }
    }

    /// Store a payload, routing to S3 or data plane based on deployment mode.
    #[instrument(skip(self, data))]
    pub async fn store(
        &self,
        project_id: Uuid,
        bucket: &str,
        key: &str,
        data: Vec<u8>,
    ) -> Result<String> {
        let config = get_workspace_deployment(&self.pool, self.cache.clone(), project_id).await?;

        match config.mode {
            DeploymentMode::CLOUD => (*self.storage).store(bucket, key, data).await,
            DeploymentMode::HYBRID => {
                data_plane_storage_upload(&self.http_client, &config, bucket, key, data).await
            }
        }
    }
}
