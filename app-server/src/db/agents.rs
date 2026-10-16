use anyhow::Result;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::utils::sanitize_string;

#[derive(Debug, Clone, FromRow)]
pub struct Agent {
    pub id: Uuid,
    /// `None` until generated or set by a user.
    pub name: Option<String>,
}

/// Get or create the agent for `agent_hash`.
pub async fn upsert_agent(pool: &PgPool, project_id: Uuid, agent_hash: &str) -> Result<Agent> {
    // The no-op `DO UPDATE` makes `RETURNING` yield the existing row too.
    let agent = sqlx::query_as::<_, Agent>(
        "INSERT INTO agents (project_id, agent_hash)
         VALUES ($1, $2)
         ON CONFLICT (project_id, agent_hash) DO UPDATE SET agent_hash = EXCLUDED.agent_hash
         RETURNING id, name",
    )
    .bind(project_id)
    .bind(agent_hash)
    .fetch_one(pool)
    .await?;
    Ok(agent)
}

pub async fn get_agent_name(
    pool: &PgPool,
    project_id: Uuid,
    agent_id: Uuid,
) -> Result<Option<String>> {
    let name = sqlx::query_scalar::<_, Option<String>>(
        "SELECT name FROM agents WHERE project_id = $1 AND id = $2",
    )
    .bind(project_id)
    .bind(agent_id)
    .fetch_optional(pool)
    .await?;
    Ok(name.flatten())
}

/// Set a generated name, never overwriting one a user already set.
pub async fn set_generated_agent_name(
    pool: &PgPool,
    project_id: Uuid,
    agent_id: Uuid,
    name: &str,
) -> Result<()> {
    sqlx::query("UPDATE agents SET name = $3 WHERE project_id = $1 AND id = $2 AND name IS NULL")
        .bind(project_id)
        .bind(agent_id)
        .bind(sanitize_string(name))
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn get_agent_version_id(
    pool: &PgPool,
    project_id: Uuid,
    version_hash: &str,
) -> Result<Option<Uuid>> {
    let id = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM agent_versions WHERE project_id = $1 AND version_hash = $2",
    )
    .bind(project_id)
    .bind(version_hash)
    .fetch_optional(pool)
    .await?;
    Ok(id)
}

/// Tool definitions text of any of the agent's versions with this tool set.
pub async fn get_tool_definitions(
    pool: &PgPool,
    project_id: Uuid,
    agent_id: Uuid,
    tool_definitions_hash: &str,
) -> Result<Option<String>> {
    let text = sqlx::query_scalar::<_, String>(
        "SELECT tool_definitions
         FROM agent_versions
         WHERE project_id = $1 AND agent_id = $2 AND tool_definitions_hash = $3
         LIMIT 1",
    )
    .bind(project_id)
    .bind(agent_id)
    .bind(tool_definitions_hash)
    .fetch_optional(pool)
    .await?;
    Ok(text)
}

pub struct NewAgentVersion<'a> {
    pub project_id: Uuid,
    pub agent_id: Uuid,
    pub version_hash: &'a str,
    pub system_prompt_version_hash: &'a str,
    pub tool_definitions_hash: &'a str,
    pub tool_definitions: &'a str,
}

/// Insert the version as the agent's next `version_number`. `None` when a
/// unique constraint hit: either the version already exists or a concurrent
/// insert took the number.
pub async fn insert_agent_version(
    pool: &PgPool,
    version: &NewAgentVersion<'_>,
) -> Result<Option<Uuid>> {
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO agent_versions (
            project_id, agent_id, version_hash, version_number,
            system_prompt_version_hash, tool_definitions_hash, tool_definitions
         )
         SELECT $1, $2, $3, COALESCE(MAX(version_number), 0) + 1, $4, $5, $6
         FROM agent_versions
         WHERE project_id = $1 AND agent_id = $2
         ON CONFLICT DO NOTHING
         RETURNING id",
    )
    .bind(version.project_id)
    .bind(version.agent_id)
    .bind(version.version_hash)
    .bind(version.system_prompt_version_hash)
    .bind(version.tool_definitions_hash)
    .bind(sanitize_string(version.tool_definitions))
    .fetch_optional(pool)
    .await?;
    Ok(id)
}

pub async fn insert_agent_version_model(
    pool: &PgPool,
    project_id: Uuid,
    agent_version_id: Uuid,
    model: &str,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO agent_version_models (project_id, agent_version_id, model)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING",
    )
    .bind(project_id)
    .bind(agent_version_id)
    .bind(sanitize_string(model))
    .execute(pool)
    .await?;
    Ok(())
}
