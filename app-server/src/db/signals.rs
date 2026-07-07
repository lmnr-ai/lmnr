use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

/// User-controlled signal settings stored in the `metadata` jsonb column.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SignalMetadata {
    #[serde(default)]
    pub enabled: Option<bool>,
    #[serde(default)]
    pub sample_rate: Option<i16>,
}

impl SignalMetadata {
    /// Enabled by default when the key is absent (historical signals).
    pub fn enabled(&self) -> bool {
        self.enabled.unwrap_or(true)
    }
}

/// Signal with prompt and schema
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Signal {
    #[serde(default)]
    pub id: Uuid,
    pub name: String,
    pub prompt: String,
    pub structured_output_schema: Value,
    #[serde(default)]
    #[sqlx(json)]
    pub metadata: SignalMetadata,
}

pub async fn get_signal(
    pool: &PgPool,
    signal_id: Uuid,
    project_id: Uuid,
) -> Result<Option<Signal>> {
    let signal = sqlx::query_as::<_, Signal>(
        "SELECT id, name, prompt, structured_output_schema, metadata
        FROM signals
        WHERE id = $1 AND project_id = $2",
    )
    .bind(signal_id)
    .bind(project_id)
    .fetch_optional(pool)
    .await?;

    Ok(signal)
}
