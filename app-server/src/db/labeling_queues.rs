use anyhow::Result;
use sqlx::PgPool;
use uuid::Uuid;

use crate::evaluations::utils::LabelingQueueEntry;

#[derive(sqlx::FromRow)]
pub struct LabelingQueue {
    pub id: Uuid,
    pub name: String,
    pub project_id: Uuid,
}

pub async fn get_labeling_queue_by_name(
    pool: &PgPool,
    name: &str,
    project_id: &Uuid,
) -> Result<LabelingQueue> {
    let queue = sqlx::query_as::<_, LabelingQueue>(
        "SELECT id, name, project_id FROM labeling_queues WHERE name = $1 AND project_id = $2",
    )
    .bind(name)
    .bind(project_id)
    .fetch_one(pool)
    .await?;

    Ok(queue)
}

pub async fn push_to_labeling_queue(
    pool: &PgPool,
    queue_id: &Uuid,
    items: &Vec<LabelingQueueEntry>,
) -> Result<()> {
    // we insert one row at a time to
    // 1. avoid the risk of a failed insert corrupting the batch
    // 2. sort on created_at
    for item in items {
        sqlx::query(
            "INSERT INTO labeling_queue_items (
            queue_id,
            span_id,
            action
        ) VALUES ($1, $2, $3)",
        )
        .bind(queue_id)
        .bind(item.span_id)
        .bind(item.action.clone())
        .execute(pool)
        .await?;
    }
    Ok(())
}
