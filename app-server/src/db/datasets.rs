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

pub async fn get_datasets_with_counts(
    pool: &PgPool,
    project_id: Uuid,
    limit: i64,
    offset: i64,
) -> Result<(Vec<(Dataset, i64)>, i64)> {
    let datasets = sqlx::query_as::<_, (Dataset, i64)>(
        "WITH dataset_counts AS (
            SELECT d.id, COUNT(dp.id) as count
            FROM datasets d
            LEFT JOIN datapoints dp ON d.id = dp.dataset_id
            WHERE d.project_id = $1
            GROUP BY d.id
        )
        SELECT d.id, d.created_at, d.name, d.project_id, d.indexed_on, COALESCE(dc.count, 0)
        FROM datasets d
        LEFT JOIN dataset_counts dc ON d.id = dc.id
        WHERE d.project_id = $1
        ORDER BY d.created_at DESC
        LIMIT $2 OFFSET $3",
    )
    .bind(project_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await?;

    let total_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM datasets WHERE project_id = $1",
    )
    .bind(project_id)
    .fetch_one(pool)
    .await?;

    Ok((datasets, total_count))
}
