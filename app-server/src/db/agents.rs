use anyhow::Result;
use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

/// A single agent version row, identified by `(project_id, version_hash)`.
#[derive(Debug, Clone, FromRow)]
pub struct AgentVersion {
    pub project_id: Uuid,
    pub agent_id: Uuid,
    /// BLAKE3-256 hash, hex-encoded (64 chars).
    pub version_hash: String,
    pub system_prompt: String,
    pub tool_definitions: String,
    pub model: String,
    pub created_at: DateTime<Utc>,
}

/// Find the agent that owns a version with this exact `(project_id,
/// version_hash)`. `Some(agent_id)` means the combination already exists, so
/// nothing changed.
pub async fn get_agent_by_version_hash(
    pool: &PgPool,
    project_id: Uuid,
    version_hash: &str,
) -> Result<Option<Uuid>> {
    let agent_id = sqlx::query_scalar::<_, Uuid>(
        "SELECT agent_id
         FROM agent_versions
         WHERE project_id = $1 AND version_hash = $2
         LIMIT 1",
    )
    .bind(project_id)
    .bind(version_hash)
    .fetch_optional(pool)
    .await?;
    Ok(agent_id)
}

/// List the project's agents, each with its most recently created version.
pub async fn list_latest_agent_versions(
    pool: &PgPool,
    project_id: Uuid,
) -> Result<Vec<AgentVersion>> {
    let agents = sqlx::query_as::<_, AgentVersion>(
        "SELECT DISTINCT ON (agent_id)
            project_id, agent_id, version_hash, system_prompt, tool_definitions, model, created_at
         FROM agent_versions
         WHERE project_id = $1
         ORDER BY agent_id, created_at DESC, version_hash DESC",
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;
    Ok(agents)
}

/// Create a brand-new agent and its first version. Returns the new agent id.
pub async fn create_agent(
    pool: &PgPool,
    project_id: Uuid,
    name: &str,
    version_hash: &str,
    system_prompt: &str,
    tool_definitions: &str,
    model: &str,
) -> Result<Uuid> {
    let mut tx = pool.begin().await?;

    let agent_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO agents (project_id, name) VALUES ($1, $2) RETURNING id",
    )
    .bind(project_id)
    .bind(name)
    .fetch_one(&mut *tx)
    .await?;

    sqlx::query(
        "INSERT INTO agent_versions
            (project_id, agent_id, version_hash, system_prompt, tool_definitions, model)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(project_id)
    .bind(agent_id)
    .bind(version_hash)
    .bind(system_prompt)
    .bind(tool_definitions)
    .bind(model)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(agent_id)
}

/// Append a new version for an existing agent whose shape changed.
pub async fn create_new_agent_version(
    pool: &PgPool,
    project_id: Uuid,
    agent_id: Uuid,
    version_hash: &str,
    system_prompt: &str,
    tool_definitions: &str,
    model: &str,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO agent_versions
            (project_id, agent_id, version_hash, system_prompt, tool_definitions, model)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(project_id)
    .bind(agent_id)
    .bind(version_hash)
    .bind(system_prompt)
    .bind(tool_definitions)
    .bind(model)
    .execute(pool)
    .await?;
    Ok(())
}

/// Bump a parent agent's version because one of its subagents changed.
///
/// Unimplemented — the parent's own shape is unchanged, so this needs a
/// design decision on how to represent a "child changed" bump under the
/// `UNIQUE (project_id, version_hash)` constraint.
pub async fn bump_parent_agent_version(
    pool: &PgPool,
    project_id: Uuid,
    parent_id: Uuid,
    changed_child_id: Uuid,
) -> Result<()> {
    // TODO: implement

    let _ = (pool, project_id, parent_id, changed_child_id);
    Ok(())
}
