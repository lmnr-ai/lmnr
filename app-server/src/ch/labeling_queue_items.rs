use anyhow::Result;
use chrono::Utc;
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
    pub metadata: String,
    pub is_labelled: bool,
    pub idempotency_key: String,
    /// DateTime64(3, 'UTC') — milliseconds since epoch.
    pub created_at: u64,
    /// DateTime64(3, 'UTC') — milliseconds since epoch.
    pub updated_at: u64,
}

/// Check whether an item with the given idempotency_key already exists in the queue.
/// Uses FINAL to collapse replacing-merge-tree duplicates.
pub async fn idempotency_key_exists(
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    queue_id: Uuid,
    idempotency_key: &str,
) -> Result<bool> {
    if idempotency_key.is_empty() {
        return Ok(false);
    }

    let count = clickhouse
        .query(
            "SELECT count(*) FROM labeling_queue_items FINAL \
             WHERE project_id = ? AND queue_id = ? AND idempotency_key = ?",
        )
        .bind(project_id)
        .bind(queue_id)
        .bind(idempotency_key)
        .fetch_one::<u64>()
        .await?;

    Ok(count > 0)
}

/// Insert labeling queue items into ClickHouse. The caller is responsible for
/// generating ids and handling idempotency collisions.
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

pub fn now_ch_millis() -> u64 {
    // ClickHouse DateTime64(3) is milliseconds since epoch (UTC).
    Utc::now().timestamp_millis() as u64
}
