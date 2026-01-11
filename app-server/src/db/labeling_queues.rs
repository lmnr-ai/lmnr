use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct LabelingQueueItem {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub queue_id: Uuid,
    pub metadata: serde_json::Value,
    pub payload: serde_json::Value,
}

/// Check if a labeling queue exists and belongs to the given project.
pub async fn queue_exists(pool: &PgPool, queue_id: Uuid, project_id: Uuid) -> Result<bool> {
    let exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM labeling_queues WHERE id = $1 AND project_id = $2)",
    )
    .bind(queue_id)
    .bind(project_id)
    .fetch_one(pool)
    .await?;

    Ok(exists)
}

/// Insert multiple labeling queue items into the database.
/// Returns the created items with their generated IDs and timestamps.
pub async fn insert_labeling_queue_items(
    pool: &PgPool,
    queue_id: Uuid,
    items: Vec<(serde_json::Value, serde_json::Value)>, // (metadata, payload)
) -> Result<Vec<LabelingQueueItem>> {
    if items.is_empty() {
        return Ok(vec![]);
    }

    let mut queue_ids: Vec<Uuid> = Vec::with_capacity(items.len());
    let mut metadatas: Vec<serde_json::Value> = Vec::with_capacity(items.len());
    let mut payloads: Vec<serde_json::Value> = Vec::with_capacity(items.len());

    for (metadata, payload) in items {
        queue_ids.push(queue_id);
        metadatas.push(metadata);
        payloads.push(payload);
    }

    let created_items = sqlx::query_as::<_, LabelingQueueItem>(
        r#"
        INSERT INTO labeling_queue_items (queue_id, metadata, payload)
        SELECT * FROM UNNEST($1::uuid[], $2::jsonb[], $3::jsonb[])
        RETURNING id, created_at, queue_id, metadata, payload
        "#,
    )
    .bind(&queue_ids)
    .bind(&metadatas)
    .bind(&payloads)
    .fetch_all(pool)
    .await?;

    Ok(created_items)
}
