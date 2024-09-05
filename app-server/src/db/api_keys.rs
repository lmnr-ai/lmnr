use std::sync::Arc;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::cache::Cache;

#[derive(Debug, Clone, Deserialize, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ProjectApiKey {
    pub value: String,
    pub project_id: Uuid,
    pub name: Option<String>,
}

pub async fn create_project_api_key(
    db: &PgPool,
    api_key: &ProjectApiKey,
    cache: Arc<Cache>,
) -> Result<()> {
    sqlx::query("INSERT INTO project_api_keys (value, project_id, name) VALUES ($1, $2, $3);")
        .bind(&api_key.value)
        .bind(api_key.project_id)
        .bind(&api_key.name)
        .execute(db)
        .await?;

    let _ = cache
        .insert::<ProjectApiKey>(api_key.value.clone(), api_key)
        .await;

    Ok(())
}

pub async fn get_api_keys_for_project(
    db: &PgPool,
    project_id: &Uuid,
) -> Result<Vec<ProjectApiKey>> {
    let api_keys = sqlx::query_as::<_, ProjectApiKey>(
        "SELECT
            project_api_keys.value,
            project_api_keys.project_id,
            project_api_keys.name
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

pub async fn get_api_key(
    db: &PgPool,
    api_key: &String,
    cache: Arc<Cache>,
) -> Result<ProjectApiKey> {
    let cache_res = cache.get::<ProjectApiKey>(api_key).await;
    match cache_res {
        Ok(Some(api_key)) => return Ok(api_key),
        Ok(None) => {}
        Err(e) => log::error!("Error getting project API key from cache: {}", e),
    }

    let api_key = match sqlx::query_as::<_, ProjectApiKey>(
        "SELECT
            project_api_keys.value,
            project_api_keys.project_id,
            project_api_keys.name
        FROM
            project_api_keys
        WHERE
            project_api_keys.value = $1",
    )
    .bind(api_key)
    .fetch_optional(db)
    .await
    {
        Ok(None) => Err(anyhow::anyhow!("invalid project API key")),
        Ok(Some(api_key_meta)) => {
            let _ = cache
                .insert::<ProjectApiKey>(api_key.clone(), &api_key_meta)
                .await;
            Ok(api_key_meta)
        }
        Err(e) => Err(e.into()),
    }?;

    Ok(api_key)
}

pub async fn delete_api_key(pool: &PgPool, api_key: &String, project_id: &Uuid) -> Result<()> {
    sqlx::query("DELETE FROM project_api_keys WHERE value = $1 AND project_id = $2")
        .bind(api_key)
        .bind(project_id)
        .execute(pool)
        .await?;
    Ok(())
}
