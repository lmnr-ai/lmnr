//! StorageService abstraction for routing storage operations
//! to either cloud S3 or via the data plane based on deployment configuration.

use std::pin::Pin;
use std::sync::Arc;

use anyhow::Result;
use sqlx::PgPool;
use tracing::instrument;
use uuid::Uuid;

use crate::cache::Cache;
use crate::data_plane::get_workspace_deployment;
use crate::db::workspaces::DeploymentMode;
use crate::mq::MessageQueue;

use super::data_plane::DataPlaneStorage;
use super::{CloudStorage, StorageTrait};

/// Service for storage operations that handles routing between direct
/// S3 writes and data plane writes based on deployment mode.
pub struct StorageService {
    pub cloud: CloudStorage,
    pub data_plane: DataPlaneStorage,
    pub queue: Arc<MessageQueue>,
    pub pool: PgPool,
    pub cache: Arc<Cache>,
}

impl StorageService {
    pub fn new(
        cloud: CloudStorage,
        http_client: reqwest::Client,
        queue: Arc<MessageQueue>,
        pool: PgPool,
        cache: Arc<Cache>,
    ) -> Self {
        Self {
            cloud,
            data_plane: DataPlaneStorage::new(http_client, cache.clone()),
            queue,
            pool,
            cache,
        }
    }

    /// Store a payload directly, routing to S3 or data plane based on deployment mode.
    /// Used by the PayloadHandler worker to persist data after consuming from the queue.
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
            DeploymentMode::CLOUD => self.cloud.store(bucket, key, data, None).await,
            DeploymentMode::HYBRID => {
                self.data_plane
                    .store(bucket, key, data, Some(&config))
                    .await
            }
        }
    }

    /// Get a stream of bytes, routing to S3 or data plane based on deployment mode.
    #[instrument(skip(self))]
    pub async fn get_stream(
        &self,
        project_id: Uuid,
        bucket: &str,
        key: &str,
    ) -> Result<Pin<Box<dyn futures_util::stream::Stream<Item = bytes::Bytes> + Send + 'static>>>
    {
        let config = get_workspace_deployment(&self.pool, self.cache.clone(), project_id).await?;

        match config.mode {
            DeploymentMode::CLOUD => self.cloud.get_stream(bucket, key, None).await,
            DeploymentMode::HYBRID => self.data_plane.get_stream(bucket, key, Some(&config)).await,
        }
    }

    /// Get the size of an object, routing to S3 or data plane based on deployment mode.
    #[instrument(skip(self))]
    pub async fn get_size(&self, project_id: Uuid, bucket: &str, key: &str) -> Result<u64> {
        let config = get_workspace_deployment(&self.pool, self.cache.clone(), project_id).await?;

        match config.mode {
            DeploymentMode::CLOUD => self.cloud.get_size(bucket, key, None).await,
            DeploymentMode::HYBRID => self.data_plane.get_size(bucket, key, Some(&config)).await,
        }
    }
}
