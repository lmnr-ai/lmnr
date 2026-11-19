use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::eval_datasets::VersionRef;

#[derive(FromRow)]
pub struct EvalDataset {
    pub id: String,
    pub created_at: DateTime<Utc>,
}

/// A row of `task_versions`; `created_at` is when the hash was last uploaded or pushed.
#[derive(Serialize, FromRow, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TaskVersion {
    #[serde(rename = "id")]
    pub task_id: String,
    pub hash: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Serialize, Deserialize, FromRow, Clone, Debug, PartialEq, Eq, Hash)]
pub struct TaskHash {
    pub task: String,
    pub hash: String,
}

pub async fn get_dataset(
    pool: &PgPool,
    project_id: &Uuid,
    dataset_id: &str,
) -> Result<Option<EvalDataset>> {
    let dataset = sqlx::query_as::<_, EvalDataset>(
        "SELECT id, created_at FROM datasets_v2 WHERE project_id = $1 AND id = $2",
    )
    .bind(project_id)
    .bind(dataset_id)
    .fetch_optional(pool)
    .await?;
    Ok(dataset)
}

/// Each task's latest version (greatest `created_at`, then greatest hash), by task id bytewise.
pub async fn get_latest_versions(
    pool: &PgPool,
    project_id: &Uuid,
    dataset_id: &str,
) -> Result<Vec<TaskVersion>> {
    let versions = sqlx::query_as::<_, TaskVersion>(
        "SELECT task_id, hash, created_at FROM (
            SELECT DISTINCT ON (task_id) task_id, hash, created_at
            FROM task_versions
            WHERE project_id = $1 AND dataset_id = $2
            ORDER BY task_id, created_at DESC, hash COLLATE \"C\" DESC
        ) latest
        ORDER BY task_id COLLATE \"C\"",
    )
    .bind(project_id)
    .bind(dataset_id)
    .fetch_all(pool)
    .await?;
    Ok(versions)
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

/// Creates the dataset, task and version rows as needed and makes the version
/// the task's latest.
pub async fn upsert_version(pool: &PgPool, project_id: &Uuid, version: &VersionRef) -> Result<()> {
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
    // statement_timestamp(), not now(): the insert can wait on a push's task lock,
    // and the version must not land with a time from before that push.
    sqlx::query(
        "INSERT INTO task_versions (project_id, dataset_id, task_id, hash, created_at)
        VALUES ($1, $2, $3, $4, statement_timestamp())
        ON CONFLICT (project_id, dataset_id, task_id, hash)
        DO UPDATE SET created_at = statement_timestamp()",
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

/// Locks the dataset's `tasks` rows for `task_ids` in id order, so overlapping
/// pushes queue instead of deadlocking.
pub async fn lock_tasks(
    tx: &mut Transaction<'_, Postgres>,
    project_id: &Uuid,
    dataset_id: &str,
    task_ids: &[&str],
) -> Result<()> {
    sqlx::query(
        "SELECT id FROM tasks
        WHERE project_id = $1 AND dataset_id = $2 AND id = ANY($3)
        ORDER BY id COLLATE \"C\"
        FOR UPDATE",
    )
    .bind(project_id)
    .bind(dataset_id)
    .bind(task_ids)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

/// Every version of the tasks in `task_ids`.
pub async fn get_task_versions(
    tx: &mut Transaction<'_, Postgres>,
    project_id: &Uuid,
    dataset_id: &str,
    task_ids: &[&str],
) -> Result<Vec<TaskVersion>> {
    let versions = sqlx::query_as::<_, TaskVersion>(
        "SELECT task_id, hash, created_at FROM task_versions
        WHERE project_id = $1 AND dataset_id = $2 AND task_id = ANY($3)",
    )
    .bind(project_id)
    .bind(dataset_id)
    .bind(task_ids)
    .fetch_all(&mut **tx)
    .await?;
    Ok(versions)
}

/// Sets `created_at` of each version to now, making it its task's latest.
pub async fn touch_versions(
    tx: &mut Transaction<'_, Postgres>,
    project_id: &Uuid,
    dataset_id: &str,
    versions: &[TaskHash],
) -> Result<Vec<TaskVersion>> {
    let tasks: Vec<&str> = versions.iter().map(|v| v.task.as_str()).collect();
    let hashes: Vec<&str> = versions.iter().map(|v| v.hash.as_str()).collect();
    // statement_timestamp() is taken after the task locks, unlike now().
    let touched = sqlx::query_as::<_, TaskVersion>(
        "UPDATE task_versions tv SET created_at = statement_timestamp()
        FROM UNNEST($3::text[], $4::text[]) AS v(task_id, hash)
        WHERE tv.project_id = $1 AND tv.dataset_id = $2
            AND tv.task_id = v.task_id AND tv.hash = v.hash
        RETURNING tv.task_id, tv.hash, tv.created_at",
    )
    .bind(project_id)
    .bind(dataset_id)
    .bind(&tasks)
    .bind(&hashes)
    .fetch_all(&mut **tx)
    .await?;
    Ok(touched)
}
