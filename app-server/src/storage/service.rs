//! Routing types for storage operations.
//!
//! Contains the StorageService abstraction for routing storage operations
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
use crate::mq::{MessageQueue, MessageQueueTrait};

use super::data_plane::DataPlaneStorage;
use super::{PAYLOADS_EXCHANGE, PAYLOADS_ROUTING_KEY, QueuePayloadMessage, Storage, StorageTrait};

/// Convert a storage key to a URL.
/// Key format: "project/{project_id}/{payload_id}[.ext]"
fn key_to_url(key: &str) -> String {
    let parts = key
        .strip_prefix("project/")
        .unwrap()
        .split("/")
        .collect::<Vec<&str>>();
    format!("/api/projects/{}/payloads/{}", parts[0], parts[1])
}

/// Service for storage operations that handles routing between direct
/// S3 writes and data plane writes based on deployment mode.
pub struct StorageService {
    storage: Arc<Storage>,
    queue: Arc<MessageQueue>,
    pool: PgPool,
    cache: Arc<Cache>,
    http_client: reqwest::Client,
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
                let data_plane = DataPlaneStorage::new(self.http_client.clone(), config);
                data_plane.store(bucket, key, data).await
            }
        }
    }

    /// Publish a payload to the queue for async storage.
    /// Returns the URL that will be available after the payload is stored.
    #[instrument(skip(self, data))]
    pub async fn publish_payload(&self, bucket: &str, key: &str, data: Vec<u8>) -> Result<String> {
        let message = QueuePayloadMessage {
            key: key.to_string(),
            data,
            bucket: bucket.to_string(),
        };

        self.queue
            .publish(
                &serde_json::to_vec(&message)?,
                PAYLOADS_EXCHANGE,
                PAYLOADS_ROUTING_KEY,
            )
            .await?;

        Ok(key_to_url(key))
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
                let data_plane = DataPlaneStorage::new(self.http_client.clone(), config);
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
                let data_plane = DataPlaneStorage::new(self.http_client.clone(), config);
                data_plane.get_size(bucket, key).await
            }
        }
    }
}
