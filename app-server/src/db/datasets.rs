use anyhow::Result;
use sqlx::PgPool;
use uuid::Uuid;

use crate::datasets::Dataset;

pub async fn get_dataset(
    pool: &PgPool,
    project_id: Uuid,
    dataset_id: Uuid,
) -> Result<Option<Dataset>> {
    let dataset = sqlx::query_as::<_, Dataset>(
        "SELECT id, created_at, name, project_id, indexed_on FROM datasets WHERE id = $1 AND project_id = $2",
    )
    .bind(dataset_id)
    .bind(project_id)
    .fetch_optional(pool)
    .await?;
    Ok(dataset)
}

pub async fn delete_dataset(pool: &PgPool, dataset_id: Uuid) -> Result<()> {
    sqlx::query("DELETE from datasets WHERE id = $1")
        .bind(dataset_id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn update_index_column(
    pool: &PgPool,
    dataset_id: Uuid,
    index_column: Option<String>,
) -> Result<Dataset> {
    let dataset = sqlx::query_as::<_, Dataset>(
        "UPDATE datasets SET indexed_on = $2 WHERE id = $1
        RETURNING id, created_at, name, project_id, indexed_on",
    )
    .bind(dataset_id)
    .bind(index_column)
    .fetch_one(pool)
    .await?;

    Ok(dataset)
}

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
