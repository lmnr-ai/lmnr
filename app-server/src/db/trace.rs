use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use crate::ch::traces::TraceAggregation;

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
    tags: Vec<String>,
    num_spans: i64,
}

impl Trace {
    // Getter methods
    pub fn id(&self) -> Uuid {
        self.id
    }
    pub fn start_time(&self) -> Option<DateTime<Utc>> {
        self.start_time
    }
    pub fn end_time(&self) -> Option<DateTime<Utc>> {
        self.end_time
    }
    pub fn session_id(&self) -> Option<String> {
        self.session_id.clone()
    }
    pub fn metadata(&self) -> Option<&Value> {
        self.metadata.as_ref()
    }
    pub fn input_token_count(&self) -> i64 {
        self.input_token_count
    }
    pub fn output_token_count(&self) -> i64 {
        self.output_token_count
    }
    pub fn total_token_count(&self) -> i64 {
        self.total_token_count
    }
    pub fn input_cost(&self) -> f64 {
        self.input_cost
    }
    pub fn output_cost(&self) -> f64 {
        self.output_cost
    }
    pub fn cost(&self) -> f64 {
        self.cost
    }
    pub fn project_id(&self) -> Uuid {
        self.project_id
    }
    pub fn status(&self) -> Option<String> {
        self.status.clone()
    }
    pub fn tags(&self) -> &Vec<String> {
        &self.tags
    }
    pub fn num_spans(&self) -> i64 {
        self.num_spans
    }
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

/// Upsert trace statistics from aggregated span data
/// Returns the updated trace statistics
pub async fn upsert_trace_statistics_batch(
    pool: &PgPool,
    aggregations: &[TraceAggregation],
) -> Result<Vec<Trace>> {
    if aggregations.is_empty() {
        return Ok(Vec::new());
    }

    let mut traces = Vec::new();

    for agg in aggregations {
        let trace = sqlx::query_as::<_, Trace>(
            r#"
            INSERT INTO traces (
                id, 
                project_id, 
                start_time, 
                end_time, 
                session_id, 
                metadata, 
                input_token_count, 
                output_token_count, 
                total_token_count, 
                input_cost, 
                output_cost, 
                cost,
                status,
                tags,
                num_spans
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            ON CONFLICT (id) DO UPDATE SET
                start_time = LEAST(traces.start_time, EXCLUDED.start_time),
                end_time = GREATEST(traces.end_time, EXCLUDED.end_time),
                session_id = COALESCE(EXCLUDED.session_id, traces.session_id),
                metadata = COALESCE(EXCLUDED.metadata, traces.metadata),
                input_token_count = traces.input_token_count + EXCLUDED.input_token_count,
                output_token_count = traces.output_token_count + EXCLUDED.output_token_count,
                total_token_count = traces.total_token_count + EXCLUDED.total_token_count,
                input_cost = traces.input_cost + EXCLUDED.input_cost,
                output_cost = traces.output_cost + EXCLUDED.output_cost,
                cost = traces.cost + EXCLUDED.cost,
                status = COALESCE(EXCLUDED.status, traces.status),
                tags = array(SELECT DISTINCT unnest(traces.tags || EXCLUDED.tags)),
                num_spans = traces.num_spans + EXCLUDED.num_spans
            RETURNING 
                id, 
                project_id, 
                start_time, 
                end_time, 
                session_id, 
                metadata, 
                input_token_count, 
                output_token_count, 
                total_token_count, 
                input_cost, 
                output_cost, 
                cost,
                status,
                tags,
                num_spans
            "#,
        )
        .bind(agg.trace_id)
        .bind(agg.project_id)
        .bind(agg.start_time)
        .bind(agg.end_time)
        .bind(&agg.session_id)
        .bind(&agg.metadata)
        .bind(agg.input_tokens)
        .bind(agg.output_tokens)
        .bind(agg.total_tokens)
        .bind(agg.input_cost)
        .bind(agg.output_cost)
        .bind(agg.total_cost)
        .bind(&agg.status)
        .bind(&agg.tags)
        .bind(agg.num_spans)
        .fetch_one(pool)
        .await?;

        traces.push(trace);
    }

    Ok(traces)
}
