//! Postgres state of agent versioning (`agent_versioning`): each agent's
//! watermarks on `agents`, its versions in `agent_versions` and its timeline
//! of changes in `agent_version_changes`.
//!
//! Line hashes are `u64` in the app and `bigint` here, cast bit for bit.

use anyhow::Result;
use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

#[derive(Debug, Clone, FromRow)]
pub struct AgentRow {
    pub id: Uuid,
    pub name: Option<String>,
    pub labelled_until: Option<DateTime<Utc>>,
    pub held_until: Option<DateTime<Utc>>,
}

/// Get or create the agent for `agent_hash`.
pub async fn upsert_agent(pool: &PgPool, project_id: Uuid, agent_hash: &str) -> Result<AgentRow> {
    // The no-op `DO UPDATE` makes `RETURNING` yield the existing row too.
    let agent = sqlx::query_as::<_, AgentRow>(
        "INSERT INTO agents (project_id, agent_hash)
         VALUES ($1, $2)
         ON CONFLICT (project_id, agent_hash) DO UPDATE SET agent_hash = EXCLUDED.agent_hash
         RETURNING id, name, labelled_until, held_until",
    )
    .bind(project_id)
    .bind(agent_hash)
    .fetch_one(pool)
    .await?;
    Ok(agent)
}

#[derive(Debug, Clone, FromRow)]
pub struct VersionRow {
    pub id: Uuid,
    pub version_number: i32,
    pub core: Vec<i64>,
    pub since: DateTime<Utc>,
    pub example_trace_id: Uuid,
}

/// The agent's versions by version number.
pub async fn get_versions(
    pool: &PgPool,
    project_id: Uuid,
    agent_id: Uuid,
) -> Result<Vec<VersionRow>> {
    let versions = sqlx::query_as::<_, VersionRow>(
        "SELECT id, version_number, core, since, example_trace_id
         FROM agent_versions
         WHERE project_id = $1 AND agent_id = $2
         ORDER BY version_number",
    )
    .bind(project_id)
    .bind(agent_id)
    .fetch_all(pool)
    .await?;
    Ok(versions)
}

#[derive(Debug, Clone, FromRow)]
pub struct ChangeRow {
    pub change_number: i32,
    /// `None` for the agent's first version.
    pub from_version: Option<i32>,
    pub to_version: i32,
    pub overlap_from: DateTime<Utc>,
    pub since: DateTime<Utc>,
}

/// The agent's timeline by change number, versions by version number.
pub async fn get_changes(
    pool: &PgPool,
    project_id: Uuid,
    agent_id: Uuid,
) -> Result<Vec<ChangeRow>> {
    let changes = sqlx::query_as::<_, ChangeRow>(
        "SELECT c.change_number,
                f.version_number AS from_version,
                t.version_number AS to_version,
                c.overlap_from,
                c.since
         FROM agent_version_changes c
         LEFT JOIN agent_versions f ON f.id = c.from_version_id
         JOIN agent_versions t ON t.id = c.to_version_id
         WHERE c.project_id = $1 AND c.agent_id = $2
         ORDER BY c.change_number",
    )
    .bind(project_id)
    .bind(agent_id)
    .fetch_all(pool)
    .await?;
    Ok(changes)
}

pub async fn get_version_content(
    pool: &PgPool,
    project_id: Uuid,
    version_id: Uuid,
) -> Result<Option<String>> {
    let content = sqlx::query_scalar::<_, String>(
        "SELECT content FROM agent_versions WHERE project_id = $1 AND id = $2",
    )
    .bind(project_id)
    .bind(version_id)
    .fetch_optional(pool)
    .await?;
    Ok(content)
}

#[derive(Debug, Clone)]
pub struct NewVersion {
    pub id: Uuid,
    pub version_number: i32,
    pub core: Vec<i64>,
    pub content: String,
    pub since: DateTime<Utc>,
    pub example_trace_id: Uuid,
}

/// A stored version whose core grew.
#[derive(Debug, Clone)]
pub struct RefinedVersion {
    pub id: Uuid,
    pub core: Vec<i64>,
    pub content: String,
}

