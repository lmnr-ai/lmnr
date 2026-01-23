use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::db::spans::Span;
use crate::db::trace::Trace;

/// Filter operators matching the frontend format
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum FilterOperator {
    Eq,
    Ne,
    Gt,
    Gte,
    Lt,
    Lte,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Filter {
    pub column: String,
    pub operator: FilterOperator,
    pub value: Value,
}

pub fn evaluate_filters(trace: &Trace, spans: &[Span], filters: &[Filter]) -> bool {
    if filters.is_empty() {
        return false;
    }

    filters
        .iter()
        .all(|filter| evaluate_single_filter(trace, spans, filter))
}

/// Evaluate a single filter against trace and spans
fn evaluate_single_filter(trace: &Trace, spans: &[Span], filter: &Filter) -> bool {
    match filter.column.as_str() {
        "contains_span" => {
            let target_name = filter.value.as_str().unwrap_or("");
            let contains = spans
                .iter()
                .filter(|s| s.trace_id == trace.id())
                .any(|s| s.name == target_name);
            match filter.operator {
                FilterOperator::Eq => contains,
                FilterOperator::Ne => !contains,
                _ => {
                    log::warn!(
                        "Invalid operator {:?} for contains_span filter, only eq/ne supported",
                        filter.operator
                    );
                    false
                }
            }
        }

        "duration" => {
            let duration = match (trace.start_time(), trace.end_time()) {
                (Some(start), Some(end)) => (end - start).num_milliseconds() as f64 / 1000.0,
                _ => 0.0,
            };
            evaluate_number_filter(duration, &filter.operator, &filter.value)
        }

        "total_token_count" => evaluate_number_filter(
            trace.total_token_count() as f64,
            &filter.operator,
            &filter.value,
        ),
        "input_token_count" => evaluate_number_filter(
            trace.input_token_count() as f64,
            &filter.operator,
            &filter.value,
        ),
        "output_token_count" => evaluate_number_filter(
            trace.output_token_count() as f64,
            &filter.operator,
            &filter.value,
        ),

        "cost" => evaluate_number_filter(trace.cost(), &filter.operator, &filter.value),
        "input_cost" => evaluate_number_filter(trace.input_cost(), &filter.operator, &filter.value),
        "output_cost" => {
            evaluate_number_filter(trace.output_cost(), &filter.operator, &filter.value)
        }

        // Span count
        "num_spans" => {
            evaluate_number_filter(trace.num_spans() as f64, &filter.operator, &filter.value)
        }

        "status" => {
            let status = trace.status().unwrap_or_default();
            evaluate_string_filter(&status, &filter.operator, &filter.value)
        }
        "top_span_name" => {
            let name = trace.top_span_name().unwrap_or_default();
            evaluate_string_filter(&name, &filter.operator, &filter.value)
        }

        _ => {
            log::warn!("Unknown filter column: {}", filter.column);
            false
        }
    }
}

/// Evaluate a numeric filter condition
fn evaluate_number_filter(actual: f64, operator: &FilterOperator, value: &Value) -> bool {
    let target = match value {
        Value::Number(n) => n.as_f64().unwrap_or(0.0),
        Value::String(s) => s.parse::<f64>().unwrap_or(0.0),
        _ => return false,
    };

    match operator {
        FilterOperator::Eq => (actual - target).abs() < f64::EPSILON,
        FilterOperator::Ne => (actual - target).abs() >= f64::EPSILON,
        FilterOperator::Gt => actual > target,
        FilterOperator::Gte => actual >= target,
        FilterOperator::Lt => actual < target,
        FilterOperator::Lte => actual <= target,
    }
}

fn evaluate_string_filter(actual: &str, operator: &FilterOperator, value: &Value) -> bool {
    let target = value.as_str().unwrap_or("");

    match operator {
        FilterOperator::Eq => actual == target,
        FilterOperator::Ne => actual != target,
        // For strings, gt/lt/gte/lte don't make sense
        _ => {
            log::warn!(
                "Invalid operator {:?} for string filter, only eq/ne supported",
                operator
            );
            false
        }
    }
}
