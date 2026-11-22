use std::collections::HashMap;

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

#[derive(Row, Deserialize)]
struct ExistingCreation {
    #[serde(with = "clickhouse::serde::uuid")]
    id: Uuid,
    created_at_ms: i64,
}

pub async fn existing_creations(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    queue_id: Uuid,
    ids: &[Uuid],
) -> Result<HashMap<Uuid, i64>> {
    if ids.is_empty() {
        return Ok(HashMap::new());
    }

    let existing = clickhouse
        .query(
            "SELECT id, toUnixTimestamp64Milli(created_at) AS created_at_ms
             FROM labeling_queue_items FINAL
             WHERE project_id = {project_id:UUID} AND queue_id = {queue_id:UUID}
                AND id IN {ids:Array(UUID)}",
        )
        .param("project_id", project_id)
        .param("queue_id", queue_id)
        .param("ids", ids)
        .fetch_all::<ExistingCreation>()
        .await?;
    Ok(existing
        .into_iter()
        .map(|row| (row.id, row.created_at_ms))
        .collect())
}

pub async fn insert_labeling_queue_items(
    clickhouse: clickhouse::Client,
    items: Vec<CHLabelingQueueItem>,
) -> Result<()> {
    if items.is_empty() {
        return Ok(());
    }

    // A retry must be able to see the inserted row before the queue lock is released.
    let mut insert = clickhouse
        .with_setting("async_insert", "0")
        .insert::<CHLabelingQueueItem>("labeling_queue_items")
        .await?;
    for item in items {
        insert.write(&item).await?;
    }
    insert.end().await?;
    Ok(())
}
