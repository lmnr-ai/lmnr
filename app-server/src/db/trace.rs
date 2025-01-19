use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{FromRow, PgPool};
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
            metadata
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
            $13
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
            session_id = CASE WHEN traces.session_id IS NULL THEN $11 ELSE traces.session_id END,
            trace_type = CASE WHEN $12 IS NULL THEN traces.trace_type ELSE COALESCE($12, 'DEFAULT'::trace_type) END,
            metadata = COALESCE($13, traces.metadata)
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
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_single_trace(pool: &PgPool, id: Uuid) -> Result<Trace> {
    let trace = sqlx::query_as::<_, Trace>(
        "SELECT
            id,
            start_time,
            end_time,
            session_id,
            metadata,
            project_id,
            input_token_count,
            output_token_count,
            total_token_count,
            input_cost,
            output_cost,
            cost
        FROM traces
        WHERE id = $1
        AND start_time IS NOT NULL AND end_time IS NOT NULL",
    )
    .bind(id)
    .fetch_one(pool)
    .await?;

    Ok(trace)
}

#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub input_token_count: i64,
    pub output_token_count: i64,
    pub total_token_count: i64,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub duration: f64,
    pub input_cost: f64,
    pub output_cost: f64,
    pub cost: f64,
    pub trace_count: i64,
}
