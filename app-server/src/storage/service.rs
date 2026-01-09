//! StorageService abstraction for routing storage operations
//! to either direct S3 or via the data plane based on deployment configuration.

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
use super::{Storage, StorageTrait};

/// Service for storage operations that handles routing between direct
/// S3 writes and data plane writes based on deployment mode.
pub struct StorageService {
    pub(super) storage: Arc<Storage>,
    pub(super) queue: Arc<MessageQueue>,
    pub(super) pool: PgPool,
    pub(super) cache: Arc<Cache>,
    pub(super) http_client: reqwest::Client,
}

impl StorageService {
    pub fn new(
        storage: Arc<Storage>,
        queue: Arc<MessageQueue>,
        pool: PgPool,
        cache: Arc<Cache>,
        http_client: reqwest::Client,
    ) -> Self {
        Self {
            storage,
            queue,
            pool,
            cache,
            http_client,
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
            DeploymentMode::CLOUD => (*self.storage).store(bucket, key, data).await,
            DeploymentMode::HYBRID => {
                let data_plane =
                    DataPlaneStorage::new(self.http_client.clone(), self.cache.clone(), config);
                data_plane.store(bucket, key, data).await
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
            DeploymentMode::CLOUD => (*self.storage).get_stream(bucket, key).await,
            DeploymentMode::HYBRID => {
                let data_plane =
                    DataPlaneStorage::new(self.http_client.clone(), self.cache.clone(), config);
                data_plane.get_stream(bucket, key).await
            }
        }
    }

    /// Get the size of an object, routing to S3 or data plane based on deployment mode.
    #[instrument(skip(self))]
    pub async fn get_size(&self, project_id: Uuid, bucket: &str, key: &str) -> Result<u64> {
        let config = get_workspace_deployment(&self.pool, self.cache.clone(), project_id).await?;

        match config.mode {
            DeploymentMode::CLOUD => (*self.storage).get_size(bucket, key).await,
            DeploymentMode::HYBRID => {
                let data_plane =
                    DataPlaneStorage::new(self.http_client.clone(), self.cache.clone(), config);
                data_plane.get_size(bucket, key).await
            }
        }
    }
}
