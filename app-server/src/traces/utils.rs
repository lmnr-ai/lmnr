use std::sync::Arc;

use serde_json::Value;
use uuid::Uuid;

use crate::{
    cache::Cache,
    db::{
        self,
        spans::{Span, SpanType},
        trace, DB,
    },
    language_model::costs::estimate_cost_by_provider_name,
};

use super::{
    attributes::TraceAttributes,
    spans::{SpanAttributes, SpanUsage},
};

pub fn json_value_to_string(v: Value) -> String {
    match v {
        Value::String(s) => s,
        Value::Array(a) => a
            .iter()
            .map(|v| json_value_to_string(v.clone()))
            .collect::<Vec<_>>()
            .join(", "),
        _ => v.to_string(),
    }
}

/// Calculate usage for both default and LLM spans
pub async fn get_llm_usage_for_span(
    // mut because input and output tokens are updated to new convention
    attributes: &mut SpanAttributes,
    db: Arc<DB>,
    cache: Arc<Cache>,
) -> SpanUsage {
    let input_tokens = attributes.input_tokens();
    let output_tokens = attributes.completion_tokens();
    let total_tokens = input_tokens + output_tokens;

    let mut input_cost: f64 = 0.0;
    let mut output_cost: f64 = 0.0;
    let mut total_cost: f64 = 0.0;

    let response_model = attributes.response_model();
    let model_name = response_model.or(attributes.request_model());
    let provider_name = attributes
        .provider_name()
        .map(|name| name.to_lowercase().trim().to_string());

    if let Some(model) = model_name.as_deref() {
        if let Some(provider) = &provider_name {
            let cost_entry = estimate_cost_by_provider_name(
                db.clone(),
                cache.clone(),
                provider,
                model,
                input_tokens as u32,
                output_tokens as u32,
            )
            .await;
            if let Some(cost_entry) = cost_entry {
                input_cost = cost_entry.input_cost;
                output_cost = cost_entry.output_cost;
            }
            total_cost = input_cost + output_cost;
        }
    }

    SpanUsage {
        input_tokens,
        output_tokens,
        total_tokens,
        input_cost,
        output_cost,
        total_cost,
        response_model: attributes.request_model().clone(),
        request_model: attributes.request_model().clone(),
        provider_name,
    }
}

pub async fn record_span_to_db(
    db: Arc<DB>,
    span_usage: &SpanUsage,
    project_id: &Uuid,
    span: &mut Span,
) -> anyhow::Result<()> {
    let mut trace_attributes = TraceAttributes::new(span.trace_id);

    trace_attributes.update_start_time(span.start_time);
    trace_attributes.update_end_time(span.end_time);

    let mut span_attributes = span.get_attributes();

    trace_attributes.update_user_id(span_attributes.user_id());
    trace_attributes.update_session_id(span_attributes.session_id());
    trace_attributes.update_trace_type(span_attributes.trace_type());

    if span.span_type == SpanType::LLM {
        trace_attributes.add_input_cost(span_usage.input_cost);
        trace_attributes.add_output_cost(span_usage.output_cost);
        trace_attributes.add_total_cost(span_usage.total_cost);

        trace_attributes.add_input_tokens(span_usage.input_tokens);
        trace_attributes.add_output_tokens(span_usage.output_tokens);
        trace_attributes.add_total_tokens(span_usage.total_tokens);
        span_attributes.set_usage(&span_usage);
    }

    span_attributes.extend_span_path(&span.name);
    span.set_attributes(&span_attributes);

    let update_attrs_res =
        trace::update_trace_attributes(&db.pool, project_id, &trace_attributes).await;
    if let Err(e) = update_attrs_res {
        log::error!(
            "Failed to update trace attributes [{}]: {:?}",
            span.span_id,
            e
        );
    }

    db::spans::record_span(&db.pool, &span, project_id).await?;

    Ok(())
}
