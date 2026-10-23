//! Agents, their versions and the versioning job's per-agent progress.
//! Progress times are nanoseconds, matching ClickHouse.

use anyhow::Result;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::utils::sanitize_string;

#[derive(Debug, FromRow)]
pub struct Agent {
    pub id: Uuid,
    /// `None` until generated or set by a user.
    pub name: Option<String>,
    /// Traces starting up to here are labelled.
    pub labeled_until: Option<i64>,
    /// Prompts ingested up to here have been read.
    pub watermark: Option<i64>,
    /// The version at `labeled_until`.
    pub current_version_id: Option<Uuid>,
}

/// Get or create the agent for `agent_hash`.
pub async fn upsert_agent(pool: &PgPool, project_id: Uuid, agent_hash: &str) -> Result<Agent> {
    // The no-op `DO UPDATE` makes `RETURNING` yield the existing row too.
    let agent = sqlx::query_as::<_, Agent>(
        "INSERT INTO agents (project_id, agent_hash)
         VALUES ($1, $2)
         ON CONFLICT (project_id, agent_hash) DO UPDATE SET agent_hash = EXCLUDED.agent_hash
         RETURNING id, name, labeled_until, watermark, current_version_id",
    )
    .bind(project_id)
    .bind(agent_hash)
    .fetch_one(pool)
    .await?;
    Ok(agent)
}

pub async fn save_progress(
    pool: &PgPool,
    agent_id: Uuid,
    labeled_until: Option<i64>,
    watermark: i64,
    current_version_id: Option<Uuid>,
) -> Result<()> {
    sqlx::query(
        "UPDATE agents SET labeled_until = $2, watermark = $3, current_version_id = $4
         WHERE id = $1",
    )
    .bind(agent_id)
    .bind(labeled_until)
    .bind(watermark)
    .bind(current_version_id)
    .execute(pool)
    .await?;
    Ok(())
}

/// Set a generated name, never overwriting one a user already set.
pub async fn set_agent_name(pool: &PgPool, agent_id: Uuid, name: &str) -> Result<()> {
    sqlx::query("UPDATE agents SET name = $2 WHERE id = $1 AND name IS NULL")
        .bind(agent_id)
        .bind(sanitize_string(name))
        .execute(pool)
        .await?;
    Ok(())
}

#[derive(Debug, FromRow)]
pub struct Version {
    pub id: Uuid,
    pub version_hash: String,
    /// Line hashes, bit-cast from `u64`.
    pub core_lines: Vec<i64>,
}

pub async fn get_versions(pool: &PgPool, agent_id: Uuid) -> Result<Vec<Version>> {
    let versions = sqlx::query_as::<_, Version>(
        "SELECT id, version_hash, core_lines FROM agent_versions
         WHERE agent_id = $1
         ORDER BY version_number",
    )
    .bind(agent_id)
    .fetch_all(pool)
    .await?;
    Ok(versions)
}

/// A version's system prompt and tool text (`tool_text::render`), each cut down
/// to its core lines.
#[derive(Debug, Default)]
pub struct VersionText {
    pub system_prompt: String,
    pub tool_definitions: String,
}

/// Insert the agent's next version, or return the existing one with this hash.
pub async fn insert_version(
    pool: &PgPool,
    project_id: Uuid,
    agent_id: Uuid,
    version_hash: &str,
    core_lines: &[i64],
    text: &VersionText,
) -> Result<Uuid> {
    let id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO agent_versions
            (project_id, agent_id, version_number, version_hash, core_lines,
             system_prompt, tool_definitions)
         SELECT $1, $2, COALESCE(MAX(version_number), 0) + 1, $3, $4, $5, $6
         FROM agent_versions WHERE agent_id = $2
         ON CONFLICT (project_id, version_hash) DO UPDATE SET version_hash = EXCLUDED.version_hash
         RETURNING id",
    )
    .bind(project_id)
    .bind(agent_id)
    .bind(version_hash)
    .bind(core_lines)
    .bind(sanitize_string(&text.system_prompt))
    .bind(sanitize_string(&text.tool_definitions))
    .fetch_one(pool)
    .await?;
    Ok(id)
}

/// Record `(version, model)` pairs; existing pairs are kept.
pub async fn insert_models(
    pool: &PgPool,
    project_id: Uuid,
    version_ids: &[Uuid],
    models: &[String],
) -> Result<()> {
    if version_ids.is_empty() {
        return Ok(());
    }
    sqlx::query(
        "INSERT INTO agent_version_models (project_id, agent_version_id, model)
         SELECT $1, * FROM UNNEST($2::uuid[], $3::text[])
         ON CONFLICT DO NOTHING",
    )
    .bind(project_id)
    .bind(version_ids)
    .bind(models)
    .execute(pool)
    .await?;
    Ok(())
}
