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
    Filter, FilterOperator, evaluate_array_contains_filter, evaluate_number_filter,
    evaluate_string_filter,
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
    tags: Vec<String>, // Span tags
    num_spans: i64,
    has_browser_session: Option<bool>,
    span_names: Option<Value>,
    root_span_input: Option<String>,
    root_span_output: Option<String>,
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

    pub fn root_span_input(&self) -> Option<String> {
        self.root_span_input.clone()
    }
    pub fn root_span_output(&self) -> Option<String> {
        self.root_span_output.clone()
    }
    pub fn span_names(&self) -> Vec<String> {
        self.span_names
            .as_ref()
            .and_then(|v| v.as_object())
            .map(|obj| obj.keys().cloned().collect())
            .unwrap_or_default()
    }

    #[cfg_attr(not(feature = "signals"), allow(dead_code))]
    pub fn matches_filters(&self, spans: &[Span], filters: &[Filter]) -> bool {
        if filters.is_empty() {
            return false;
        }

        filters
            .iter()
            .all(|filter| self.evaluate_single_filter(spans, filter))
    }

    #[cfg_attr(not(feature = "signals"), allow(dead_code))]
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
                let target_name = filter.value.as_str().unwrap_or("");
                // Check both the accumulated span_names from the database (which includes
                // span names from all previous batches) and the current batch of spans.
                // This ensures the filter works correctly when spans arrive in different
                // processing batches (e.g., child span "GitHub" arrives before root span).
                let has_span = self.span_names().iter().any(|n| n == target_name)
                    || spans
                        .iter()
                        .filter(|s| s.trace_id == self.id)
                        .any(|s| s.name == target_name);
                match filter.operator {
                    FilterOperator::Eq => has_span,
                    FilterOperator::Ne => !has_span,
                    _ => {
                        log::warn!(
                            "Invalid operator {:?} for span_name filter, only eq/ne supported",
                            filter.operator
                        );
                        false
                    }
                }
            }
            "status" => {
                let status = self.status.clone().unwrap_or_default();
                evaluate_string_filter(&status, &filter.operator, &filter.value)
            }

            "root_span_finished" => self.top_span_id.is_some(),

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
                span_names,
                root_span_input,
                root_span_output
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
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
                status = CASE
                    WHEN traces.status = 'error' OR EXCLUDED.status = 'error' THEN 'error'
                    ELSE COALESCE(EXCLUDED.status, traces.status)
                END,
                tags = array(SELECT DISTINCT unnest(traces.tags || EXCLUDED.tags)),
                num_spans = traces.num_spans + EXCLUDED.num_spans,
                has_browser_session = COALESCE(EXCLUDED.has_browser_session, traces.has_browser_session),
                -- `||` operator merges span_names objects to keep unique names
                span_names = COALESCE(traces.span_names || EXCLUDED.span_names, EXCLUDED.span_names, traces.span_names),
                root_span_input = COALESCE(EXCLUDED.root_span_input, traces.root_span_input),
                root_span_output = COALESCE(EXCLUDED.root_span_output, traces.root_span_output)
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
                span_names,
                root_span_input,
                root_span_output
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
        .bind(&agg.root_span_input)
        .bind(&agg.root_span_output)
        .fetch_one(pool)
        .await?;

        traces.push(trace);
    }

    Ok(traces)
}

