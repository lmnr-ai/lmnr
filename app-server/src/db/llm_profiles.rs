use std::collections::HashMap;

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgConnection, PgPool, types::Json};
use uuid::Uuid;

use crate::llm::profiles::{EncryptedSecrets, LlmProfile, LlmProfileProvider, ProfileConfig};

#[derive(FromRow)]
struct LlmProfileRow {
    id: Uuid,
    workspace_id: Uuid,
    name: String,
    provider: String,
    config: Json<serde_json::Value>,
    secrets: Json<serde_json::Value>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    models: Vec<String>,
}

impl TryFrom<LlmProfileRow> for LlmProfile {
    type Error = anyhow::Error;

    fn try_from(row: LlmProfileRow) -> Result<Self> {
        let provider: LlmProfileProvider =
            serde_json::from_value(serde_json::Value::String(row.provider.clone()))
                .with_context(|| format!("unknown LLM profile provider '{}'", row.provider))?;
        let config: ProfileConfig =
            serde_json::from_value(row.config.0).context("invalid LLM profile config")?;
        let secrets: EncryptedSecrets =
            serde_json::from_value(row.secrets.0).context("invalid LLM profile secrets blob")?;
        Ok(LlmProfile {
            id: row.id,
            workspace_id: row.workspace_id,
            name: row.name,
            provider,
            config,
            secrets,
            models: row.models,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
    }
}

/// Scoped to `workspace_id`, so a profile from another workspace reads as absent.
pub async fn get_llm_profile(
    pool: &PgPool,
    workspace_id: Uuid,
    profile_id: Uuid,
) -> Result<Option<LlmProfile>> {
    let row = sqlx::query_as::<_, LlmProfileRow>(
        "SELECT
            p.id,
            p.workspace_id,
            p.name,
            p.provider,
            p.config,
            p.secrets,
            p.created_at,
            p.updated_at,
            COALESCE(
                (SELECT array_agg(m.name ORDER BY m.created_at, m.name)
                 FROM llm_profile_models m WHERE m.profile_id = p.id),
                '{}'
            ) AS models
        FROM llm_profiles p
        WHERE p.id = $1 AND p.workspace_id = $2",
    )
    .bind(profile_id)
    .bind(workspace_id)
    .fetch_optional(pool)
    .await?;
    row.map(LlmProfile::try_from).transpose()
}

/// Every profile in the workspace, ordered case-insensitively by name like the UI.
pub async fn list_llm_profiles(pool: &PgPool, workspace_id: Uuid) -> Result<Vec<LlmProfile>> {
    let rows = sqlx::query_as::<_, LlmProfileRow>(
        "SELECT
            p.id,
            p.workspace_id,
            p.name,
            p.provider,
            p.config,
            p.secrets,
            p.created_at,
            p.updated_at,
            COALESCE(
                (SELECT array_agg(m.name ORDER BY m.created_at, m.name)
                 FROM llm_profile_models m WHERE m.profile_id = p.id),
                '{}'
            ) AS models
        FROM llm_profiles p
        WHERE p.workspace_id = $1
        ORDER BY lower(p.name), p.name",
    )
    .bind(workspace_id)
    .fetch_all(pool)
    .await?;
    rows.into_iter().map(LlmProfile::try_from).collect()
}

/// Raises 23505 on a duplicate `(workspace_id, name)`; callers map it.
pub async fn insert_llm_profile(
    conn: &mut PgConnection,
    id: Uuid,
    workspace_id: Uuid,
    name: &str,
    provider: &str,
    config: &serde_json::Value,
    secrets: &serde_json::Value,
) -> std::result::Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO llm_profiles (id, workspace_id, name, provider, config, secrets)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(id)
    .bind(workspace_id)
    .bind(name)
    .bind(provider)
    .bind(Json(config))
    .bind(Json(secrets))
    .execute(conn)
    .await?;
    Ok(())
}

/// `None` fields keep their stored value; `updated_at` always bumps so the
/// in-process client cache rebuilds. Returns whether the row existed.
pub async fn update_llm_profile(
    conn: &mut PgConnection,
    workspace_id: Uuid,
    profile_id: Uuid,
    name: Option<&str>,
    provider: &str,
    config: &serde_json::Value,
    secrets: &serde_json::Value,
) -> std::result::Result<bool, sqlx::Error> {
    let result = sqlx::query(
        "UPDATE llm_profiles
         SET name = COALESCE($3, name),
             provider = $4,
             config = $5,
             secrets = $6,
             updated_at = now()
         WHERE id = $1 AND workspace_id = $2",
    )
    .bind(profile_id)
    .bind(workspace_id)
    .bind(name)
    .bind(provider)
    .bind(Json(config))
    .bind(Json(secrets))
    .execute(conn)
    .await?;
    Ok(result.rows_affected() > 0)
}

/// Raises 23503 while a signal still references the profile. Returns whether the row existed.
pub async fn delete_llm_profile(
    pool: &PgPool,
    workspace_id: Uuid,
    profile_id: Uuid,
) -> std::result::Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM llm_profiles WHERE id = $1 AND workspace_id = $2")
        .bind(profile_id)
        .bind(workspace_id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn count_signals_using_profile(pool: &PgPool, profile_id: Uuid) -> Result<i64> {
    let count = sqlx::query_scalar("SELECT count(*) FROM signals WHERE llm_profile_id = $1")
        .bind(profile_id)
        .fetch_one(pool)
        .await?;
    Ok(count)
}

pub async fn get_llm_profile_model_names(
    conn: &mut PgConnection,
    profile_id: Uuid,
) -> std::result::Result<Vec<String>, sqlx::Error> {
    sqlx::query_scalar("SELECT name FROM llm_profile_models WHERE profile_id = $1")
        .bind(profile_id)
        .fetch_all(conn)
        .await
}

pub async fn insert_llm_profile_models(
    conn: &mut PgConnection,
    profile_id: Uuid,
    names: &[String],
) -> std::result::Result<(), sqlx::Error> {
    if names.is_empty() {
        return Ok(());
    }
    sqlx::query(
        "INSERT INTO llm_profile_models (profile_id, name)
         SELECT $1, unnest($2::text[])",
    )
    .bind(profile_id)
    .bind(names)
    .execute(conn)
    .await?;
    Ok(())
}

/// Raises 23503 for a model a signal still pins.
pub async fn delete_llm_profile_models(
    conn: &mut PgConnection,
    profile_id: Uuid,
    names: &[String],
) -> std::result::Result<(), sqlx::Error> {
    if names.is_empty() {
        return Ok(());
    }
    sqlx::query("DELETE FROM llm_profile_models WHERE profile_id = $1 AND name = ANY($2)")
        .bind(profile_id)
        .bind(names)
        .execute(conn)
        .await?;
    Ok(())
}

pub async fn get_llm_profile_name(pool: &PgPool, profile_id: Uuid) -> Result<Option<String>> {
    let name = sqlx::query_scalar("SELECT name FROM llm_profiles WHERE id = $1")
        .bind(profile_id)
        .fetch_optional(pool)
        .await?;
    Ok(name)
}

/// `id → name` for the given profiles; ids without a row are absent.
pub async fn get_llm_profile_names(
    pool: &PgPool,
    profile_ids: &[Uuid],
) -> Result<HashMap<Uuid, String>> {
    if profile_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let rows: Vec<(Uuid, String)> =
        sqlx::query_as("SELECT id, name FROM llm_profiles WHERE id = ANY($1)")
            .bind(profile_ids)
            .fetch_all(pool)
            .await?;
    Ok(rows.into_iter().collect())
}

/// Profile name + model names for `profile_id`, scoped to `workspace_id` so a
/// profile from another workspace reads as absent.
pub async fn get_llm_profile_route_info(
    pool: &PgPool,
    workspace_id: Uuid,
    profile_id: Uuid,
) -> Result<Option<(String, Vec<String>)>> {
    let row: Option<(String, Vec<String>)> = sqlx::query_as(
        "SELECT
            p.name,
            COALESCE(
                (SELECT array_agg(m.name ORDER BY m.created_at, m.name)
                 FROM llm_profile_models m WHERE m.profile_id = p.id),
                '{}'
            ) AS models
        FROM llm_profiles p
        WHERE p.workspace_id = $1 AND p.id = $2",
    )
    .bind(workspace_id)
    .bind(profile_id)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}
