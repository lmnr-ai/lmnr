use anyhow::Result;
use chrono::{DateTime, Utc};
use indexmap::IndexMap;
use sqlx::{FromRow, PgConnection, PgPool};
use uuid::Uuid;

use crate::eval_datasets::TaskVersion;

#[derive(FromRow)]
pub struct DatasetSummary {
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub task_count: i64,
}

#[derive(FromRow)]
pub struct TaskVersionRow {
    pub name: String,
    pub hash: String,
    pub created_at: DateTime<Utc>,
}

/// Parallel `unnest` arrays of a `{task: hash}` map, in its order.
struct TaskHashArrays {
    tasks: Vec<String>,
    hashes: Vec<String>,
}

impl TaskHashArrays {
    fn new(map: &IndexMap<String, String>) -> Self {
        Self {
            tasks: map.keys().cloned().collect(),
            hashes: map.values().cloned().collect(),
        }
    }
}

pub async fn list_datasets(pool: &PgPool, project_id: &Uuid) -> Result<Vec<DatasetSummary>> {
    let datasets = sqlx::query_as::<_, DatasetSummary>(
        "SELECT d.id AS name, d.created_at,
             COALESCE(
                 (SELECT max(v.created_at) FROM task_versions v
                  WHERE v.project_id = d.project_id AND v.dataset_id = d.id),
                 d.created_at
             ) AS updated_at,
             (SELECT count(*) FROM tasks t
              WHERE t.project_id = d.project_id AND t.dataset_id = d.id) AS task_count
         FROM datasets_v2 d
         WHERE d.project_id = $1
         ORDER BY lower(d.id), d.id",
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;
    Ok(datasets)
}

pub async fn dataset_exists(pool: &PgPool, project_id: &Uuid, dataset: &str) -> Result<bool> {
    let exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM datasets_v2 WHERE project_id = $1 AND id = $2)",
    )
    .bind(project_id)
    .bind(dataset)
    .fetch_one(pool)
    .await?;
    Ok(exists)
}

/// Each task's latest version: greatest `created_at`, then greatest hash.
pub async fn latest_task_versions(
    pool: &PgPool,
    project_id: &Uuid,
    dataset: &str,
) -> Result<Vec<TaskVersionRow>> {
    // Sorted in byte order, like the push response and lmnr-cli.
    let tasks = sqlx::query_as::<_, TaskVersionRow>(
        "SELECT name, hash, created_at FROM (
             SELECT DISTINCT ON (task_id) task_id AS name, hash, created_at
             FROM task_versions
             WHERE project_id = $1 AND dataset_id = $2
             ORDER BY task_id, created_at DESC, hash DESC
         ) latest
         ORDER BY name COLLATE \"C\"",
    )
    .bind(project_id)
    .bind(dataset)
    .fetch_all(pool)
    .await?;
    Ok(tasks)
}

/// Tasks of `tasks` whose hash has no version row, in input order.
pub async fn missing_task_versions(
    pool: &PgPool,
    project_id: &Uuid,
    dataset: &str,
    tasks: &IndexMap<String, String>,
) -> Result<Vec<String>> {
    let arrays = TaskHashArrays::new(tasks);
    let missing = sqlx::query_scalar::<_, String>(
        "SELECT t.task
         FROM unnest($3::text[], $4::text[]) WITH ORDINALITY AS t(task, hash, ord)
         WHERE NOT EXISTS (
             SELECT 1 FROM task_versions v
             WHERE v.project_id = $1 AND v.dataset_id = $2
                 AND v.task_id = t.task AND v.hash = t.hash
         )
         ORDER BY t.ord",
    )
    .bind(project_id)
    .bind(dataset)
    .bind(&arrays.tasks)
    .bind(&arrays.hashes)
    .fetch_all(pool)
    .await?;
    Ok(missing)
}

pub async fn task_version_exists(
    pool: &PgPool,
    project_id: &Uuid,
    version: &TaskVersion<'_>,
) -> Result<bool> {
    let exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (
             SELECT 1 FROM task_versions
             WHERE project_id = $1 AND dataset_id = $2 AND task_id = $3 AND hash = $4
         )",
    )
    .bind(project_id)
    .bind(version.dataset)
    .bind(version.task)
    .bind(version.hash)
    .fetch_one(pool)
    .await?;
    Ok(exists)
}

