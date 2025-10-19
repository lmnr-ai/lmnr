use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

/// Event definition with semantic analysis configuration
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct EventDefinition {
    pub id: Uuid,
    pub name: String,
    pub prompt: Option<String>,
    pub structured_output: Option<Value>,
}

/// Summary trigger span with joined event definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SummaryTriggerSpanWithEvent {
    pub span_name: String,
    pub event_definition: Option<EventDefinition>,
}

#[derive(Debug, Clone, sqlx::FromRow)]
struct DBTriggerSpanWithEvent {
    span_name: String,
    event_definition_id: Option<Uuid>,
    event_definition_name: Option<String>,
    event_definition_prompt: Option<String>,
    event_definition_structured_output: Option<Value>,
}

/// Get summary trigger spans for a project with their associated semantic event definitions
/// Returns all trigger spans for the project
/// Only joins semantic event definitions (is_semantic = true) via the LEFT JOIN condition
/// Triggers without event definitions will have event_definition = None
pub async fn get_summary_trigger_spans_with_events(
    pool: &PgPool,
    project_id: Uuid,
) -> Result<Vec<SummaryTriggerSpanWithEvent>, sqlx::Error> {
    let results = sqlx::query_as::<_, DBTriggerSpanWithEvent>(
        r#"
        SELECT 
            sts.span_name as span_name,
            ed.id as event_definition_id,
            ed.name as event_definition_name,
            ed.prompt as event_definition_prompt,
            ed.structured_output as event_definition_structured_output
        FROM 
            summary_trigger_spans sts
        LEFT JOIN 
            event_definitions ed 
            ON sts.event_name = ed.name 
            AND sts.project_id = ed.project_id
            AND ed.is_semantic = true
        WHERE 
            sts.project_id = $1
        "#,
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    Ok(results
        .into_iter()
        .map(|db_trigger_span_with_event| {
            let event_definition = if let Some(id) = db_trigger_span_with_event.event_definition_id
            {
                Some(EventDefinition {
                    id,
                    name: db_trigger_span_with_event
                        .event_definition_name
                        .unwrap_or_default(),
                    prompt: db_trigger_span_with_event.event_definition_prompt,
                    structured_output: db_trigger_span_with_event
                        .event_definition_structured_output,
                })
            } else {
                None
            };

            SummaryTriggerSpanWithEvent {
                span_name: db_trigger_span_with_event.span_name,
                event_definition,
            }
        })
        .collect())
}
