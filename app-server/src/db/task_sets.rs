//! Hosted-evals task sets and their versions. Each version's files are one
//! content-addressed blob (`hosted_evals::blob_archive_key`). Only `eval push`
//! creates versions; runs link their evaluation to the version whose content
//! they ran, if any. Agent scripts live in the user's repo.

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use sqlx::{FromRow, PgConnection, PgPool};
use uuid::Uuid;

#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TaskSetVersion {
    pub id: Uuid,
    pub number: i32,
    pub hash: String,
    pub parent_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
}

pub struct NewTask {
    pub name: String,
    pub digest: String,
    pub metadata: Option<Value>,
}

pub struct NewTaskSetVersion<'a> {
    pub task_set: &'a str,
    pub hash: &'a str,
    /// The version the caller's content was based on; it becomes the parent.
    pub base: Option<Uuid>,
    pub tasks: &'a [NewTask],
}

pub enum TaskSetPush {
    Done(TaskSetVersion),
    /// Head is no longer the caller's base: nothing was written.
    HeadMoved(Option<TaskSetVersion>),
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskSetSummary {
    pub id: Uuid,
    pub name: String,
    pub head: Option<TaskSetVersion>,
}

/// The scripts a project's latest evaluation of a task set ran with.
#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct LatestScripts {
    pub hash: String,
    pub git_sha: Option<String>,
    pub used_at: DateTime<Utc>,
    pub evaluation_id: Uuid,
}

#[derive(FromRow)]
struct TaskSetHead {
    id: Uuid,
    head_version_id: Option<Uuid>,
}

/// Pushes `new` as the set's next version, creating the set on first push.
/// Content equal to head's is a no-op; otherwise head must still be `base`.
/// The set's row lock (taken by the upsert) serializes concurrent pushes.
pub async fn create_task_set_version(
    pool: &PgPool,
    project_id: &Uuid,
    new: &NewTaskSetVersion<'_>,
) -> Result<TaskSetPush> {
    let mut tx = pool.begin().await?;
    let set = sqlx::query_as::<_, TaskSetHead>(
        "INSERT INTO task_sets (project_id, name)
         VALUES ($1, $2)
         ON CONFLICT (project_id, name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id, head_version_id",
    )
    .bind(project_id)
    .bind(new.task_set)
    .fetch_one(&mut *tx)
    .await?;

    let head = match set.head_version_id {
        Some(head_id) => Some(
            sqlx::query_as::<_, TaskSetVersion>(
                "SELECT id, number, hash, parent_id, created_at
                 FROM task_set_versions WHERE id = $1",
            )
            .bind(head_id)
            .fetch_one(&mut *tx)
            .await?,
        ),
        None => None,
    };
    if let Some(head) = head {
        if head.hash == new.hash {
            tx.commit().await?;
            return Ok(TaskSetPush::Done(head));
        }
        if Some(head.id) != new.base {
            return Ok(TaskSetPush::HeadMoved(Some(head)));
        }
    } else if new.base.is_some() {
        return Ok(TaskSetPush::HeadMoved(None));
    }

    let version = insert_task_set_version(&mut tx, project_id, &set, new).await?;
    sqlx::query("UPDATE task_sets SET head_version_id = $1 WHERE id = $2")
        .bind(version.id)
        .bind(set.id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(TaskSetPush::Done(version))
}

async fn insert_task_set_version(
    conn: &mut PgConnection,
    project_id: &Uuid,
    set: &TaskSetHead,
    new: &NewTaskSetVersion<'_>,
) -> Result<TaskSetVersion> {
    let version = sqlx::query_as::<_, TaskSetVersion>(
        "INSERT INTO task_set_versions (project_id, task_set_id, hash, parent_id, number)
         VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX(number), 0) + 1
                                  FROM task_set_versions WHERE task_set_id = $2))
         RETURNING id, number, hash, parent_id, created_at",
    )
    .bind(project_id)
    .bind(set.id)
    .bind(new.hash)
    .bind(set.head_version_id)
    .fetch_one(&mut *conn)
    .await?;

    let names: Vec<&str> = new.tasks.iter().map(|t| t.name.as_str()).collect();
    let digests: Vec<&str> = new.tasks.iter().map(|t| t.digest.as_str()).collect();
    let metadata: Vec<Option<Value>> = new.tasks.iter().map(|t| t.metadata.clone()).collect();
    sqlx::query(
        "INSERT INTO tasks (project_id, task_set_version_id, name, digest, metadata)
         SELECT $1, $2, name, digest, metadata
         FROM UNNEST($3::text[], $4::text[], $5::jsonb[]) AS t(name, digest, metadata)",
    )
    .bind(project_id)
    .bind(version.id)
    .bind(names)
    .bind(digests)
    .bind(metadata)
    .execute(&mut *conn)
    .await?;
    Ok(version)
}

