use anyhow::Result;
use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::utils::sanitize_string;

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

/// Recent agent versions for a project: EVERY agent's newest version, plus up
/// to `extra_versions_limit` additional older-but-still-live versions.
///
/// Returns MULTIPLE versions per agent, not just each agent's latest — variants
/// that run side by side (A/B tests, subversions) sit behind the newest row, and
/// a classifier that can't see them files an incoming variant as a brand-new
/// agent.
///
/// The one-per-agent half is deliberately UNBOUNDED, matching the unbounded
/// `DISTINCT ON (agent_id)` query this replaced: capping it would hide whole
/// agents from classification once a project's agent count exceeded the cap,
/// which is the very duplication bug this function exists to fix. Only the
/// *extra* versions are budgeted, so the bound on the classifier's context is
/// additive rather than a ceiling that can evict an agent.
///
/// Extras are taken rank-major (every agent's 2nd version before any agent's
/// 3rd), so a single agent churning versions can't consume the whole budget,
/// and are capped per agent at `per_agent_limit` total versions.
pub async fn list_recent_agent_versions(
    pool: &PgPool,
    project_id: Uuid,
    per_agent_limit: i64,
    extra_versions_limit: i64,
) -> Result<Vec<AgentVersion>> {
    let versions = sqlx::query_as::<_, AgentVersion>(
        "WITH ranked AS (
             SELECT project_id, agent_id, version_hash, system_prompt, tool_definitions, model,
                    created_at,
                    ROW_NUMBER() OVER (
                        PARTITION BY agent_id ORDER BY created_at DESC, version_hash DESC
                    ) AS rank_in_agent
             FROM agent_versions
             WHERE project_id = $1
         ),
         extras AS (
             SELECT *,
                    ROW_NUMBER() OVER (
                        ORDER BY rank_in_agent, created_at DESC, version_hash DESC
                    ) AS extra_seq
             FROM ranked
             WHERE rank_in_agent > 1 AND rank_in_agent <= $2
         )
         SELECT project_id, agent_id, version_hash, system_prompt, tool_definitions, model,
                created_at, rank_in_agent
         FROM ranked
         WHERE rank_in_agent = 1
         UNION ALL
         SELECT project_id, agent_id, version_hash, system_prompt, tool_definitions, model,
                created_at, rank_in_agent
         FROM extras
         WHERE extra_seq <= $3
         ORDER BY rank_in_agent, created_at DESC, version_hash DESC",
    )
    .bind(project_id)
    .bind(per_agent_limit)
    .bind(extra_versions_limit)
    .fetch_all(pool)
    .await?;
    Ok(versions)
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
    .bind(sanitize_string(name))
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
    .bind(sanitize_string(system_prompt))
    .bind(sanitize_string(tool_definitions))
    .bind(sanitize_string(model))
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
    .bind(sanitize_string(system_prompt))
    .bind(sanitize_string(tool_definitions))
    .bind(sanitize_string(model))
    .execute(pool)
    .await?;
    Ok(())
}
