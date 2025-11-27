use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

#[derive(FromRow, Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProviderApiKey {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub name: String,
    pub project_id: Uuid,
    pub nonce_hex: String,
    pub value: String,
}

/// Get a provider API key by name and project ID
pub async fn get_provider_api_key_by_name(
    pool: &PgPool,
    name: &str,
    project_id: Uuid,
) -> Result<Option<ProviderApiKey>> {
    let key = sqlx::query_as::<_, ProviderApiKey>(
        r#"
        SELECT id, created_at, name, project_id, nonce_hex, value
        FROM provider_api_keys
        WHERE name = $1 AND project_id = $2
        "#,
    )
    .bind(name)
    .bind(project_id)
    .fetch_optional(pool)
    .await?;

    Ok(key)
}
