//! Hosted-evals agents and task sets, each with versions whose files are one
//! content-addressed blob (`hosted_evals::blob_archive_key`). A version with
//! `number = NULL` is a run snapshot: what a run used, never head.

use std::collections::HashMap;

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use sqlx::{FromRow, PgConnection, PgPool};
use uuid::Uuid;

#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AgentVersion {
    pub id: Uuid,
    pub number: Option<i32>,
    pub hash: String,
    pub git_sha: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TaskSetVersion {
    pub id: Uuid,
    pub number: Option<i32>,
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
    pub agent: &'a str,
    pub task_set: &'a str,
    pub hash: &'a str,
    /// The version the caller's content was based on; it becomes the parent.
    pub base: Option<Uuid>,
    pub tasks: &'a [NewTask],
    pub push: bool,
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSummary {
    pub id: Uuid,
    pub name: String,
    pub head: Option<AgentVersion>,
    pub task_sets: Vec<TaskSetSummary>,
}

/// Creates (or finds, by hash) a version of an agent's scripts, creating the
/// agent on first use. `push` numbers it and makes it head; the repo is the
/// source of truth for scripts, so the last push wins.
pub async fn create_agent_version(
    pool: &PgPool,
    project_id: &Uuid,
    agent: &str,
    hash: &str,
    git_sha: Option<&str>,
    push: bool,
) -> Result<AgentVersion> {
    let mut tx = pool.begin().await?;
    let agent_id = upsert_agent(&mut tx, project_id, agent).await?;
    let version = sqlx::query_as::<_, AgentVersion>(
        "INSERT INTO eval_agent_versions (project_id, eval_agent_id, hash, git_sha)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (eval_agent_id, hash) DO UPDATE SET hash = EXCLUDED.hash
         RETURNING id, number, hash, git_sha, created_at",
    )
    .bind(project_id)
    .bind(agent_id)
    .bind(hash)
    .bind(git_sha)
    .fetch_one(&mut *tx)
    .await?;
    if !push {
        tx.commit().await?;
        return Ok(version);
    }
    let version = match version.number {
        Some(_) => version,
        None => {
            sqlx::query_as::<_, AgentVersion>(
                "UPDATE eval_agent_versions
                 SET number = (SELECT COALESCE(MAX(number), 0) + 1
                               FROM eval_agent_versions WHERE eval_agent_id = $1)
                 WHERE id = $2
                 RETURNING id, number, hash, git_sha, created_at",
            )
            .bind(agent_id)
            .bind(version.id)
            .fetch_one(&mut *tx)
            .await?
        }
    };
    sqlx::query("UPDATE eval_agents SET head_version_id = $1 WHERE id = $2")
        .bind(version.id)
        .bind(agent_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(version)
}

#[derive(FromRow)]
struct TaskSetHead {
    id: Uuid,
    head_version_id: Option<Uuid>,
}

/// Creates (or finds, by hash) a task-set version, creating the agent and the
/// set on first use. With `push`, the version becomes head only if head is
/// still `base` (or already is this version); the set's row lock serializes
/// concurrent pushes.
pub async fn create_task_set_version(
    pool: &PgPool,
    project_id: &Uuid,
    new: &NewTaskSetVersion<'_>,
) -> Result<TaskSetPush> {
    let mut tx = pool.begin().await?;
    let agent_id = upsert_agent(&mut tx, project_id, new.agent).await?;
    let set = sqlx::query_as::<_, TaskSetHead>(
        "INSERT INTO task_sets (project_id, eval_agent_id, name)
         VALUES ($1, $2, $3)
         ON CONFLICT (eval_agent_id, name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id, head_version_id",
    )
    .bind(project_id)
    .bind(agent_id)
    .bind(new.task_set)
    .fetch_one(&mut *tx)
    .await?;

    let existing = sqlx::query_as::<_, TaskSetVersion>(
        "SELECT id, number, hash, parent_id, created_at FROM task_set_versions
         WHERE task_set_id = $1 AND hash = $2",
    )
    .bind(set.id)
    .bind(new.hash)
    .fetch_optional(&mut *tx)
    .await?;
    let version = match existing {
        Some(version) => version,
        None => insert_task_set_version(&mut tx, project_id, &set, new).await?,
    };
    if !new.push || set.head_version_id == Some(version.id) {
        tx.commit().await?;
        return Ok(TaskSetPush::Done(version));
    }
    if set.head_version_id != new.base {
        let head = match set.head_version_id {
            Some(head_id) => Some(
                sqlx::query_as::<_, TaskSetVersion>("SELECT id, number, hash, parent_id, created_at FROM task_set_versions WHERE id = $1")
                .bind(head_id)
                .fetch_one(&mut *tx)
                .await?,
            ),
            None => None,
        };
        return Ok(TaskSetPush::HeadMoved(head));
    }

    let version = match version.number {
        Some(_) => version,
        None => {
            sqlx::query_as::<_, TaskSetVersion>(
                "UPDATE task_set_versions
                 SET number = (SELECT COALESCE(MAX(number), 0) + 1
                               FROM task_set_versions WHERE task_set_id = $1)
                 WHERE id = $2
                 RETURNING id, number, hash, parent_id, created_at",
            )
            .bind(set.id)
            .bind(version.id)
            .fetch_one(&mut *tx)
            .await?
        }
    };
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
    // A base from another set (or project) is dropped rather than linked.
    let version = sqlx::query_as::<_, TaskSetVersion>(
        "INSERT INTO task_set_versions (project_id, task_set_id, hash, parent_id)
         VALUES ($1, $2, $3, COALESCE(
             (SELECT id FROM task_set_versions WHERE id = $4 AND task_set_id = $2),
             $5))
         RETURNING id, number, hash, parent_id, created_at",
    )
    .bind(project_id)
    .bind(set.id)
    .bind(new.hash)
    .bind(new.base)
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

/// Takes the agent's row lock until the transaction ends.
async fn upsert_agent(conn: &mut PgConnection, project_id: &Uuid, name: &str) -> Result<Uuid> {
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO eval_agents (project_id, name)
         VALUES ($1, $2)
         ON CONFLICT (project_id, name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id",
    )
    .bind(project_id)
    .bind(name)
    .fetch_one(conn)
    .await?;
    Ok(id)
}

#[derive(FromRow)]
struct AgentRow {
    id: Uuid,
    name: String,
    head_id: Option<Uuid>,
    head_number: Option<i32>,
    head_hash: Option<String>,
    head_git_sha: Option<String>,
    head_created_at: Option<DateTime<Utc>>,
}

#[derive(FromRow)]
struct TaskSetRow {
    id: Uuid,
    eval_agent_id: Uuid,
    name: String,
    head_id: Option<Uuid>,
    head_number: Option<i32>,
    head_hash: Option<String>,
    head_parent_id: Option<Uuid>,
    head_created_at: Option<DateTime<Utc>>,
}

/// Every agent of the project with its head and its task sets' heads, by name.
pub async fn list_agents(pool: &PgPool, project_id: &Uuid) -> Result<Vec<AgentSummary>> {
    let agents = sqlx::query_as::<_, AgentRow>(
        "SELECT a.id, a.name, v.id AS head_id, v.number AS head_number, v.hash AS head_hash,
                v.git_sha AS head_git_sha, v.created_at AS head_created_at
         FROM eval_agents a
         LEFT JOIN eval_agent_versions v ON v.id = a.head_version_id
         WHERE a.project_id = $1
         ORDER BY lower(a.name), a.name",
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;
    let sets = sqlx::query_as::<_, TaskSetRow>(
        "SELECT s.id, s.eval_agent_id, s.name, v.id AS head_id, v.number AS head_number,
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

    let mut sets_by_agent: HashMap<Uuid, Vec<TaskSetSummary>> = HashMap::new();
    for row in sets {
        let head = match (row.head_id, row.head_hash, row.head_created_at) {
            (Some(id), Some(hash), Some(created_at)) => Some(TaskSetVersion {
                id,
                number: row.head_number,
                hash,
                parent_id: row.head_parent_id,
                created_at,
            }),
            _ => None,
        };
        sets_by_agent
            .entry(row.eval_agent_id)
            .or_default()
            .push(TaskSetSummary {
                id: row.id,
                name: row.name,
                head,
            });
    }
    Ok(agents
        .into_iter()
        .map(|row| {
            let head = match (row.head_id, row.head_hash, row.head_created_at) {
                (Some(id), Some(hash), Some(created_at)) => Some(AgentVersion {
                    id,
                    number: row.head_number,
                    hash,
                    git_sha: row.head_git_sha,
                    created_at,
                }),
                _ => None,
            };
            AgentSummary {
                task_sets: sets_by_agent.remove(&row.id).unwrap_or_default(),
                id: row.id,
                name: row.name,
                head,
            }
        })
        .collect())
}

/// The set's versions, newest first. Empty for an unknown agent or set (a
/// known set always has a version).
pub async fn list_task_set_versions(
    pool: &PgPool,
    project_id: &Uuid,
    agent: &str,
    task_set: &str,
) -> Result<Vec<TaskSetVersion>> {
    let versions = sqlx::query_as::<_, TaskSetVersion>(
        "SELECT v.id, v.number, v.hash, v.parent_id, v.created_at
         FROM task_set_versions v
         JOIN task_sets s ON s.id = v.task_set_id
         JOIN eval_agents a ON a.id = s.eval_agent_id
         WHERE a.project_id = $1 AND a.name = $2 AND s.name = $3
         ORDER BY v.created_at DESC, v.number DESC NULLS LAST",
    )
    .bind(project_id)
    .bind(agent)
    .bind(task_set)
    .fetch_all(pool)
    .await?;
    Ok(versions)
}
