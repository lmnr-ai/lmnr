use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use super::signals::Signal;
use super::utils::Filter;

/// Signal trigger with pre-parsed filters
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignalTrigger {
    pub filters: Vec<Filter>,
    pub signal: Signal,
}

#[derive(Debug, Clone, sqlx::FromRow)]
struct DBSignalTrigger {
    value: serde_json::Value,
    signal_name: String,
    prompt: String,
    structured_output_schema: Value,
}

/// Returns all signal triggers for the project with pre-parsed filters
pub async fn get_signal_triggers(
    pool: &PgPool,
    project_id: Uuid,
) -> Result<Vec<SignalTrigger>, sqlx::Error> {
    let results = sqlx::query_as::<_, DBSignalTrigger>(
        r#"
        SELECT 
            st.value,
            s.name as signal_name,
            s.prompt as prompt,
            s.structured_output_schema as structured_output_schema
        FROM 
            signal_triggers st
        INNER JOIN 
            signals s
            ON st.signal_id = s.id
        WHERE 
            st.project_id = $1
        "#,
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    Ok(results
        .into_iter()
        .filter_map(|db_trigger| {
            let filters: Vec<Filter> = match serde_json::from_value(db_trigger.value) {
                Ok(f) => f,
                Err(e) => {
                    log::warn!(
                        "Failed to parse filters for signal '{}': {:?}",
                        db_trigger.signal_name,
                        e
                    );
                    return None;
                }
            };

            Some(SignalTrigger {
                filters,
                signal: Signal {
                    name: db_trigger.signal_name,
                    prompt: db_trigger.prompt,
                    structured_output_schema: db_trigger.structured_output_schema,
                },
            })
        })
        .collect())
}
