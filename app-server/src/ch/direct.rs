//! Direct ClickHouse implementation.
//!
//! Implements ClickhouseTrait by inserting directly into ClickHouse.

use anyhow::Result;
use async_trait::async_trait;
use tracing::instrument;

use super::{ClickhouseInsertable, ClickhouseTrait};

/// Direct ClickHouse client wrapper that inserts data directly into ClickHouse.
#[derive(Clone)]
pub struct DirectClickhouse {
    client: clickhouse::Client,
}

impl DirectClickhouse {
    pub fn new(client: clickhouse::Client) -> Self {
        Self { client }
    }
}

#[async_trait]
impl ClickhouseTrait for DirectClickhouse {
    #[instrument(skip(self, items))]
    async fn insert_batch<T: ClickhouseInsertable>(&self, items: &[T]) -> Result<()> {
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
