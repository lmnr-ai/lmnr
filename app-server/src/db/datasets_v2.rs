use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::datasets_v2::VersionRef;

#[derive(Serialize, Deserialize, FromRow, Clone, Debug, PartialEq, Eq, Hash)]
pub struct TaskHash {
    pub task: String,
    pub hash: String,
}

/// The subset of `versions` that has a `task_versions` row.
pub async fn get_existing_versions(
    pool: &PgPool,
    project_id: &Uuid,
    dataset_id: &str,
    versions: &[TaskHash],
) -> Result<Vec<TaskHash>> {
    let tasks: Vec<&str> = versions.iter().map(|v| v.task.as_str()).collect();
    let hashes: Vec<&str> = versions.iter().map(|v| v.hash.as_str()).collect();
    let existing = sqlx::query_as::<_, TaskHash>(
        "SELECT task_id AS task, hash FROM task_versions
        WHERE project_id = $1 AND dataset_id = $2
            AND (task_id, hash) IN (SELECT * FROM UNNEST($3::text[], $4::text[]))",
    )
    .bind(project_id)
    .bind(dataset_id)
    .bind(&tasks)
    .bind(&hashes)
    .fetch_all(pool)
    .await?;
    Ok(existing)
}

pub async fn version_exists(
    pool: &PgPool,
    project_id: &Uuid,
    version: &VersionRef,
) -> Result<bool> {
    let exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (
            SELECT 1 FROM task_versions
            WHERE project_id = $1 AND dataset_id = $2 AND task_id = $3 AND hash = $4
        )",
    )
    .bind(project_id)
    .bind(&version.dataset)
    .bind(&version.task)
    .bind(&version.hash)
    .fetch_one(pool)
    .await?;
    Ok(exists)
}

/// Creates the dataset, task and version rows as needed. A known version keeps
/// its `created_at`: versions are content-addressed, so it is the first upload.
pub async fn insert_version(pool: &PgPool, project_id: &Uuid, version: &VersionRef) -> Result<()> {
    let mut tx = pool.begin().await?;
    sqlx::query("INSERT INTO datasets_v2 (project_id, id) VALUES ($1, $2) ON CONFLICT DO NOTHING")
        .bind(project_id)
        .bind(&version.dataset)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "INSERT INTO tasks (project_id, dataset_id, id) VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING",
    )
    .bind(project_id)
    .bind(&version.dataset)
    .bind(&version.task)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "INSERT INTO task_versions (project_id, dataset_id, task_id, hash)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT DO NOTHING",
    )
    .bind(project_id)
    .bind(&version.dataset)
    .bind(&version.task)
    .bind(&version.hash)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(())
}
