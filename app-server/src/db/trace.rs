use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(sqlx::Type, Deserialize, Serialize, PartialEq, Clone, Debug, Default)]
#[sqlx(type_name = "trace_type")]
pub enum TraceType {
    #[default]
    DEFAULT,
    EVENT,
    EVALUATION,
    PLAYGROUND,
}

#[derive(Serialize, sqlx::FromRow, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Trace {
    id: Uuid,
    #[serde(default)]
    start_time: Option<DateTime<Utc>>,
    #[serde(default)]
    end_time: Option<DateTime<Utc>>,
    session_id: Option<String>,
    metadata: Option<Value>,
    input_token_count: i64,
    output_token_count: i64,
    total_token_count: i64,
    input_cost: f64,
    output_cost: f64,
    cost: f64,
    project_id: Uuid,
    status: Option<String>,
}

/// Set the trace_type for a specific trace (creates trace if it doesn't exist)
pub async fn update_trace_type(
    pool: &PgPool,
    project_id: &Uuid,
    trace_id: Uuid,
    trace_type: TraceType,
) -> Result<()> {
    // Use upsert pattern - create trace with EVALUATION type if it doesn't exist,
    // or update existing trace to EVALUATION type
    sqlx::query(
        "INSERT INTO traces (id, project_id, trace_type, input_token_count, output_token_count, total_token_count, input_cost, output_cost, cost)
         VALUES ($1, $2, $3, 0, 0, 0, 0.0, 0.0, 0.0)
         ON CONFLICT(id) DO UPDATE
         SET trace_type = $3"
    )
    .bind(trace_id)
    .bind(project_id)
    .bind(trace_type)
    .execute(pool)
    .await?;

    Ok(())
}
