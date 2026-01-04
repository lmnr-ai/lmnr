//! Data plane write operations - HTTP client for sending data to data plane server.

use anyhow::{Result, anyhow};
use serde::Serialize;

use crate::ch::DataPlaneBatch;
use crate::db::workspaces::WorkspaceDeployment;

use super::auth::generate_auth_token;
use super::crypto;

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

/// Send data to the data plane server via HTTP.
pub async fn write_to_data_plane(
    http_client: &reqwest::Client,
    config: &WorkspaceDeployment,
    batch: DataPlaneBatch,
) -> Result<()> {
    if config.data_plane_url.is_empty() {
        return Err(anyhow!("Data plane URL is empty"));
    }

    // Decrypt data_plane_url if present
    let data_plane_url = crypto::decrypt_workspace_str(
        config.workspace_id,
        &config.data_plane_url_nonce,
        &config.data_plane_url,
    )
    .map_err(|e| anyhow!(e.to_string()))?;

    let auth_token =
        generate_auth_token(config).map_err(|e| anyhow!("Failed to generate auth token: {}", e))?;

    let response = http_client
        .post(format!("{}/api/v1/write", data_plane_url))
        .header("Authorization", format!("Bearer {}", auth_token))
        .header("Content-Type", "application/json")
        .json(&batch)
        .send()
        .await?;

    if response.status().is_success() {
        Ok(())
    } else {
        Err(anyhow!(
            "Data plane returned {}: {}",
            response.status(),
            response.text().await.unwrap_or_default()
        ))
    }
}

/// Upload a payload to the data plane storage via HTTP.
/// Returns the URL that can be used to retrieve the payload.
pub async fn data_plane_storage_upload(
    http_client: &reqwest::Client,
    config: &WorkspaceDeployment,
    bucket: &str,
    key: &str,
    data: Vec<u8>,
) -> Result<String> {
    if config.data_plane_url.is_empty() {
        return Err(anyhow!("Data plane URL is empty"));
    }

    let data_plane_url = crypto::decrypt_workspace_str(
        config.workspace_id,
        &config.data_plane_url_nonce,
        &config.data_plane_url,
    )
    .map_err(|e| anyhow!(e.to_string()))?;

    let auth_token =
        generate_auth_token(config).map_err(|e| anyhow!("Failed to generate auth token: {}", e))?;

    let payload = StorageUploadPayload {
        bucket,
        key,
        data: &data,
    };

    let response = http_client
        .post(format!("{}/api/v1/storage/upload", data_plane_url))
        .header("Authorization", format!("Bearer {}", auth_token))
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await?;

    if response.status().is_success() {
        // Data plane returns the URL in response body
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
