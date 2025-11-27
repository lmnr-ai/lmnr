use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

#[derive(FromRow, Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Playground {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub name: String,
    pub project_id: Uuid,
    #[sqlx(json)]
    pub prompt_messages: Value,
    pub model_id: String,
    pub output_schema: Option<String>,
    pub max_tokens: Option<i32>,
    pub temperature: Option<f32>,
    #[sqlx(json)]
    pub provider_options: Option<Value>,
    #[sqlx(json)]
    pub tool_choice: Option<Value>,
    #[sqlx(json)]
    pub tools: Option<Value>,
}

/// Get a playground by ID and project ID
pub async fn get_playground(
    pool: &PgPool,
    id: Uuid,
    project_id: Uuid,
) -> Result<Option<Playground>> {
    let playground = sqlx::query_as::<_, Playground>(
        r#"
        SELECT id, created_at, name, project_id, prompt_messages, model_id, 
               output_schema, max_tokens, temperature, provider_options, 
               tool_choice, tools
        FROM playgrounds
        WHERE id = $1 AND project_id = $2
        "#,
    )
    .bind(id)
    .bind(project_id)
    .fetch_optional(pool)
    .await?;

    Ok(playground)
}

/// Check if a playground exists
pub async fn playground_exists(pool: &PgPool, id: Uuid, project_id: Uuid) -> Result<bool> {
    let exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM playgrounds WHERE id = $1 AND project_id = $2)",
    )
    .bind(id)
    .bind(project_id)
    .fetch_one(pool)
    .await?;

    Ok(exists)
}

