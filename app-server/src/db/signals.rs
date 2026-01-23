use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

/// Signal with prompt and schema
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Signal {
    pub name: String,
    pub prompt: String,
    pub structured_output_schema: Value,
}

pub async fn get_signal(
    pool: &PgPool,
    signal_id: Uuid,
    project_id: Uuid,
) -> Result<Option<Signal>> {
    let signal = sqlx::query_as::<_, Signal>(
        "SELECT name, prompt, structured_output_schema
        FROM signals
        WHERE id = $1 AND project_id = $2",
    )
    .bind(signal_id)
    .bind(project_id)
    .fetch_optional(pool)
    .await?;

    Ok(signal)
}
