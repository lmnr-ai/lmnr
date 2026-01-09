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
use crate::data_plane::{auth::generate_auth_token, crypto};
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

#[derive(Clone)]
pub struct DataPlaneStorage {
    http_client: reqwest::Client,
    cache: Arc<Cache>,
    config: WorkspaceDeployment,
}

impl DataPlaneStorage {
    pub fn new(
        http_client: reqwest::Client,
        cache: Arc<Cache>,
        config: WorkspaceDeployment,
    ) -> Self {
        Self {
            http_client,
            cache,
            config,
        }
    }

    /// Get decrypted data plane URL and auth token.
    async fn get_url_and_token(&self) -> Result<(String, String)> {
        let (Some(data_plane_url_nonce), Some(data_plane_url)) = (
            &self.config.data_plane_url_nonce,
            &self.config.data_plane_url,
        ) else {
            return Err(anyhow!("Data plane URL is not configured"));
        };

        let data_plane_url = crypto::decrypt(
            self.config.workspace_id,
            data_plane_url_nonce,
            data_plane_url,
        )
        .map_err(|e| anyhow!(e.to_string()))?;

        let auth_token = generate_auth_token(self.cache.clone(), &self.config)
            .await
            .map_err(|e| anyhow!("Failed to generate auth token: {}", e))?;

        Ok((data_plane_url, auth_token))
    }
}

#[async_trait]
impl super::StorageTrait for DataPlaneStorage {
    type StorageBytesStream =
        Pin<Box<dyn futures_util::stream::Stream<Item = bytes::Bytes> + Send + 'static>>;

    async fn store(&self, bucket: &str, key: &str, data: Vec<u8>) -> Result<String> {
        let (data_plane_url, auth_token) = self.get_url_and_token().await?;

        let payload = StorageUploadPayload {
            bucket,
            key,
            data: &data,
        };

        let response = self
            .http_client
            .post(format!("{data_plane_url}/api/v1/storage/upload"))
            .header("Authorization", format!("Bearer {}", auth_token))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await?;

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

    async fn get_stream(&self, bucket: &str, key: &str) -> Result<Self::StorageBytesStream> {
        let (data_plane_url, auth_token) = self.get_url_and_token().await?;

        let response = self
            .http_client
            .get(format!("{}/api/v1/storage/object", data_plane_url))
            .query(&[("bucket", bucket), ("key", key)])
            .header("Authorization", format!("Bearer {}", auth_token))
            .send()
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

    async fn get_size(&self, bucket: &str, key: &str) -> Result<u64> {
        let (data_plane_url, auth_token) = self.get_url_and_token().await?;

        let response = self
            .http_client
            .get(format!("{}/api/v1/storage/object/size", data_plane_url))
            .query(&[("bucket", bucket), ("key", key)])
            .header("Authorization", format!("Bearer {}", auth_token))
            .send()
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
