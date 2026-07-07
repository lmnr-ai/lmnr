use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

/// User-controlled signal settings stored in the `metadata` jsonb column.
/// `disabled` is only persisted when true; absence means enabled (active).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SignalMetadata {
    #[serde(default)]
    pub disabled: Option<bool>,
    #[serde(default)]
    pub sample_rate: Option<i16>,
}

impl SignalMetadata {
    /// Enabled by default when the `disabled` key is absent (historical signals).
    pub fn disabled(&self) -> bool {
        self.disabled.unwrap_or(false)
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
