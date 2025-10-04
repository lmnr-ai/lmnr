use anyhow::Result;
use sqlx::{FromRow, PgPool};

use uuid::Uuid;

#[derive(FromRow)]
pub struct SavedApiKey {
    #[allow(dead_code)]
    pub name: String,
    #[allow(dead_code)]
    pub nonce_hex: String,
    #[allow(dead_code)]
    pub value: String,
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
