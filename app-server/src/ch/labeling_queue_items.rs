use anyhow::Result;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Row, Serialize, Deserialize, Debug, Clone)]
pub struct CHLabelingQueueItem {
    #[serde(with = "clickhouse::serde::uuid")]
    pub id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub queue_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    pub payload: String,
    pub edit: String,
    pub metadata: String,
    pub status: u8,
    pub idempotency_key: String,
    pub created_at: u64,
    pub updated_at: u64,
}

pub async fn insert_labeling_queue_items(
    clickhouse: clickhouse::Client,
    items: Vec<CHLabelingQueueItem>,
) -> Result<()> {
    if items.is_empty() {
        return Ok(());
    }

    let mut insert = clickhouse
        .insert::<CHLabelingQueueItem>("labeling_queue_items")
        .await?;
    for item in items {
        insert.write(&item).await?;
    }
    insert.end().await?;
    Ok(())
}
