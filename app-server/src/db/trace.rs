use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use crate::traces::attributes::TraceAttributes;

/// Helper struct to pass current trace info, if exists, if pipeline is called from remote trace context
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentTraceAndSpan {
    pub trace_id: Uuid,
    pub parent_span_id: Uuid,
    // Optional for backwards compatibility
    #[serde(default)]
    pub parent_span_path: Option<String>,
}

#[derive(sqlx::Type, Deserialize, Serialize, PartialEq, Clone, Debug, Default)]
#[sqlx(type_name = "trace_type")]
pub enum TraceType {
    #[default]
    DEFAULT,
    EVENT,
    EVALUATION,
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
}

pub async fn update_trace_attributes(
    pool: &PgPool,
    project_id: &Uuid,
    attributes: &TraceAttributes,
) -> Result<()> {
    sqlx::query(
        "
        INSERT INTO traces (
            id,
            project_id,
            input_token_count,
            output_token_count,
            total_token_count,
            input_cost,
            output_cost,
            cost,
            start_time,
            end_time,
            session_id,
            trace_type,
            metadata,
            has_browser_session,
            top_span_id
        )
        VALUES (
            $1,
            $2,
            COALESCE($3, 0::int8),
            COALESCE($4, 0::int8),
            COALESCE($5, 0::int8),
            COALESCE($6, 0::float8),
            COALESCE($7, 0::float8),
            COALESCE($8, 0::float8),
            $9,
            $10,
            $11,
            COALESCE($12, 'DEFAULT'::trace_type),
            $13,
            $14,
            $15
        )
        ON CONFLICT(id) DO
        UPDATE
        SET
            input_token_count = traces.input_token_count + COALESCE($3, 0),
            output_token_count = traces.output_token_count + COALESCE($4, 0),
            total_token_count = traces.total_token_count + COALESCE($5, 0),
            input_cost = traces.input_cost + COALESCE($6, 0),
            output_cost = traces.output_cost + COALESCE($7, 0),
            cost = traces.cost + COALESCE($8, 0),
            start_time = CASE WHEN traces.start_time IS NULL OR traces.start_time > $9 THEN $9 ELSE traces.start_time END,
            end_time = CASE WHEN traces.end_time IS NULL OR traces.end_time < $10 THEN $10 ELSE traces.end_time END,
            session_id = COALESCE(traces.session_id, $11),
            trace_type = CASE WHEN $12 IS NULL THEN traces.trace_type ELSE COALESCE($12, 'DEFAULT'::trace_type) END,
            metadata = COALESCE($13, traces.metadata),
            has_browser_session = COALESCE($14, traces.has_browser_session),
            top_span_id = COALESCE(traces.top_span_id, $15)
        "
    )
    .bind(attributes.id)
    .bind(project_id)
    .bind(attributes.input_token_count)
    .bind(attributes.output_token_count)
    .bind(attributes.total_token_count)
    .bind(attributes.input_cost)
    .bind(attributes.output_cost)
    .bind(attributes.cost)
    .bind(attributes.start_time)
    .bind(attributes.end_time)
    .bind(&attributes.session_id)
    .bind(&attributes.trace_type)
    .bind(&serde_json::to_value(&attributes.metadata).unwrap())
    .bind(attributes.has_browser_session)
    .bind(attributes.top_span_id)
    .execute(pool)
    .await?;
    Ok(())
}
