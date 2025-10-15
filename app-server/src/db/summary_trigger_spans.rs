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

/// Get summary trigger spans for a project with their associated semantic event definitions
/// Returns all trigger spans for the project
/// Only joins semantic event definitions (is_semantic = true) via the LEFT JOIN condition
/// Triggers without event definitions will have event_definition = None
pub async fn get_summary_trigger_spans_with_events(
    pool: &PgPool,
    project_id: Uuid,
) -> Result<Vec<SummaryTriggerSpanWithEvent>, sqlx::Error> {
    let results = sqlx::query_as::<
        _,
        (
            String,
            Option<Uuid>,
            Option<String>,
            Option<String>,
            Option<Value>,
        ),
    >(
        r#"
        SELECT 
            sts.span_name,
            ed.id,
            ed.name,
            ed.prompt,
            ed.structured_output
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
        .map(|(span_name, id, name, prompt, structured_output)| {
            let event_definition = if let Some(id) = id {
                Some(EventDefinition {
                    id,
                    name: name.unwrap_or_default(),
                    prompt,
                    structured_output: structured_output,
                })
            } else {
                None
            };

            SummaryTriggerSpanWithEvent {
                span_name,
                event_definition,
            }
        })
        .collect())
}
