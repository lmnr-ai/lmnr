//! Data plane ClickHouse implementation.
//!
//! Implements ClickhouseTrait by sending requests to a remote data plane server.

use std::sync::Arc;

use anyhow::{Result, anyhow};
use async_trait::async_trait;
use serde::Serialize;
use tracing::instrument;

use crate::cache::Cache;
use crate::data_plane::client::DataPlaneClient;
use crate::db::workspaces::WorkspaceDeployment;

use super::spans::CHSpan;
use super::traces::CHTrace;
use super::{ClickhouseInsertable, ClickhouseTrait};

/// Batched data for data plane write requests.
/// Each variant represents a batch of items to insert into a specific table.
#[derive(Serialize, Clone, Debug)]
#[serde(tag = "table", content = "data", rename_all = "snake_case")]
pub enum DataPlaneBatch {
    Spans(Vec<CHSpan>),
    Traces(Vec<CHTrace>),
}

/// Data plane ClickHouse client that sends data to a remote data plane server.
#[derive(Clone)]
pub struct DataPlaneClickhouse {
    http_client: reqwest::Client,
    cache: Arc<Cache>,
}

impl DataPlaneClickhouse {
    pub fn new(http_client: reqwest::Client, cache: Arc<Cache>) -> Self {
        Self { http_client, cache }
    }
}

#[async_trait]
impl ClickhouseTrait for DataPlaneClickhouse {
    #[instrument(skip(self, items, config))]
    async fn insert_batch<T: ClickhouseInsertable>(
        &self,
        items: &[T],
        config: Option<&WorkspaceDeployment>,
    ) -> Result<()> {
        if items.is_empty() {
            return Ok(());
        }

        let config = config.ok_or_else(|| {
            anyhow!("WorkspaceDeployment config is required for data plane inserts")
        })?;

        let batch = T::to_data_plane_batch(items.to_vec());

        let data_plane_client =
            DataPlaneClient::new(self.cache.clone(), self.http_client.clone(), config.clone());

        let response = data_plane_client.post("v1/ingest", &batch).await?;

        if !response.status().is_success() {
            return Err(anyhow!(
                "Data plane returned {}: {}",
                response.status(),
                response.text().await.unwrap_or_default()
            ));
        }

        Ok(())
    }
}
