use anyhow::Result;
use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgConnection, PgPool};
use uuid::Uuid;

#[derive(FromRow)]
pub struct EvalDatasetSummary {
    pub id: Uuid,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub latest_version: Option<i32>,
}

#[derive(FromRow)]
pub struct EvalDatasetVersion {
    pub id: Uuid,
    pub dataset_id: Uuid,
    pub dataset: String,
    pub version: i32,
    pub parent_version: Option<i32>,
    pub message: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(FromRow)]
pub struct VersionTask {
    pub name: String,
    pub hash: String,
}

pub struct NewVersion<'a> {
    pub dataset_id: Uuid,
    pub version: i32,
    pub parent_version: Option<i32>,
    pub message: Option<&'a str>,
    pub created_by_user_id: Option<Uuid>,
}

/// `hashes` without a blob row in the project, in input order.
pub async fn missing_blobs(
    pool: &PgPool,
    project_id: &Uuid,
    hashes: &[String],
) -> Result<Vec<String>> {
    let missing = sqlx::query_scalar::<_, String>(
        "SELECT h.hash
         FROM unnest($2::text[]) WITH ORDINALITY AS h(hash, ord)
         WHERE NOT EXISTS (
             SELECT 1 FROM eval_dataset_task_blobs b
             WHERE b.project_id = $1 AND b.hash = h.hash
         )
         ORDER BY h.ord",
    )
    .bind(project_id)
    .bind(hashes)
    .fetch_all(pool)
    .await?;
    Ok(missing)
}

pub async fn blob_exists(pool: &PgPool, project_id: &Uuid, hash: &str) -> Result<bool> {
    let exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (
             SELECT 1 FROM eval_dataset_task_blobs WHERE project_id = $1 AND hash = $2
         )",
    )
    .bind(project_id)
    .bind(hash)
    .fetch_one(pool)
    .await?;
    Ok(exists)
}

pub async fn upsert_blob(pool: &PgPool, project_id: &Uuid, hash: &str, size: i64) -> Result<()> {
    sqlx::query(
        "INSERT INTO eval_dataset_task_blobs (project_id, hash, size)
         VALUES ($1, $2, $3)
         ON CONFLICT (project_id, hash) DO UPDATE SET size = EXCLUDED.size",
    )
    .bind(project_id)
    .bind(hash)
    .bind(size)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn list_datasets(pool: &PgPool, project_id: &Uuid) -> Result<Vec<EvalDatasetSummary>> {
    let datasets = sqlx::query_as::<_, EvalDatasetSummary>(
        "SELECT d.id, d.name, d.created_at,
             (SELECT max(v.version) FROM eval_dataset_versions v WHERE v.dataset_id = d.id)
                 AS latest_version
         FROM eval_datasets d
         WHERE d.project_id = $1
         ORDER BY lower(d.name), d.name",
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;
    Ok(datasets)
}

/// `version: None` reads the dataset's latest version.
pub async fn get_version(
    pool: &PgPool,
    project_id: &Uuid,
    dataset: &str,
    version: Option<i32>,
) -> Result<Option<EvalDatasetVersion>> {
    let row = sqlx::query_as::<_, EvalDatasetVersion>(
        "SELECT v.id, d.id AS dataset_id, d.name AS dataset, v.version, v.parent_version,
             v.message, v.created_at
         FROM eval_datasets d
         JOIN eval_dataset_versions v ON v.dataset_id = d.id
         WHERE d.project_id = $1 AND d.name = $2 AND ($3::int IS NULL OR v.version = $3)
         ORDER BY v.version DESC
         LIMIT 1",
    )
    .bind(project_id)
    .bind(dataset)
    .bind(version)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn get_version_tasks(pool: &PgPool, version_id: &Uuid) -> Result<Vec<VersionTask>> {
    let tasks = sqlx::query_as::<_, VersionTask>(
        "SELECT name, hash FROM eval_dataset_version_tasks WHERE version_id = $1",
    )
    .bind(version_id)
    .fetch_all(pool)
    .await?;
    Ok(tasks)
}

/// Creates the dataset if needed and returns its id. On an existing row the
/// no-op update takes its row lock, which serializes concurrent version
/// creation for the rest of the transaction.
pub async fn lock_or_create_dataset(
    conn: &mut PgConnection,
    project_id: &Uuid,
    name: &str,
) -> sqlx::Result<Uuid> {
    sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO eval_datasets (project_id, name)
         VALUES ($1, $2)
         ON CONFLICT (project_id, name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id",
    )
    .bind(project_id)
    .bind(name)
    .fetch_one(conn)
    .await
}

pub async fn version_exists(
    conn: &mut PgConnection,
    dataset_id: &Uuid,
    version: i32,
) -> sqlx::Result<bool> {
    sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (
             SELECT 1 FROM eval_dataset_versions WHERE dataset_id = $1 AND version = $2
         )",
    )
    .bind(dataset_id)
    .bind(version)
    .fetch_one(conn)
    .await
}

pub async fn latest_version(
    conn: &mut PgConnection,
    dataset_id: &Uuid,
) -> sqlx::Result<Option<i32>> {
    sqlx::query_scalar::<_, Option<i32>>(
        "SELECT max(version) FROM eval_dataset_versions WHERE dataset_id = $1",
    )
    .bind(dataset_id)
    .fetch_one(conn)
    .await
}

/// Inserts the version and its tasks (`names[i]` → `hashes[i]`). A taken
/// `(dataset_id, version)` fails with a unique violation.
pub async fn insert_version(
    conn: &mut PgConnection,
    version: &NewVersion<'_>,
    names: &[String],
    hashes: &[String],
) -> sqlx::Result<()> {
    let version_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO eval_dataset_versions
             (dataset_id, version, parent_version, message, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id",
    )
    .bind(version.dataset_id)
    .bind(version.version)
    .bind(version.parent_version)
    .bind(version.message)
    .bind(version.created_by_user_id)
    .fetch_one(&mut *conn)
    .await?;

    sqlx::query(
        "INSERT INTO eval_dataset_version_tasks (version_id, name, hash)
         SELECT $1, t.name, t.hash FROM unnest($2::text[], $3::text[]) AS t(name, hash)",
    )
    .bind(version_id)
    .bind(names)
    .bind(hashes)
    .execute(conn)
    .await?;
    Ok(())
}
