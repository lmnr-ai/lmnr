use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct DBProjectApiKey {
    pub project_id: Uuid,
    pub name: Option<String>,
    pub hash: String,
    pub shorthand: String,
}

impl DBProjectApiKey {
    pub fn into_with_raw(self, raw: String) -> ProjectApiKey {
        ProjectApiKey {
            project_id: self.project_id,
            name: self.name,
            hash: self.hash,
            shorthand: self.shorthand,
            raw,
        }
    }
}

#[derive(Clone)]
pub struct ProjectApiKey {
    pub project_id: Uuid,
    pub name: Option<String>,
    pub hash: String,
    pub shorthand: String,
    pub raw: String,
}

impl Into<DBProjectApiKey> for ProjectApiKey {
    fn into(self) -> DBProjectApiKey {
        DBProjectApiKey {
            project_id: self.project_id,
            name: self.name,
            hash: self.hash,
            shorthand: self.shorthand,
        }
    }
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
) -> Result<DBProjectApiKey> {
    let key_info = sqlx::query_as::<_, DBProjectApiKey>(
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

pub async fn get_api_key(pool: &PgPool, hash: &String) -> Result<DBProjectApiKey> {
    let api_key = match sqlx::query_as::<_, DBProjectApiKey>(
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
