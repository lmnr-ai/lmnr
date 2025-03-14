use std::sync::Arc;

use backoff::ExponentialBackoffBuilder;
use regex::Regex;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    cache::Cache,
    db::{
        self,
        labels::LabelSource,
        spans::{Span, SpanType},
        trace, DB,
    },
    language_model::costs::estimate_cost_by_provider_name,
};

use super::{
    attributes::TraceAttributes,
    spans::{SpanAttributes, SpanUsage},
};

pub fn json_value_to_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.to_string(),
        Value::Array(a) => a
            .iter()
            .map(json_value_to_string)
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
    let total_tokens = input_tokens.total() + output_tokens;

    let mut input_cost: f64 = 0.0;
    let mut output_cost: f64 = 0.0;
    let mut total_cost: f64 = 0.0;

    let response_model = attributes.response_model();
    let model_name = response_model.or(attributes.request_model());
    let provider_name = attributes.provider_name();

    if let Some(model) = model_name.as_deref() {
        if let Some(provider) = &provider_name {
            let cost_entry = estimate_cost_by_provider_name(
                db.clone(),
                cache.clone(),
                provider,
                model,
                input_tokens,
                output_tokens,
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
        input_tokens: input_tokens.total(),
        output_tokens,
        total_tokens,
        input_cost,
        output_cost,
        total_cost,
        response_model: attributes.response_model().clone(),
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

    trace_attributes.update_session_id(span_attributes.session_id());
    trace_attributes.update_trace_type(span_attributes.trace_type());
    trace_attributes.set_metadata(span_attributes.metadata());
    if let Some(has_browser_session) = span_attributes.has_browser_session() {
        trace_attributes.set_has_browser_session(has_browser_session);
    }

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
    span_attributes.ids_path().map(|path| {
        // set the parent to the second last id in the path
        if path.len() > 1 {
            let parent_id = path
                .get(path.len() - 2)
                .and_then(|id| Uuid::parse_str(id).ok());
            if let Some(parent_id) = parent_id {
                span.parent_span_id = Some(parent_id);
            }
        }
    });
    // Once we've set the parent span id, check if it's the top span
    if span.parent_span_id.is_none() {
        trace_attributes.set_top_span_id(span.span_id);
    }
    span_attributes.update_path();
    span.set_attributes(&span_attributes);

    let insert_span = || async {
        db::spans::record_span(&db.pool, &span, project_id)
            .await
            .map_err(|e| {
                log::error!(
                    "Failed attempt to record span [{}]. Will retry according to backoff policy. Error: {:?}",
                    span.span_id,
                    e
                );
                backoff::Error::Transient {
                    err: e,
                    retry_after: None,
                }
            })
    };

    // Starting with 0.5 second delay, delay multiplies by random factor between 1 and 2
    // up to 1 minute and until the total elapsed time is 5 minutes
    // https://docs.rs/backoff/latest/backoff/default/index.html
    let exponential_backoff = ExponentialBackoffBuilder::new()
        .with_initial_interval(std::time::Duration::from_millis(500))
        .with_multiplier(1.5)
        .with_randomization_factor(0.5)
        .with_max_interval(std::time::Duration::from_secs(1 * 60))
        .with_max_elapsed_time(Some(std::time::Duration::from_secs(5 * 60)))
        .build();
    backoff::future::retry(exponential_backoff, insert_span)
        .await
        .map_err(|e| {
            log::error!(
                "Exhausted backoff retries for span [{}]: {:?}",
                span.span_id,
                e
            );
            e
        })?;

    // Insert or update trace only after the span has been successfully inserted
    if let Err(e) = trace::update_trace_attributes(&db.pool, project_id, &trace_attributes).await {
        log::error!(
            "Failed to update trace attributes [{}]: {:?}",
            span.span_id,
            e
        );
    }

    Ok(())
}

pub async fn record_labels_to_db_and_ch(
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    span: &Span,
    project_id: &Uuid,
) -> anyhow::Result<()> {
    let project_labels =
        db::labels::get_label_classes_by_project_id(&db.pool, *project_id, None).await?;

    let labels = span.get_attributes().labels();

    for label_name in labels {
        let label_class = project_labels.iter().find(|l| l.name == label_name);
        let id = Uuid::new_v4();
        crate::labels::insert_or_update_label(
            &db.pool,
            clickhouse.clone(),
            *project_id,
            id,
            span.span_id,
            label_class.map(|l| l.id),
            None,
            label_name,
            LabelSource::CODE,
            None,
        )
        .await?;
    }

    Ok(())
}

pub fn skip_span_name(name: &str) -> bool {
    let re = Regex::new(r"^Runnable[A-Z][A-Za-z]*(?:<[A-Za-z_,]+>)*\.task$").unwrap();
    re.is_match(name)
}