#[derive(Debug, Clone)]
pub struct NewChange {
    pub change_number: i32,
    pub from_version_id: Option<Uuid>,
    pub to_version_id: Uuid,
    pub overlap_from: DateTime<Utc>,
    pub since: DateTime<Utc>,
    pub added: Vec<i64>,
    pub removed: Vec<i64>,
    pub example_trace_before: Option<Uuid>,
    pub example_trace_after: Uuid,
}

/// A stored change whose diff moved with a refined version.
#[derive(Debug, Clone)]
pub struct ChangeDiff {
    pub change_number: i32,
    pub added: Vec<i64>,
    pub removed: Vec<i64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Watermarks {
    pub labelled_until: Option<DateTime<Utc>>,
    pub held_until: Option<DateTime<Utc>>,
}

/// Everything one detection run changed for one agent.
#[derive(Debug, Clone)]
pub struct RunChanges {
    pub new_versions: Vec<NewVersion>,
    pub refined_versions: Vec<RefinedVersion>,
    pub new_changes: Vec<NewChange>,
    pub change_diffs: Vec<ChangeDiff>,
    /// The watermarks the run started from.
    pub previous: Watermarks,
    pub next: Watermarks,
}

/// Commits one run in one transaction. Returns `false` and writes nothing when
/// the agent's watermarks no longer match the ones the run started from.
pub async fn save_run(
    pool: &PgPool,
    project_id: Uuid,
    agent_id: Uuid,
    changes: &RunChanges,
) -> Result<bool> {
    let mut tx = pool.begin().await?;

    // First, so the row lock serializes concurrent saves of the agent.
    let updated = sqlx::query(
        "UPDATE agents SET labelled_until = $5, held_until = $6
         WHERE project_id = $1 AND id = $2
           AND labelled_until IS NOT DISTINCT FROM $3
           AND held_until IS NOT DISTINCT FROM $4",
    )
    .bind(project_id)
    .bind(agent_id)
    .bind(changes.previous.labelled_until)
    .bind(changes.previous.held_until)
    .bind(changes.next.labelled_until)
    .bind(changes.next.held_until)
    .execute(&mut *tx)
    .await?;
    if updated.rows_affected() == 0 {
        tx.rollback().await?;
        return Ok(false);
    }

    for version in &changes.new_versions {
        sqlx::query(
            "INSERT INTO agent_versions
                (id, project_id, agent_id, version_number, core, content, since, example_trace_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        )
        .bind(version.id)
        .bind(project_id)
        .bind(agent_id)
        .bind(version.version_number)
        .bind(&version.core)
        .bind(&version.content)
        .bind(version.since)
        .bind(version.example_trace_id)
        .execute(&mut *tx)
        .await?;
    }

    for version in &changes.refined_versions {
        sqlx::query(
            "UPDATE agent_versions SET core = $3, content = $4
             WHERE project_id = $1 AND id = $2",
        )
        .bind(project_id)
        .bind(version.id)
        .bind(&version.core)
        .bind(&version.content)
        .execute(&mut *tx)
        .await?;
    }

    for change in &changes.new_changes {
        sqlx::query(
            "INSERT INTO agent_version_changes
                (project_id, agent_id, change_number, from_version_id, to_version_id,
                 overlap_from, since, added, removed, example_trace_before, example_trace_after)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
        )
        .bind(project_id)
        .bind(agent_id)
        .bind(change.change_number)
        .bind(change.from_version_id)
        .bind(change.to_version_id)
        .bind(change.overlap_from)
        .bind(change.since)
        .bind(&change.added)
        .bind(&change.removed)
        .bind(change.example_trace_before)
        .bind(change.example_trace_after)
        .execute(&mut *tx)
        .await?;
    }

    for diff in &changes.change_diffs {
        sqlx::query(
            "UPDATE agent_version_changes SET added = $4, removed = $5
             WHERE project_id = $1 AND agent_id = $2 AND change_number = $3",
        )
        .bind(project_id)
        .bind(agent_id)
        .bind(diff.change_number)
        .bind(&diff.added)
        .bind(&diff.removed)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(true)
}
