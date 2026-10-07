use anyhow::Result;
use sqlx::PgPool;
use uuid::Uuid;

/// Check if a labeling queue exists and belongs to the given project.
/// The `labeling_queues` metadata table still lives in Postgres — only the
/// per-item rows have been migrated to ClickHouse.
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
