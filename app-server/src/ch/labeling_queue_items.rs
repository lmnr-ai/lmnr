use std::collections::HashSet;

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

pub async fn existing_idempotency_keys(
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    queue_id: Uuid,
    keys: &[String],
) -> Result<HashSet<String>> {
    if keys.is_empty() {
        return Ok(HashSet::new());
    }

    let rows = clickhouse
        .query(
            "SELECT DISTINCT idempotency_key FROM labeling_queue_items FINAL \
             WHERE project_id = { project_id: UUID } \
               AND queue_id   = { queue_id: UUID } \
               AND idempotency_key IN { keys: Array(String) }",
        )
        .param("project_id", project_id)
        .param("queue_id", queue_id)
        .param("keys", keys.to_vec())
        .fetch_all::<String>()
        .await?;

    Ok(rows.into_iter().collect())
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
