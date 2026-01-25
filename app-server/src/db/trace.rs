use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;
use tracing::instrument;
use uuid::Uuid;

use crate::ch::traces::TraceAggregation;
use crate::db::spans::Span;
use crate::db::utils::{
    Filter, evaluate_array_contains_filter, evaluate_number_filter, evaluate_string_filter,
};

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
    #[sqlx(rename = "type")]
    trace_type: i16,
    top_span_id: Option<Uuid>,
    top_span_name: Option<String>,
    top_span_type: Option<i16>,
    session_id: Option<String>,
    metadata: Option<Value>,
    user_id: Option<String>,
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
    has_browser_session: Option<bool>,
    span_names: Option<Value>,
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
    pub fn trace_type(&self) -> i16 {
        self.trace_type
    }
    pub fn top_span_id(&self) -> Option<Uuid> {
        self.top_span_id
    }
    pub fn top_span_name(&self) -> Option<String> {
        self.top_span_name.clone()
    }
    pub fn top_span_type(&self) -> Option<i16> {
        self.top_span_type
    }
    pub fn session_id(&self) -> Option<String> {
        self.session_id.clone()
    }
    pub fn user_id(&self) -> Option<String> {
        self.user_id.clone()
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
    pub fn has_browser_session(&self) -> Option<bool> {
        self.has_browser_session.clone()
    }

    pub fn span_names(&self) -> Vec<String> {
        self.span_names
            .as_ref()
            .and_then(|v| v.as_object())
            .map(|obj| obj.keys().cloned().collect())
            .unwrap_or_default()
    }
    pub fn matches_filters(&self, spans: &[Span], filters: &[Filter]) -> bool {
        if filters.is_empty() {
            return false;
        }

        filters
            .iter()
            .all(|filter| self.evaluate_single_filter(spans, filter))
    }

    fn evaluate_single_filter(&self, spans: &[Span], filter: &Filter) -> bool {
        match filter.column.as_str() {
            "input_token_count" => evaluate_number_filter(
                self.input_token_count as f64,
                &filter.operator,
                &filter.value,
            ),
            "output_token_count" => evaluate_number_filter(
                self.output_token_count as f64,
                &filter.operator,
                &filter.value,
            ),
            "total_token_count" => evaluate_number_filter(
                self.total_token_count as f64,
                &filter.operator,
                &filter.value,
            ),
            "input_cost" => {
                evaluate_number_filter(self.input_cost, &filter.operator, &filter.value)
            }
            "output_cost" => {
                evaluate_number_filter(self.output_cost, &filter.operator, &filter.value)
            }
            "cost" => evaluate_number_filter(self.cost, &filter.operator, &filter.value),
            "num_spans" => {
                evaluate_number_filter(self.num_spans as f64, &filter.operator, &filter.value)
            }

            // String columns (set once on first span, won't change)
            "top_span_name" => {
                let name = self.top_span_name.clone().unwrap_or_default();
                evaluate_string_filter(&name, &filter.operator, &filter.value)
            }
            "session_id" => {
                let session_id = self.session_id.clone().unwrap_or_default();
                evaluate_string_filter(&session_id, &filter.operator, &filter.value)
            }
            "user_id" => {
                let user_id = self.user_id.clone().unwrap_or_default();
                evaluate_string_filter(&user_id, &filter.operator, &filter.value)
            }

            "tags" => evaluate_array_contains_filter(&self.tags, &filter.operator, &filter.value),
            "span_name" => {
                let span_names: Vec<String> = spans
                    .iter()
                    .filter(|s| s.trace_id == self.id)
                    .map(|s| s.name.clone())
                    .collect();
                evaluate_array_contains_filter(&span_names, &filter.operator, &filter.value)
            }

            _ => {
                log::warn!("Unknown filter column: {}", filter.column);
                false
            }
        }
    }
}

