use std::{env, sync::Arc};

use backoff::ExponentialBackoffBuilder;
use futures_util::future::join_all;
use indexmap::IndexMap;
use regex::Regex;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    cache::Cache,
    db::{
        self, DB,
        events::Event,
        labels::LabelSource,
        spans::{Span, SpanType},
        trace,
    },
    language_model::costs::estimate_cost_by_provider_name,
};

use super::{
    attributes::TraceAttributes,
    spans::{SpanAttributes, SpanUsage},
};

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

pub async fn record_spans(
    db: Arc<DB>,
    spans: &[Span],
    traces_attributes: Vec<TraceAttributes>,
) -> anyhow::Result<()> {
    // batch spans by BATCH_SIZE and record batches in parallel
    let mut futures = Vec::new();

    let batch_size = env::var("DB_WRITE_SPAN_BATCH_SIZE")
        .unwrap_or_else(|_| "25".to_string())
        .parse::<usize>()
        .unwrap_or(25);

    for (spans_chunk, traces_attributes_chunk) in spans
        .chunks(batch_size)
        .zip(traces_attributes.chunks(batch_size))
    {
        futures.push(record_spans_batch(
            db.clone(),
            spans_chunk,
            traces_attributes_chunk.to_vec(),
        ));
    }

    let results = join_all(futures).await;
    let errors: Vec<_> = results
        .into_iter()
        .filter_map(|result| result.err())
        .inspect(|e| log::error!("Failed to record spans: {:?}", e))
        .collect();

    if !errors.is_empty() {
        return Err(anyhow::anyhow!("Failed to record some spans: {:?}", errors));
    }

    Ok(())
}

pub async fn record_spans_batch(
    db: Arc<DB>,
    spans: &[Span],
    traces_attributes: Vec<TraceAttributes>,
) -> anyhow::Result<()> {
    let insert_spans = || async {
        db::spans::record_spans_batch(&db.pool, spans)
            .await
            .map_err(|e| {
                log::error!(
                    "Failed attempt to record {} spans. Will retry according to backoff policy. Error: {:?}",
                    spans.len(),
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
        .with_max_elapsed_time(Some(std::time::Duration::from_secs(10)))
        .build();
    backoff::future::retry(exponential_backoff, insert_spans)
        .await
        .map_err(|e| {
            log::error!(
                "Exhausted backoff retries for {} spans: {:?}",
                spans.len(),
                e
            );
            e
        })?;

    // Insert or update traces in batch after the spans have been successfully inserted
    if let Err(e) = trace::update_trace_attributes_batch(&db.pool, spans, traces_attributes).await {
        log::error!(
            "Failed to update trace attributes for {} spans: {:?}",
            spans.len(),
            e
        );
    }

    Ok(())
}

pub async fn record_labels_to_db_and_ch(
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    labels: &[String],
    span_id: &Uuid,
    project_id: &Uuid,
) -> anyhow::Result<()> {
    if labels.is_empty() {
        return Ok(());
    }

    let project_labels =
        db::labels::get_label_classes_by_project_id(&db.pool, *project_id, None).await?;

    for label_name in labels {
        let label_class = project_labels.iter().find(|l| l.name == *label_name);
        let id = Uuid::new_v4();
        crate::labels::insert_or_update_label(
            &db.pool,
            clickhouse.clone(),
            *project_id,
            id,
            *span_id,
            label_class.map(|l| l.id),
            None,
            label_name.clone(),
            LabelSource::CODE,
        )
        .await?;
    }

    Ok(())
}

pub fn skip_span_name(name: &str) -> bool {
    let re = Regex::new(r"^Runnable[A-Z][A-Za-z]*(?:<[A-Za-z_,]+>)*\.task$").unwrap();
    re.is_match(name)
}

fn is_top_span(span: &Span, attributes: &SpanAttributes) -> bool {
    let first_in_ids = span.span_id
        == attributes
            .ids_path()
            .unwrap_or_default()
            .first()
            .cloned()
            .unwrap_or_default()
            .parse::<Uuid>()
            .unwrap_or_default();

    let first_in_path = span.name
        == attributes
            .path()
            .unwrap_or_default()
            .first()
            .cloned()
            .unwrap_or_default();

    first_in_ids && first_in_path
}

pub fn prepare_span_for_recording(
    span: &mut Span,
    span_usage: &SpanUsage,
    events: &Vec<Event>,
) -> TraceAttributes {
    let mut trace_attributes = TraceAttributes::new(span.trace_id);

    trace_attributes.update_start_time(span.start_time);
    trace_attributes.update_end_time(span.end_time);

    events.iter().for_each(|event| {
        // Check if it's an exception event
        if event.name == "exception" {
            trace_attributes.set_status("error".to_string());
            span.status = Some("error".to_string());
        }
    });

    trace_attributes.update_session_id(span.attributes.session_id());
    trace_attributes.update_user_id(span.attributes.user_id());
    trace_attributes.update_trace_type(span.attributes.trace_type());
    trace_attributes.set_metadata(span.attributes.metadata());
    if let Some(has_browser_session) = span.attributes.has_browser_session() {
        trace_attributes.set_has_browser_session(has_browser_session);
    }

    if span.span_type == SpanType::LLM {
        trace_attributes.add_input_cost(span_usage.input_cost);
        trace_attributes.add_output_cost(span_usage.output_cost);
        trace_attributes.add_total_cost(span_usage.total_cost);

        trace_attributes.add_input_tokens(span_usage.input_tokens);
        trace_attributes.add_output_tokens(span_usage.output_tokens);
        trace_attributes.add_total_tokens(span_usage.total_tokens);
        span.attributes.set_usage(&span_usage);
    }

    span.attributes.extend_span_path(&span.name);
    span.attributes.ids_path().map(|path| {
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

    if is_top_span(&span, &span.attributes) {
        span.parent_span_id = None;
    }

    // Once we've set the parent span id, check if it's the top span
    if span.parent_span_id.is_none() {
        trace_attributes.set_top_span_id(span.span_id);
    }
    span.attributes.update_path();

    trace_attributes
}

pub fn serialize_indexmap<T>(index_map: IndexMap<String, T>) -> Option<Value>
where
    T: serde::Serialize,
{
    index_map
        .into_iter()
        .map(|(key, value)| {
            Ok::<(String, Value), serde_json::Error>((key, serde_json::to_value(value)?))
        })
        .collect::<Result<serde_json::Map<String, Value>, _>>()
        .ok()
        .map(Value::Object)
}
