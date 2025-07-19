use anyhow::Result;
use sqlx::PgPool;
use uuid::Uuid;

use crate::datasets::Dataset;

pub async fn get_dataset_by_name(
    pool: &PgPool,
    name: &str,
    project_id: Uuid,
) -> Result<Option<Dataset>> {
    let dataset = sqlx::query_as::<_, Dataset>(
        "SELECT id, created_at, name, project_id, indexed_on
        FROM datasets
        WHERE name = $1 AND project_id = $2
        ORDER BY created_at DESC
        LIMIT 1",
    )
    .bind(name)
    .bind(project_id)
    .fetch_optional(pool)
    .await?;

    Ok(dataset)
}

pub async fn get_dataset_by_id(pool: &PgPool, dataset_id: Uuid) -> Result<Option<Dataset>> {
    let dataset = sqlx::query_as::<_, Dataset>(
        "SELECT id, created_at, name, project_id, indexed_on
        FROM datasets
        WHERE id = $1",
    )
    .bind(dataset_id)
    .fetch_optional(pool)
    .await?;

    Ok(dataset)
}
