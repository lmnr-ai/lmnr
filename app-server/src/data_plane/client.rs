use anyhow::{Result, anyhow};
use serde::Serialize;
use std::sync::Arc;

use crate::cache::Cache;
use crate::db::workspaces::WorkspaceDeployment;

use super::{crypto, generate_auth_token};

#[derive(Clone)]
pub struct DataPlaneClient {
    cache: Arc<Cache>,
    http_client: reqwest::Client,
    config: WorkspaceDeployment,
}

impl DataPlaneClient {
    pub fn new(
        cache: Arc<Cache>,
        http_client: reqwest::Client,
        config: WorkspaceDeployment,
    ) -> Self {
        Self {
            cache,
            http_client,
            config,
        }
    }

    async fn resolve_url_and_token(&self) -> Result<(String, String)> {
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

    pub async fn post<T: Serialize>(&self, path: &str, body: &T) -> Result<reqwest::Response> {
        let (base_url, auth_token) = self.resolve_url_and_token().await?;
        let url = format!("{base_url}/{path}");

        self.http_client
            .post(url)
            .header("Authorization", format!("Bearer {}", auth_token))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| anyhow!(e))
    }

    pub async fn get(
        &self,
        path: &str,
        query_params: &[(&str, &str)],
    ) -> Result<reqwest::Response> {
        let (base_url, auth_token) = self.resolve_url_and_token().await?;
        let url = format!("{base_url}/{path}");

        self.http_client
            .get(url)
            .query(query_params)
            .header("Authorization", format!("Bearer {}", auth_token))
            .send()
            .await
            .map_err(|e| anyhow!(e))
    }
}