#[derive(FromRow)]
struct TaskSetRow {
    id: Uuid,
    name: String,
    head_id: Option<Uuid>,
    head_number: Option<i32>,
    head_hash: Option<String>,
    head_parent_id: Option<Uuid>,
    head_created_at: Option<DateTime<Utc>>,
}

/// Every task set of the project with its head, by name.
pub async fn list_task_sets(pool: &PgPool, project_id: &Uuid) -> Result<Vec<TaskSetSummary>> {
    let rows = sqlx::query_as::<_, TaskSetRow>(
        "SELECT s.id, s.name, v.id AS head_id, v.number AS head_number,
                v.hash AS head_hash, v.parent_id AS head_parent_id,
                v.created_at AS head_created_at
         FROM task_sets s
         LEFT JOIN task_set_versions v ON v.id = s.head_version_id
         WHERE s.project_id = $1
         ORDER BY lower(s.name), s.name",
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| {
            let head = match (
                row.head_id,
                row.head_number,
                row.head_hash,
                row.head_created_at,
            ) {
                (Some(id), Some(number), Some(hash), Some(created_at)) => Some(TaskSetVersion {
                    id,
                    number,
                    hash,
                    parent_id: row.head_parent_id,
                    created_at,
                }),
                _ => None,
            };
            TaskSetSummary {
                id: row.id,
                name: row.name,
                head,
            }
        })
        .collect())
}

/// The set's versions, newest first. Empty for an unknown set (a known set
/// always has a version).
pub async fn list_task_set_versions(
    pool: &PgPool,
    project_id: &Uuid,
    task_set: &str,
) -> Result<Vec<TaskSetVersion>> {
    let versions = sqlx::query_as::<_, TaskSetVersion>(
        "SELECT v.id, v.number, v.hash, v.parent_id, v.created_at
         FROM task_set_versions v
         JOIN task_sets s ON s.id = v.task_set_id
         WHERE s.project_id = $1 AND s.name = $2
         ORDER BY v.number DESC",
    )
    .bind(project_id)
    .bind(task_set)
    .fetch_all(pool)
    .await?;
    Ok(versions)
}

/// The scripts of the project's latest evaluation of `task_set` (by
/// `hosted_metadata`, which lmnr-cli writes).
pub async fn latest_scripts(
    pool: &PgPool,
    project_id: &Uuid,
    task_set: &str,
) -> Result<Option<LatestScripts>> {
    let scripts = sqlx::query_as::<_, LatestScripts>(
        "SELECT hosted_metadata->>'scriptsHash' AS hash,
                hosted_metadata->>'gitSha' AS git_sha,
                created_at AS used_at,
                id AS evaluation_id
         FROM evaluations
         WHERE project_id = $1
           AND hosted_metadata->>'taskSet' = $2
           AND hosted_metadata->>'scriptsHash' IS NOT NULL
         ORDER BY created_at DESC
         LIMIT 1",
    )
    .bind(project_id)
    .bind(task_set)
    .fetch_optional(pool)
    .await?;
    Ok(scripts)
}
