use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use super::signals::Signal;
use super::utils::Filter;
use crate::signals::SignalMode;

/// Signal trigger with pre-parsed filters
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignalTrigger {
    pub id: Uuid,
    pub filters: Vec<Filter>,
    pub signal: Signal,
    pub mode: SignalMode,
}

#[derive(Debug, Clone, sqlx::FromRow)]
struct DBSignalTrigger {
    id: Uuid,
    value: serde_json::Value,
    signal_id: Uuid,
    signal_name: String,
    prompt: String,
    structured_output_schema: Value,
    mode: i16,
    sample_rate: Option<i16>,
}

/// Returns all signal triggers for the project with pre-parsed filters
pub async fn get_signal_triggers(
    pool: &PgPool,
    project_id: Uuid,
) -> Result<Vec<SignalTrigger>, sqlx::Error> {
    let results = sqlx::query_as::<_, DBSignalTrigger>(
        r#"
        SELECT
            st.id,
            st.value,
            st.mode,
            s.id as signal_id,
            s.name as signal_name,
            s.prompt as prompt,
            s.structured_output_schema as structured_output_schema,
            s.sample_rate as sample_rate
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
                id: db_trigger.id,
                filters,
                signal: Signal {
                    id: db_trigger.signal_id,
                    name: db_trigger.signal_name,
                    prompt: db_trigger.prompt,
                    structured_output_schema: db_trigger.structured_output_schema,
                    sample_rate: db_trigger.sample_rate,
                },
                mode: SignalMode::from_u8(db_trigger.mode as u8),
            })
        })
        .collect())
}
