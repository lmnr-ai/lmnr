use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

/// Semantic event definition with prompt and schema (from definition or template)
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SemanticEventDefinition {
    pub name: String,
    pub prompt: String,
    pub structured_output_schema: Value,
}

pub async fn get_semantic_event_definition(
    pool: &PgPool,
    event_definition_id: Uuid,
    project_id: Uuid,
) -> Result<Option<SemanticEventDefinition>> {
    let event_def = sqlx::query_as::<_, SemanticEventDefinition>(
        "SELECT name, prompt, structured_output_schema
        FROM semantic_event_definitions
        WHERE id = $1 AND project_id = $2",
    )
    .bind(event_definition_id)
    .bind(project_id)
    .fetch_optional(pool)
    .await?;

    Ok(event_def)
}
