//! Data plane storage implementation.
//!
//! Implements StorageTrait by sending requests to a remote data plane server.

use std::pin::Pin;

use anyhow::{Result, anyhow};
use async_trait::async_trait;
use serde::Serialize;

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
    config: WorkspaceDeployment,
}

impl DataPlaneStorage {
    pub fn new(http_client: reqwest::Client, config: WorkspaceDeployment) -> Self {
        Self {
            http_client,
            config,
        }
    }
}

#[async_trait]
impl super::StorageTrait for DataPlaneStorage {
    type StorageBytesStream =
        Pin<Box<dyn futures_util::stream::Stream<Item = bytes::Bytes> + Send + 'static>>;

    async fn store(&self, bucket: &str, key: &str, data: Vec<u8>) -> Result<String> {
        // For data plane, store and store_direct are the same - no queue
        self.store_direct(bucket, key, data).await
    }

    async fn store_direct(&self, bucket: &str, key: &str, data: Vec<u8>) -> Result<String> {
        if self.config.data_plane_url.is_empty() {
            return Err(anyhow!("Data plane URL is empty"));
        }

        let data_plane_url = crypto::decrypt_workspace_str(
            self.config.workspace_id,
            &self.config.data_plane_url_nonce,
            &self.config.data_plane_url,
        )
        .map_err(|e| anyhow!(e.to_string()))?;

        let auth_token = generate_auth_token(&self.config)
            .map_err(|e| anyhow!("Failed to generate auth token: {}", e))?;

        let payload = StorageUploadPayload {
            bucket,
            key,
            data: &data,
        };

        let response = self
            .http_client
            .post(format!("{}/api/v1/storage/upload", data_plane_url))
            .header("Authorization", format!("Bearer {}", auth_token))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await?;

        if response.status().is_success() {
            let url = response.text().await.unwrap_or_default();
            Ok(url)
        } else {
            Err(anyhow!(
                "Data plane storage upload returned {}: {}",
                response.status(),
                response.text().await.unwrap_or_default()
            ))
        }
    }

    async fn get_stream(&self, _bucket: &str, _key: &str) -> Result<Self::StorageBytesStream> {
        // TODO: Implement data plane read - for now return error
        Err(anyhow!("Data plane storage read not yet implemented"))
    }

    async fn get_size(&self, _bucket: &str, _key: &str) -> Result<u64> {
        // TODO: Implement data plane size check - for now return error
        Err(anyhow!("Data plane storage get_size not yet implemented"))
    }
}
