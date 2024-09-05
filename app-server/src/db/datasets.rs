use anyhow::{Context, Result};
use sqlx::PgPool;
use uuid::Uuid;

use crate::datasets::Dataset;

pub async fn create_dataset(pool: &PgPool, name: &String, project_id: Uuid) -> Result<Dataset> {
    let dataset = sqlx::query_as::<_, Dataset>(
        "INSERT INTO datasets (name, project_id)
        VALUES ($1, $2)
        RETURNING id, created_at, name, project_id, indexed_on
        ",
    )
    .bind(name)
    .bind(project_id)
    .fetch_one(pool)
    .await?;

    Ok(dataset)
}

pub async fn get_datasets(pool: &PgPool, project_id: Uuid) -> Result<Vec<Dataset>> {
    let datasets = sqlx::query_as::<_, Dataset>(
        "SELECT id, created_at, name, project_id, indexed_on FROM datasets WHERE project_id = $1
        ORDER BY created_at DESC",
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    Ok(datasets)
}

pub async fn get_dataset(pool: &PgPool, project_id: Uuid, dataset_id: Uuid) -> Result<Dataset> {
    let dataset = sqlx::query_as::<_, Dataset>(
        "SELECT id, created_at, name, project_id, indexed_on FROM datasets WHERE id = $1 AND project_id = $2",
    )
    .bind(dataset_id)
    .bind(project_id)
    .fetch_optional(pool)
    .await?;

    dataset.context("Dataset with such id and project_id not found")
}

pub async fn rename_dataset(
    pool: &PgPool,
    id: Uuid,
    project_id: Uuid,
    new_name: &String,
) -> Result<Dataset> {
    let dataset = sqlx::query_as::<_, Dataset>(
        "UPDATE datasets SET name = $3 WHERE id = $1 AND project_id = $2
        RETURNING id, created_at, name, project_id, indexed_on",
    )
    .bind(id)
    .bind(project_id)
    .bind(new_name)
    .fetch_optional(pool)
    .await?;

    dataset.context("Dataset with such id and project_id not found")
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
