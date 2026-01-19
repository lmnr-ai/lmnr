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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewLabelingQueueItem {
    pub id: Uuid,
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
    items: Vec<NewLabelingQueueItem>,
) -> Result<Vec<LabelingQueueItem>> {
    if items.is_empty() {
        return Ok(vec![]);
    }

    let len = items.len();
    let mut ids = Vec::with_capacity(len);
    let mut metadatas = Vec::with_capacity(len);
    let mut payloads = Vec::with_capacity(len);

    for item in items {
        ids.push(item.id);
        metadatas.push(item.metadata);
        payloads.push(item.payload);
    }

    let created_items = sqlx::query_as::<_, LabelingQueueItem>(
        r#"
        INSERT INTO labeling_queue_items (id, queue_id, metadata, payload)
        SELECT id, $1, metadata, payload FROM UNNEST($2::uuid[], $3::jsonb[], $4::jsonb[]) AS t(id, metadata, payload)
        RETURNING id, created_at, queue_id, metadata, payload
        "#,
    )
    .bind(&queue_id)
    .bind(&ids)
    .bind(&metadatas)
    .bind(&payloads)
    .fetch_all(pool)
    .await?;

    Ok(created_items)
}
