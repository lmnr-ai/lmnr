use anyhow::Result;
use serde::Serialize;
use sqlx::{FromRow, PgPool};

use uuid::Uuid;

#[derive(FromRow)]
pub struct SavedApiKey {
    pub name: String,
    pub nonce_hex: String,
    pub value: String,
}

#[derive(FromRow, Serialize)]
pub struct SavedApiKeyResponse {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
}

pub async fn get_api_keys_with_value(pool: &PgPool, project_id: &Uuid) -> Result<Vec<SavedApiKey>> {
    let api_key = sqlx::query_as::<_, SavedApiKey>(
        "SELECT
            name,
            nonce_hex,
            value
        FROM
            provider_api_keys
        WHERE
            project_id = $1
        ORDER BY
            created_at ASC
        ",
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    Ok(api_key)
}

pub async fn save_api_key(
    pool: &PgPool,
    project_id: &Uuid,
    name: &String,
    nonce_hex: &String,
    encoded_value: &String,
) -> Result<SavedApiKey> {
    let api_key = sqlx::query_as::<_, SavedApiKey>(
        "INSERT INTO provider_api_keys (project_id, name, nonce_hex, value)
        VALUES ($1, $2, $3, $4)
        RETURNING name, nonce_hex, value",
    )
    .bind(project_id)
    .bind(name)
    .bind(nonce_hex)
    .bind(encoded_value)
    .fetch_one(pool)
    .await?;

    Ok(api_key)
}
