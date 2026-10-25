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
    /// The version at `labeled_until`; in release mode, the newest decided
    /// release's.
    pub current_version_id: Option<Uuid>,
    /// Versioned by the SDK's release instead of inferred from prompts.
    pub release_mode: bool,
}

/// Get or create the agent for `agent_hash`.
pub async fn upsert_agent(pool: &PgPool, project_id: Uuid, agent_hash: &str) -> Result<Agent> {
    // The no-op `DO UPDATE` makes `RETURNING` yield the existing row too.
    let agent = sqlx::query_as::<_, Agent>(
        "INSERT INTO agents (project_id, agent_hash)
         VALUES ($1, $2)
         ON CONFLICT (project_id, agent_hash) DO UPDATE SET agent_hash = EXCLUDED.agent_hash
         RETURNING id, name, labeled_until, watermark, current_version_id, release_mode",
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

/// Switch the agent to release mode, for good.
pub async fn set_release_mode(pool: &PgPool, agent_id: Uuid) -> Result<()> {
    sqlx::query("UPDATE agents SET release_mode = true WHERE id = $1")
        .bind(agent_id)
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

#[derive(Debug, FromRow)]
pub struct Release {
    pub id: Uuid,
    pub release: String,
    /// The earliest start of a prompt carrying it, in nanoseconds.
    pub first_seen: i64,
    /// `None` until decided, or after its version was deleted.
    pub version_id: Option<Uuid>,
    /// When the job decided it, in nanoseconds.
    pub decided_at: Option<i64>,
}

/// Record the agent's releases, keeping each one's earliest `first_seen`.
pub async fn upsert_releases(
    pool: &PgPool,
    project_id: Uuid,
    agent_id: Uuid,
    releases: &[String],
    first_seen: &[i64],
) -> Result<()> {
    if releases.is_empty() {
        return Ok(());
    }
    sqlx::query(
        "INSERT INTO agent_releases (project_id, agent_id, release, first_seen)
         SELECT $1, $2, * FROM UNNEST($3::text[], $4::bigint[])
         ON CONFLICT (agent_id, release) DO UPDATE
         SET first_seen = EXCLUDED.first_seen
         WHERE EXCLUDED.first_seen < agent_releases.first_seen",
    )
    .bind(project_id)
    .bind(agent_id)
    .bind(releases)
    .bind(first_seen)
    .execute(pool)
    .await?;
    Ok(())
}

/// The agent's releases, oldest first.
pub async fn get_releases(pool: &PgPool, agent_id: Uuid) -> Result<Vec<Release>> {
    let releases = sqlx::query_as::<_, Release>(
        "SELECT id, release, first_seen, version_id,
                (EXTRACT(EPOCH FROM decided_at) * 1e9)::bigint AS decided_at
         FROM agent_releases
         WHERE agent_id = $1
         ORDER BY first_seen, release",
    )
    .bind(agent_id)
    .fetch_all(pool)
    .await?;
    Ok(releases)
}

pub async fn decide_release(pool: &PgPool, release_id: Uuid, version_id: Uuid) -> Result<()> {
    sqlx::query("UPDATE agent_releases SET version_id = $2, decided_at = now() WHERE id = $1")
        .bind(release_id)
        .bind(version_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// The `version_hash` a release of the agent was decided as, if it was.
pub async fn release_version_hash(
    pool: &PgPool,
    project_id: Uuid,
    agent_hash: &str,
    release: &str,
) -> Result<Option<String>> {
    let hash = sqlx::query_scalar::<_, String>(
        "SELECT v.version_hash
         FROM agents a
         JOIN agent_releases r ON r.agent_id = a.id
         JOIN agent_versions v ON v.id = r.version_id
         WHERE a.project_id = $1 AND a.agent_hash = $2 AND r.release = $3",
    )
    .bind(project_id)
    .bind(agent_hash)
    .bind(release)
    .fetch_optional(pool)
    .await?;
    Ok(hash)
}
