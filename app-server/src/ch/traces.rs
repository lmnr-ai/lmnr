use std::collections::HashSet;

use chrono::{DateTime, Utc};
use uuid::Uuid;

use super::utils::merge_json_objects;
use crate::db::spans::{Span, SpanType};
use crate::traces::spans::SpanUsage;

/// One batch's trace-stats delta. Folded by `traces_agg` (aggregates) and
/// `traces_static` (set-once columns); never a cumulative row.
#[derive(Debug, Clone)]
pub struct TraceAggregation {
    pub trace_id: Uuid,
    pub project_id: Uuid,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub total_tokens: i64,
    pub cache_read_input_tokens: i64,
    pub cache_creation_input_tokens: i64,
    pub reasoning_tokens: i64,
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
    pub span_names: HashSet<String>,
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
                        cache_read_input_tokens: 0,
                        cache_creation_input_tokens: 0,
                        reasoning_tokens: 0,
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
                        span_names: HashSet::new(),
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

            // Sum tokens and costs from SpanUsage — LLM spans only. `get_llm_usage_for_span`
            // computes usage for every span (it reads `gen_ai.usage.*` unconditionally), so a
            // non-LLM span carrying those attributes would otherwise inflate the trace totals.
            // This mirrors `prepare_span_for_recording`, which records usage only on LLM spans.
            if span.is_llm_span() {
                entry.input_tokens += span_usage.input_tokens;
                entry.output_tokens += span_usage.output_tokens;
                entry.total_tokens += span_usage.total_tokens;
                entry.cache_read_input_tokens += span_usage.cache_read_input_tokens;
                entry.cache_creation_input_tokens += span_usage.cache_creation_input_tokens;
                entry.reasoning_tokens += span_usage.reasoning_tokens;
                entry.input_cost += span_usage.input_cost;
                entry.output_cost += span_usage.output_cost;
                entry.total_cost += span_usage.total_cost;
            }

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
            if let Some(status) = &span.status {
                if status == "error" {
                    entry.status = Some("error".to_string());
                } else if entry.status.is_none() && !status.is_empty() {
                    entry.status = Some(status.clone());
                }
            }
            if let Some(metadata) = span.attributes.metadata() {
                if let Ok(metadata_value) = serde_json::to_value(&metadata) {
                    entry.metadata = Some(match entry.metadata.take() {
                        Some(existing) => merge_json_objects(existing, metadata_value),
                        None => metadata_value,
                    });
                }
            }
            if entry.trace_type == 0 {
                if let Some(trace_type) = span.attributes.trace_type() {
                    entry.trace_type = trace_type.clone().into();
                }
            }

            if span.span_type == SpanType::Evaluation {
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

            // Collect unique span names
            entry.span_names.insert(span.name.clone());

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

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use serde_json::json;

    use super::*;
    use crate::traces::spans::SpanAttributes;

    fn make_span(trace_id: Uuid, span_type: SpanType, output_tokens: i64) -> Span {
        Span {
            span_id: Uuid::new_v4(),
            project_id: Uuid::new_v4(),
            trace_id,
            parent_span_id: None,
            name: "test".to_string(),
            attributes: SpanAttributes::new(HashMap::from([(
                "gen_ai.usage.output_tokens".to_string(),
                json!(output_tokens),
            )])),
            input: None,
            output: None,
            span_type,
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

    fn make_usage(output_tokens: i64, total_cost: f64) -> SpanUsage {
        SpanUsage {
            input_tokens: 0,
            output_tokens,
            total_tokens: output_tokens,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
            reasoning_tokens: 0,
            input_cost: 0.0,
            output_cost: total_cost,
            total_cost,
            request_model: None,
            response_model: None,
            provider_name: None,
        }
    }

    // A Default span carrying `gen_ai.usage.*` must NOT contribute to the trace token/cost
    // totals — only LLM spans do (LAM-1873).
    #[test]
    fn only_llm_spans_contribute_to_trace_usage() {
        let trace_id = Uuid::new_v4();
        let spans = vec![
            make_span(trace_id, SpanType::LLM, 100),
            make_span(trace_id, SpanType::Default, 50),
        ];
        let usage = vec![make_usage(100, 1.5), make_usage(50, 0.5)];

        let aggregations = TraceAggregation::from_spans(&spans, &usage);

        assert_eq!(aggregations.len(), 1);
        let agg = &aggregations[0];
        assert_eq!(agg.output_tokens, 100);
        assert_eq!(agg.total_tokens, 100);
        assert_eq!(agg.total_cost, 1.5);
        assert_eq!(agg.num_spans, 2);
    }
}
