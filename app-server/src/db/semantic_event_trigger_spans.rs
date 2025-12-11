use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use super::semantic_event_definitions::SemanticEventDefinition;

/// Semantic event trigger span with joined event definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticEventTriggerSpanWithDefinition {
    pub span_name: String,
    pub event_definition: SemanticEventDefinition,
}

#[derive(Debug, Clone, sqlx::FromRow)]
struct DBTriggerSpanWithDefinition {
    span_name: String,
    event_definition_name: String,
    prompt: String,
    structured_output_schema: Value,
}

/// Get semantic event trigger spans for a project with their associated event definitions
/// Returns all trigger spans for the project with their event definitions
/// Joins with semantic_event_definitions and templates to get complete prompt/schema
pub async fn get_semantic_event_trigger_spans_with_definitions(
    pool: &PgPool,
    project_id: Uuid,
) -> Result<Vec<SemanticEventTriggerSpanWithDefinition>, sqlx::Error> {
    let results = sqlx::query_as::<_, DBTriggerSpanWithDefinition>(
        r#"
        SELECT 
            set.span_name,
            sed.name as event_definition_name,
            sed.prompt as prompt,
            sed.structured_output_schema as structured_output_schema
        FROM 
            semantic_event_trigger_spans set
        INNER JOIN 
            semantic_event_definitions sed
            ON set.event_definition_id = sed.id
        WHERE 
            set.project_id = $1
        "#,
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    Ok(results
        .into_iter()
        .map(|db_trigger| SemanticEventTriggerSpanWithDefinition {
            span_name: db_trigger.span_name,
            event_definition: SemanticEventDefinition {
                name: db_trigger.event_definition_name,
                prompt: db_trigger.prompt,
                structured_output_schema: db_trigger.structured_output_schema,
            },
        })
        .collect())
}
