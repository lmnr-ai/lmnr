//! Data plane ClickHouse implementation.
//!
//! Implements ClickhouseTrait by sending requests to a remote data plane server.

use anyhow::{Result, anyhow};
use async_trait::async_trait;
use serde::Serialize;
use tracing::instrument;

use crate::data_plane::{auth::generate_auth_token, crypto};
use crate::db::workspaces::WorkspaceDeployment;

use super::spans::CHSpan;
use super::tags::CHTag;
use super::traces::CHTrace;
use super::{ClickhouseInsertable, ClickhouseTrait};

/// Batched data for data plane write requests.
/// Each variant represents a batch of items to insert into a specific table.
#[derive(Serialize, Clone, Debug)]
#[serde(tag = "table", content = "data", rename_all = "snake_case")]
pub enum DataPlaneBatch {
    Spans(Vec<CHSpan>),
    Traces(Vec<CHTrace>),
    Tags(Vec<CHTag>),
}

/// Data plane ClickHouse client that sends data to a remote data plane server.
#[derive(Clone)]
pub struct DataPlaneClickhouse {
    http_client: reqwest::Client,
    config: WorkspaceDeployment,
}

impl DataPlaneClickhouse {
    pub fn new(http_client: reqwest::Client, config: WorkspaceDeployment) -> Self {
        Self {
            http_client,
            config,
        }
    }
}

#[async_trait]
impl ClickhouseTrait for DataPlaneClickhouse {
    #[instrument(skip(self, items))]
    async fn insert_batch<T: ClickhouseInsertable>(&self, items: &[T]) -> Result<()> {
        if items.is_empty() {
            return Ok(());
        }

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

        let batch = T::to_data_plane_batch(items.to_vec());

        let response = self
            .http_client
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
}
