use anyhow::Result;
use chrono::Utc;
use sqlx::PgPool;
use uuid::Uuid;

use crate::evaluations::utils::LabelingQueueEntry;

#[derive(sqlx::FromRow)]
pub struct LabelingQueue {
    pub id: Uuid,
    // pub name: String,
    // pub project_id: Uuid,
}

pub async fn get_labeling_queue_by_name(
    pool: &PgPool,
    name: &str,
    project_id: &Uuid,
) -> Result<Option<LabelingQueue>> {
    let queue = sqlx::query_as::<_, LabelingQueue>(
        "SELECT id FROM labeling_queues WHERE name = $1 AND project_id = $2",
    )
    .bind(name)
    .bind(project_id)
    .fetch_optional(pool)
    .await?;

    Ok(queue)
}

pub async fn push_to_labeling_queue(
    pool: &PgPool,
    queue_id: &Uuid,
    items: &Vec<LabelingQueueEntry>,
) -> Result<()> {
    let span_ids = items.iter().map(|item| item.span_id).collect::<Vec<_>>();
    let actions = items
        .iter()
        .map(|item| item.action.clone())
        .collect::<Vec<_>>();
    let created_at_vec = items
        .iter()
        .map(|_| {
            // Postgres precision is in microseconds, so we sleep for 1 microsecond
            // to ensure that the timestamps are different
            std::thread::sleep(std::time::Duration::from_micros(1));
            Utc::now()
        })
        .collect::<Vec<_>>();

    sqlx::query(
        "INSERT INTO labeling_queue_items (
            queue_id,
            span_id,
            action,
            created_at
        ) SELECT $1, UNNEST($2), UNNEST($3), UNNEST($4)",
    )
    .bind(queue_id)
    .bind(span_ids)
    .bind(actions)
    .bind(created_at_vec)
    .execute(pool)
    .await?;

    Ok(())
}