pub async fn insert_shared_traces(
    pool: &PgPool,
    project_id: Uuid,
    trace_ids: &[Uuid],
) -> Result<()> {
    if trace_ids.is_empty() {
        return Ok(());
    }

    sqlx::query(
        "INSERT INTO shared_traces (project_id, id) SELECT $1, id FROM UNNEST($2::uuid[]) AS t(id)
        ON CONFLICT (id) DO UPDATE SET project_id = $1",
    )
    .bind(project_id)
    .bind(trace_ids)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn delete_shared_traces(
    pool: &PgPool,
    project_id: Uuid,
    trace_ids: &[Uuid],
) -> Result<()> {
    if trace_ids.is_empty() {
        return Ok(());
    }

    sqlx::query("DELETE FROM shared_traces WHERE project_id = $1 AND id = ANY($2)")
        .bind(project_id)
        .bind(trace_ids)
        .execute(pool)
        .await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{
        spans::{Span, SpanType},
        utils::{Filter, FilterOperator},
    };
    use chrono::Utc;
    use serde_json::json;

    fn make_trace(
        id: Uuid,
        project_id: Uuid,
        top_span_id: Option<Uuid>,
        span_names: Option<Value>,
    ) -> Trace {
        Trace {
            id,
            start_time: Some(Utc::now()),
            end_time: Some(Utc::now()),
            trace_type: 0,
            top_span_id,
            top_span_name: Some("root".to_string()),
            top_span_type: Some(0),
            session_id: None,
            metadata: None,
            user_id: None,
            input_token_count: 0,
            output_token_count: 0,
            total_token_count: 0,
            input_cost: 0.0,
            output_cost: 0.0,
            cost: 0.0,
            project_id,
            status: None,
            tags: vec![],
            num_spans: 1,
            has_browser_session: None,
            span_names,
            root_span_input: None,
            root_span_output: None,
        }
    }

    fn make_span(trace_id: Uuid, project_id: Uuid, name: &str) -> Span {
        Span {
            span_id: Uuid::new_v4(),
            project_id,
            trace_id,
            parent_span_id: None,
            name: name.to_string(),
            attributes: Default::default(),
            input: None,
            output: None,
            span_type: SpanType::Default,
            start_time: Utc::now(),
            end_time: Utc::now(),
            events: vec![],
            status: None,
            tags: None,
            input_url: None,
            output_url: None,
            size_bytes: 0,
        }
    }

    /// Simulates the bug scenario: child span "GitHub" arrives in batch 1 (no root span yet),
    /// then root span arrives in batch 2 (without "GitHub" in the batch).
    /// The trigger should fire because the DB trace has accumulated span_names from both batches.
    #[test]
    fn test_span_name_filter_uses_accumulated_db_span_names() {
        let trace_id = Uuid::new_v4();
        let project_id = Uuid::new_v4();
        let top_span_id = Uuid::new_v4();

        // After batch 2 (root span), the DB trace has top_span_id set and
        // span_names accumulated from both batches (including "GitHub" from batch 1).
        let trace = make_trace(
            trace_id,
            project_id,
            Some(top_span_id),
            Some(json!({"root": true, "GitHub": true})),
        );

        // Batch 2 only contains the root span (no "GitHub" span in this batch)
        let current_batch_spans = vec![make_span(trace_id, project_id, "root")];

        let filters = vec![
            Filter {
                column: "root_span_finished".to_string(),
                operator: FilterOperator::Eq,
                value: json!("true"),
            },
            Filter {
                column: "span_name".to_string(),
                operator: FilterOperator::Eq,
                value: json!("GitHub"),
            },
        ];

        // This should match because "GitHub" is in the DB's accumulated span_names
        assert!(
            trace.matches_filters(&current_batch_spans, &filters),
            "Trigger should fire: 'GitHub' is in accumulated span_names even though not in current batch"
        );
    }

    /// When the span IS in the current batch, it should still match.
    #[test]
    fn test_span_name_filter_matches_current_batch() {
        let trace_id = Uuid::new_v4();
        let project_id = Uuid::new_v4();
        let top_span_id = Uuid::new_v4();

        let trace = make_trace(
            trace_id,
            project_id,
            Some(top_span_id),
            Some(json!({"root": true, "GitHub": true})),
        );

        let current_batch_spans = vec![
            make_span(trace_id, project_id, "root"),
            make_span(trace_id, project_id, "GitHub"),
        ];

        let filters = vec![Filter {
            column: "span_name".to_string(),
            operator: FilterOperator::Eq,
            value: json!("GitHub"),
        }];

        assert!(trace.matches_filters(&current_batch_spans, &filters));
    }

    /// Ne operator: span_name != "GitHub" should return false when "GitHub" is in accumulated names.
    #[test]
    fn test_span_name_ne_filter_with_accumulated_names() {
        let trace_id = Uuid::new_v4();
        let project_id = Uuid::new_v4();

        let trace = make_trace(
            trace_id,
            project_id,
            Some(Uuid::new_v4()),
            Some(json!({"root": true, "GitHub": true})),
        );

        // "GitHub" not in current batch, but IS in accumulated span_names
        let current_batch_spans = vec![make_span(trace_id, project_id, "root")];

        let filters = vec![Filter {
            column: "span_name".to_string(),
            operator: FilterOperator::Ne,
            value: json!("GitHub"),
        }];

        assert!(
            !trace.matches_filters(&current_batch_spans, &filters),
            "Ne filter should return false when span name exists in accumulated names"
        );
    }
}
