//! Data plane write operations - HTTP client for sending data to data plane server.

use anyhow::{Result, anyhow};

use crate::ch::DataPlaneBatch;
use crate::db::workspaces::WorkspaceDeployment;

use super::auth::generate_auth_token;
use super::crypto;

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
