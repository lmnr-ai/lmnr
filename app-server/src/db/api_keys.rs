use anyhow::Result;
use serde::Serialize;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

#[derive(Debug, Clone, FromRow)]
pub struct ProjectApiKey {
    pub project_id: Uuid,
    pub name: Option<String>,
    pub hash: String,
    pub shorthand: String,
}

#[derive(Serialize, FromRow)]
pub struct ProjectApiKeyResponse {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: Option<String>,
    pub shorthand: String,
}

pub async fn create_project_api_key(
    pool: &PgPool,
    project_id: &Uuid,
    name: &Option<String>,
    hash: &String,
    shorthand: &String,
) -> Result<ProjectApiKey> {
    let key_info = sqlx::query_as::<_, ProjectApiKey>(
        "INSERT
        INTO project_api_keys (shorthand, project_id, name, hash)
        VALUES ($1, $2, $3, $4)
        RETURNING id, project_id, name, hash, shorthand",
    )
    .bind(&shorthand)
    .bind(&project_id)
    .bind(&name)
    .bind(&hash)
    .fetch_one(pool)
    .await?;

    Ok(key_info)
}

pub async fn get_api_keys_for_project(
    db: &PgPool,
    project_id: &Uuid,
) -> Result<Vec<ProjectApiKeyResponse>> {
    let api_keys = sqlx::query_as::<_, ProjectApiKeyResponse>(
        "SELECT
            project_api_keys.project_id,
            project_api_keys.name,
            project_api_keys.id,
            project_api_keys.shorthand
        FROM
            project_api_keys
        WHERE
            project_api_keys.project_id = $1",
    )
    .bind(project_id)
    .fetch_all(db)
    .await?;

    Ok(api_keys)
}

pub async fn get_api_key(pool: &PgPool, hash: &String) -> Result<ProjectApiKey> {
    let api_key = match sqlx::query_as::<_, ProjectApiKey>(
        "SELECT
            project_api_keys.hash,
            project_api_keys.project_id,
            project_api_keys.name,
            project_api_keys.id,
            project_api_keys.shorthand
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

#[derive(FromRow)]
struct ProjectApiKeyHash {
    hash: String,
}

pub async fn delete_api_key(pool: &PgPool, id: &Uuid, project_id: &Uuid) -> Result<String> {
    let row = sqlx::query_as::<_, ProjectApiKeyHash>(
        "DELETE
        FROM project_api_keys
        WHERE id = $1 AND project_id = $2
        RETURNING hash",
    )
    .bind(id)
    .bind(project_id)
    .fetch_one(pool)
    .await?;

    Ok(row.hash)
}
