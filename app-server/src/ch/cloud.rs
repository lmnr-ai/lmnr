//! Cloud ClickHouse implementation.
//!
//! Implements ClickhouseTrait by inserting data into cloud ClickHouse.

use anyhow::Result;
use async_trait::async_trait;
use tracing::instrument;

use crate::db::workspaces::WorkspaceDeployment;

use super::{ClickhouseInsertable, ClickhouseTrait};

/// Cloud ClickHouse client wrapper that inserts data directly into ClickHouse.
#[derive(Clone)]
pub struct CloudClickhouse {
    client: clickhouse::Client,
}

impl CloudClickhouse {
    pub fn new(client: clickhouse::Client) -> Self {
        Self { client }
    }
}

#[async_trait]
impl ClickhouseTrait for CloudClickhouse {
    #[instrument(skip(self, items, _config))]
    async fn insert_batch<T: ClickhouseInsertable>(
        &self,
        items: &[T],
        _config: Option<&WorkspaceDeployment>,
    ) -> Result<()> {
        if items.is_empty() {
            return Ok(());
        }

        let table_name = T::TABLE.as_str();
        let insert = self.client.insert::<T>(table_name).await?;
        let mut insert = T::configure_insert(insert);

        for item in items {
            insert.write(item).await?;
        }

        insert.end().await.map_err(|e| {
            anyhow::anyhow!(
                "Clickhouse batch insertion into '{}' failed: {:?}",
                table_name,
                e
            )
        })
    }
}