/// Upsert trace statistics from aggregated span data
/// Returns the updated trace statistics
#[instrument(skip(pool, aggregations))]
pub async fn upsert_trace_statistics_batch(
    pool: &PgPool,
    aggregations: &[TraceAggregation],
) -> Result<Vec<Trace>> {
    if aggregations.is_empty() {
        return Ok(Vec::new());
    }

    let mut traces = Vec::new();

    for agg in aggregations {
        let span_names_jsonb: Value = agg
            .span_names
            .iter()
            .map(|name| (name.clone(), Value::Bool(true)))
            .collect::<serde_json::Map<String, Value>>()
            .into();

        let trace = sqlx::query_as::<_, Trace>(
            r#"
            INSERT INTO traces (
                id, 
                project_id, 
                start_time, 
                end_time, 
                type,
                top_span_id,
                top_span_name,
                top_span_type,
                session_id, 
                metadata, 
                user_id,
                input_token_count, 
                output_token_count, 
                total_token_count, 
                input_cost, 
                output_cost, 
                cost,
                status,
                tags,
                num_spans,
                has_browser_session,
                span_names
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
            ON CONFLICT (project_id, id) DO UPDATE SET
                start_time = LEAST(traces.start_time, EXCLUDED.start_time),
                end_time = GREATEST(traces.end_time, EXCLUDED.end_time),
                type = COALESCE(EXCLUDED.type, traces.type, 0),
                top_span_id = COALESCE(EXCLUDED.top_span_id, traces.top_span_id),
                top_span_name = COALESCE(EXCLUDED.top_span_name, traces.top_span_name),
                top_span_type = COALESCE(EXCLUDED.top_span_type, traces.top_span_type),
                session_id = COALESCE(EXCLUDED.session_id, traces.session_id),
                -- `||` operator shallowly merges the metadata; coalesce prevents None from overwriting the existing metadata
                metadata = COALESCE(traces.metadata || EXCLUDED.metadata, EXCLUDED.metadata, traces.metadata),
                user_id = COALESCE(EXCLUDED.user_id, traces.user_id),
                input_token_count = traces.input_token_count + EXCLUDED.input_token_count,
                output_token_count = traces.output_token_count + EXCLUDED.output_token_count,
                total_token_count = traces.total_token_count + EXCLUDED.total_token_count,
                input_cost = traces.input_cost + EXCLUDED.input_cost,
                output_cost = traces.output_cost + EXCLUDED.output_cost,
                cost = traces.cost + EXCLUDED.cost,
                status = COALESCE(EXCLUDED.status, traces.status),
                tags = array(SELECT DISTINCT unnest(traces.tags || EXCLUDED.tags)),
                num_spans = traces.num_spans + EXCLUDED.num_spans,
                has_browser_session = COALESCE(EXCLUDED.has_browser_session, traces.has_browser_session),
                -- `||` operator merges span_names objects to keep unique names
                span_names = COALESCE(traces.span_names || EXCLUDED.span_names, EXCLUDED.span_names, traces.span_names)
            RETURNING 
                id, 
                project_id, 
                start_time, 
                end_time, 
                type,
                top_span_id,
                top_span_name,
                top_span_type,
                session_id, 
                metadata, 
                user_id,
                input_token_count, 
                output_token_count, 
                total_token_count, 
                input_cost, 
                output_cost, 
                cost,
                status,
                tags,
                num_spans,
                has_browser_session,
                span_names
            "#,
        )
        .bind(agg.trace_id)
        .bind(agg.project_id)
        .bind(agg.start_time)
        .bind(agg.end_time)
        .bind(agg.trace_type as i16)
        .bind(agg.top_span_id)
        .bind(&agg.top_span_name)
        .bind(agg.top_span_type as i16)
        .bind(&agg.session_id)
        .bind(&agg.metadata)
        .bind(&agg.user_id)
        .bind(agg.input_tokens)
        .bind(agg.output_tokens)
        .bind(agg.total_tokens)
        .bind(agg.input_cost)
        .bind(agg.output_cost)
        .bind(agg.total_cost)
        .bind(&agg.status)
        .bind(&agg.tags.iter().collect::<Vec<_>>())
        .bind(agg.num_spans)
        .bind(agg.has_browser_session)
        .bind(&span_names_jsonb)
        .fetch_one(pool)
        .await?;

        traces.push(trace);
    }

    Ok(traces)
}
