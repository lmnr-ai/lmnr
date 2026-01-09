//! Data plane ClickHouse implementation.
//!
//! Implements ClickhouseTrait by sending requests to a remote data plane server.

use std::sync::Arc;

use anyhow::{Result, anyhow};
use async_trait::async_trait;
use serde::Serialize;
use tracing::instrument;

use crate::cache::Cache;
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
    TracesReplacing(Vec<CHTrace>),
    Tags(Vec<CHTag>),
}

/// Data plane ClickHouse client that sends data to a remote data plane server.
#[derive(Clone)]
pub struct DataPlaneClickhouse {
    http_client: reqwest::Client,
    cache: Arc<Cache>,
    config: WorkspaceDeployment,
}

impl DataPlaneClickhouse {
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
}

#[async_trait]
impl ClickhouseTrait for DataPlaneClickhouse {
    #[instrument(skip(self, items))]
    async fn insert_batch<T: ClickhouseInsertable>(&self, items: &[T]) -> Result<()> {
        if items.is_empty() {
            return Ok(());
        }

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

        let batch = T::to_data_plane_batch(items.to_vec());

        let response = self
            .http_client
            .post(format!("{}/api/v1/ch/write", data_plane_url))
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
