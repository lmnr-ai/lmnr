use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectApiKey {
    pub project_id: Uuid,
    pub name: Option<String>,
    pub hash: String,
    pub shorthand: String,
    pub is_ingest_only: bool,
    // `#[serde(default)]` keeps cache entries written before this column existed
    // deserializable (they decode to `None` = never expires).
    #[serde(default)]
    pub expires_at: Option<DateTime<Utc>>,
}

pub async fn get_api_key(pool: &PgPool, hash: &String) -> Result<ProjectApiKey> {
    let api_key = match sqlx::query_as::<_, ProjectApiKey>(
        "SELECT
            project_api_keys.hash,
            project_api_keys.project_id,
            project_api_keys.name,
            project_api_keys.id,
            project_api_keys.shorthand,
            project_api_keys.is_ingest_only,
            project_api_keys.expires_at
        FROM
            project_api_keys
        WHERE
            project_api_keys.hash = $1",
    )
    .bind(hash)
    .fetch_optional(pool)
    .await
    {
        Ok(None) => Err(anyhow::anyhow!("invalid project API key")),
        Ok(Some(api_key)) => Ok(api_key),
        Err(e) => Err(e.into()),
    }?;

    Ok(api_key)
}

pub async fn delete_api_key_by_hash(pool: &PgPool, hash: &String) -> Result<()> {
    sqlx::query("DELETE FROM project_api_keys WHERE hash = $1")
        .bind(hash)
        .execute(pool)
        .await?;
    Ok(())
}
