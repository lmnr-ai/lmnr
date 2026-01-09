use std::collections::HashSet;

use chrono::{DateTime, Utc};
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::utils::chrono_to_nanoseconds;
use super::{ClickhouseInsertable, DataPlaneBatch, Table};
use crate::db::spans::{Span, SpanType};
use crate::db::trace::Trace;
use crate::traces::spans::SpanUsage;

#[derive(Debug, Clone, Serialize, Deserialize, Row)]
pub struct CHTrace {
    #[serde(with = "clickhouse::serde::uuid")]
    pub id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    /// Start time in nanoseconds
    pub start_time: i64,
    /// End time in nanoseconds
    pub end_time: i64,
    pub duration: f64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub total_tokens: i64,
    pub input_cost: f64,
    pub output_cost: f64,
    pub total_cost: f64,
    pub metadata: String,
    pub session_id: String,
    pub user_id: String,
    pub status: String,
    #[serde(with = "clickhouse::serde::uuid")]
    pub top_span_id: Uuid,
    pub top_span_name: String,
    pub top_span_type: u8,
    pub trace_type: u8,
    pub tags: Vec<String>,
    pub num_spans: u64,
    pub has_browser_session: bool,
}

impl CHTrace {
    /// Create CHTrace from database Trace
    pub fn from_db_trace(trace: &Trace) -> Self {
        let start_time_ns = trace.start_time().map(chrono_to_nanoseconds).unwrap_or(0);
        let end_time_ns = trace.end_time().map(chrono_to_nanoseconds).unwrap_or(0);

        let duration = if start_time_ns > 0 && end_time_ns > 0 {
            (end_time_ns - start_time_ns) as f64 / 1_000_000_000.0 // Convert to seconds
        } else {
            0.0
        };

        CHTrace {
            id: trace.id(),
            project_id: trace.project_id(),
            start_time: start_time_ns,
            end_time: end_time_ns,
            duration,
            input_tokens: trace.input_token_count(),
            output_tokens: trace.output_token_count(),
            total_tokens: trace.total_token_count(),
            input_cost: trace.input_cost(),
            output_cost: trace.output_cost(),
            total_cost: trace.cost(),
            metadata: trace.metadata().map(|m| m.to_string()).unwrap_or_default(),
            session_id: trace.session_id().unwrap_or_default(),
            user_id: trace.user_id().unwrap_or_default(),
            status: trace.status().unwrap_or_default(),
            top_span_id: trace.top_span_id().unwrap_or(Uuid::nil()),
            top_span_name: trace.top_span_name().unwrap_or_default(),
            top_span_type: trace.top_span_type().unwrap_or(0) as u8,
            trace_type: trace.trace_type() as u8,
            tags: trace.tags().clone(),
            num_spans: trace.num_spans() as u64,
            has_browser_session: trace.has_browser_session().unwrap_or(false),
        }
    }
}

impl ClickhouseInsertable for CHTrace {
    const TABLE: Table = Table::Traces;

    fn to_data_plane_batch(items: Vec<Self>) -> DataPlaneBatch {
        DataPlaneBatch::TracesReplacing(items)
    }
}

#[derive(Debug, Clone)]
pub struct TraceAggregation {
    pub trace_id: Uuid,
    pub project_id: Uuid,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub total_tokens: i64,
    pub input_cost: f64,
    pub output_cost: f64,
    pub total_cost: f64,
    pub session_id: Option<String>,
    pub user_id: Option<String>,
    pub status: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub tags: HashSet<String>,
    pub num_spans: i32,
    pub top_span_id: Option<Uuid>,
    pub top_span_name: Option<String>,
    pub top_span_type: u8,
    pub trace_type: u8,
    pub has_browser_session: Option<bool>,
}

impl TraceAggregation {
    /// Aggregate statistics from a batch of Spans and SpanUsage grouped by trace_id
    pub fn from_spans(spans: &[Span], span_usage_vec: &[SpanUsage]) -> Vec<Self> {
        use std::collections::HashMap;

        let mut trace_aggregations: HashMap<Uuid, TraceAggregation> = HashMap::new();

        for (span, span_usage) in spans.iter().zip(span_usage_vec.iter()) {
            let entry =
                trace_aggregations
                    .entry(span.trace_id)
                    .or_insert_with(|| TraceAggregation {
                        trace_id: span.trace_id,
                        project_id: span.project_id,
                        start_time: None,
                        end_time: None,
                        input_tokens: 0,
                        output_tokens: 0,
                        total_tokens: 0,
                        input_cost: 0.0,
                        output_cost: 0.0,
                        total_cost: 0.0,
                        session_id: None,
                        user_id: None,
                        status: None,
                        metadata: None,
                        tags: HashSet::new(),
                        num_spans: 0,
                        top_span_id: None,
                        top_span_name: None,
                        top_span_type: 0,
                        trace_type: 0,
                        has_browser_session: None,
                    });

            // Aggregate min start_time
            entry.start_time = Some(match entry.start_time {
                Some(existing) => existing.min(span.start_time),
                None => span.start_time,
            });

            // Aggregate max end_time
            entry.end_time = Some(match entry.end_time {
                Some(existing) => existing.max(span.end_time),
                None => span.end_time,
            });

            // Sum tokens and costs from SpanUsage
            entry.input_tokens += span_usage.input_tokens;
            entry.output_tokens += span_usage.output_tokens;
            entry.total_tokens += span_usage.total_tokens;
            entry.input_cost += span_usage.input_cost;
            entry.output_cost += span_usage.output_cost;
            entry.total_cost += span_usage.total_cost;

            // Use "any" strategy for these fields (take first non-empty value)
            if entry.session_id.is_none() {
                if let Some(session_id) = span.attributes.session_id() {
                    if !session_id.is_empty() {
                        entry.session_id = Some(session_id);
                    }
                }
            }
            if entry.user_id.is_none() {
                if let Some(user_id) = span.attributes.user_id() {
                    if !user_id.is_empty() {
                        entry.user_id = Some(user_id);
                    }
                }
            }
            if entry.status.is_none() {
                if let Some(status) = &span.status {
                    if !status.is_empty() {
                        entry.status = Some(status.clone());
                    }
                }
            }
            if entry.metadata.is_none() {
                if let Some(metadata) = span.attributes.metadata() {
                    if let Ok(metadata_value) = serde_json::to_value(&metadata) {
                        entry.metadata = Some(metadata_value);
                    }
                }
            }
            if let Some(trace_type) = span.attributes.trace_type() {
                entry.trace_type = trace_type.clone().into();
            }

            if span.span_type == SpanType::EVALUATION {
                entry.trace_type = 1;
            }

            if span.parent_span_id.is_none() {
                entry.top_span_id = Some(span.span_id);
                entry.top_span_name = Some(span.name.clone());
                entry.top_span_type = span.span_type.clone().into();
            }

            if entry.top_span_name.is_none() {
                let path = span.attributes.path().unwrap_or_default();
                path.first()
                    .map(|name| entry.top_span_name = Some(name.clone()));
            }

            // Collect unique tags
            for tag in span.attributes.tags() {
                entry.tags.insert(tag);
            }

            if entry.has_browser_session.is_none() {
                if let Some(has_browser_session) = span.attributes.has_browser_session() {
                    entry.has_browser_session = Some(has_browser_session);
                }
            }

            entry.num_spans += 1;
        }

        trace_aggregations.into_values().collect()
    }
}