/// Records an uploaded version, creating its dataset and task on first use.
/// An existing version keeps its `created_at`.
pub async fn insert_task_version(
    pool: &PgPool,
    project_id: &Uuid,
    version: &TaskVersion<'_>,
) -> Result<()> {
    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO datasets_v2 (project_id, id) VALUES ($1, $2)
         ON CONFLICT (project_id, id) DO NOTHING",
    )
    .bind(project_id)
    .bind(version.dataset)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "INSERT INTO tasks (project_id, dataset_id, id) VALUES ($1, $2, $3)
         ON CONFLICT (project_id, dataset_id, id) DO NOTHING",
    )
    .bind(project_id)
    .bind(version.dataset)
    .bind(version.task)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "INSERT INTO task_versions (project_id, dataset_id, task_id, hash) VALUES ($1, $2, $3, $4)
         ON CONFLICT (project_id, dataset_id, task_id, hash) DO NOTHING",
    )
    .bind(project_id)
    .bind(version.dataset)
    .bind(version.task)
    .bind(version.hash)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(())
}

/// Locks the given tasks' rows, in name order so overlapping pushes queue
/// instead of deadlocking.
pub async fn lock_tasks(
    conn: &mut PgConnection,
    project_id: &Uuid,
    dataset: &str,
    tasks: &[String],
) -> sqlx::Result<()> {
    sqlx::query(
        "SELECT id FROM tasks
         WHERE project_id = $1 AND dataset_id = $2 AND id = ANY($3)
         ORDER BY id COLLATE \"C\"
         FOR UPDATE",
    )
    .bind(project_id)
    .bind(dataset)
    .bind(tasks)
    .execute(conn)
    .await?;
    Ok(())
}

/// Tasks, in input order, whose newest version other than the one being
/// pushed isn't `bases[i]` (`None`: the task must have no other version).
/// Leaving out the pushed hash discounts its own upload, which already made
/// it latest.
pub async fn moved_tasks(
    conn: &mut PgConnection,
    project_id: &Uuid,
    dataset: &str,
    tasks: &IndexMap<String, String>,
    bases: &[Option<String>],
) -> sqlx::Result<Vec<String>> {
    let arrays = TaskHashArrays::new(tasks);
    sqlx::query_scalar::<_, String>(
        "SELECT t.task
         FROM unnest($3::text[], $4::text[], $5::text[]) WITH ORDINALITY AS t(task, hash, base, ord)
         CROSS JOIN LATERAL (
             SELECT v.hash FROM task_versions v
             WHERE v.project_id = $1 AND v.dataset_id = $2
                 AND v.task_id = t.task AND v.hash <> t.hash
             ORDER BY v.created_at DESC, v.hash DESC
             LIMIT 1
         ) other
         WHERE other.hash IS DISTINCT FROM t.base
         ORDER BY t.ord",
    )
    .bind(project_id)
    .bind(dataset)
    .bind(&arrays.tasks)
    .bind(&arrays.hashes)
    .bind(bases)
    .fetch_all(conn)
    .await
}

/// Stamps `created_at = now()` on each existing (task, hash) version row and
/// returns the stamped rows. Pairs without a row are skipped.
pub async fn touch_task_versions(
    conn: &mut PgConnection,
    project_id: &Uuid,
    dataset: &str,
    tasks: &IndexMap<String, String>,
) -> sqlx::Result<Vec<TaskVersionRow>> {
    let arrays = TaskHashArrays::new(tasks);
    sqlx::query_as::<_, TaskVersionRow>(
        "UPDATE task_versions v SET created_at = now()
         FROM unnest($3::text[], $4::text[]) AS t(task, hash)
         WHERE v.project_id = $1 AND v.dataset_id = $2
             AND v.task_id = t.task AND v.hash = t.hash
         RETURNING v.task_id AS name, v.hash, v.created_at",
    )
    .bind(project_id)
    .bind(dataset)
    .bind(&arrays.tasks)
    .bind(&arrays.hashes)
    .fetch_all(conn)
    .await
}
