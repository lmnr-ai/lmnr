//! Data plane storage implementation.
//!
//! Implements StorageTrait by sending requests to a remote data plane server.

use std::pin::Pin;
use std::sync::Arc;

use anyhow::{Result, anyhow};
use async_trait::async_trait;
use futures_util::StreamExt;
use serde::Serialize;

use crate::cache::Cache;
use crate::data_plane::client::DataPlaneClient;
use crate::db::workspaces::WorkspaceDeployment;

/// Payload for storage upload requests to data plane.
#[derive(Serialize)]
struct StorageUploadPayload<'a> {
    bucket: &'a str,
    key: &'a str,
    #[serde(with = "base64_serde")]
    data: &'a [u8],
}

mod base64_serde {
    use base64::{Engine, prelude::BASE64_STANDARD};
    use serde::Serializer;

    pub fn serialize<S: Serializer>(data: &[u8], serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&BASE64_STANDARD.encode(data))
    }
}

/// Data plane storage client that sends data to a remote data plane server.
#[derive(Clone)]
pub struct DataPlaneStorage {
    http_client: reqwest::Client,
    cache: Arc<Cache>,
}

impl DataPlaneStorage {
    pub fn new(http_client: reqwest::Client, cache: Arc<Cache>) -> Self {
        Self { http_client, cache }
    }
}

#[async_trait]
impl super::StorageTrait for DataPlaneStorage {
    type StorageBytesStream =
        Pin<Box<dyn futures_util::stream::Stream<Item = bytes::Bytes> + Send + 'static>>;

    async fn store(
        &self,
        bucket: &str,
        key: &str,
        data: Vec<u8>,
        config: Option<&WorkspaceDeployment>,
    ) -> Result<String> {
        let config = config.ok_or_else(|| {
            anyhow!("WorkspaceDeployment config is required for data plane storage")
        })?;

        let client =
            DataPlaneClient::new(self.cache.clone(), self.http_client.clone(), config.clone());

        let payload = StorageUploadPayload {
            bucket,
            key,
            data: &data,
        };

        let response = client.post("v1/storage/upload", &payload).await?;

        if response.status().is_success() {
            let url = response
                .text()
                .await
                .map_err(|e| anyhow!("Failed to read upload response: {}", e))?;
            Ok(url)
        } else {
            Err(anyhow!(
                "Data plane storage upload returned {}: {}",
                response.status(),
                response.text().await.unwrap_or_default()
            ))
        }
    }

    async fn get_stream(
        &self,
        bucket: &str,
        key: &str,
        config: Option<&WorkspaceDeployment>,
    ) -> Result<Self::StorageBytesStream> {
        let config = config.ok_or_else(|| {
            anyhow!("WorkspaceDeployment config is required for data plane storage")
        })?;

        let client =
            DataPlaneClient::new(self.cache.clone(), self.http_client.clone(), config.clone());

        let response = client
            .get("v1/storage/object", &[("bucket", bucket), ("key", key)])
            .await?;

        if !response.status().is_success() {
            return Err(anyhow!(
                "Data plane storage get_stream returned {}: {}",
                response.status(),
                response.text().await.unwrap_or_default()
            ));
        }

        // Convert the response body stream to our expected stream type
        let stream =
            futures_util::stream::unfold(response.bytes_stream(), |mut stream| async move {
                let chunk = stream.next().await?.ok()?;
                Some((chunk, stream))
            });

        Ok(Box::pin(stream))
    }

    async fn get_size(
        &self,
        bucket: &str,
        key: &str,
        config: Option<&WorkspaceDeployment>,
    ) -> Result<u64> {
        let config = config.ok_or_else(|| {
            anyhow!("WorkspaceDeployment config is required for data plane storage")
        })?;

        let client =
            DataPlaneClient::new(self.cache.clone(), self.http_client.clone(), config.clone());

        let response = client
            .get(
                "v1/storage/object/size",
                &[("bucket", bucket), ("key", key)],
            )
            .await?;

        if !response.status().is_success() {
            return Err(anyhow!(
                "Data plane storage get_size returned {}: {}",
                response.status(),
                response.text().await.unwrap_or_default()
            ));
        }

        let size_str = response.text().await?;
        size_str
            .trim()
            .parse::<u64>()
            .map_err(|e| anyhow!("Failed to parse size response: {}", e))
    }
}
