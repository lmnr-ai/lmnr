use std::{
    collections::HashMap,
    env,
    sync::{Arc, LazyLock},
};

use backoff::ExponentialBackoffBuilder;
use indexmap::IndexMap;
use regex::Regex;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::opentelemetry::opentelemetry_proto_common_v1;

use crate::{
    cache::Cache,
    db::{
        self, DB,
        events::Event,
        spans::{Span, SpanType},
        tags::TagSource,
        trace,
    },
    language_model::costs::estimate_cost_by_provider_name,
};

use super::{
    attributes::TraceAttributes,
    spans::{SpanAttributes, SpanUsage},
};

static SKIP_SPAN_NAME_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^Runnable[A-Z][A-Za-z]*(?:<[A-Za-z_,]+>)*\.task$").unwrap());

/// Calculate usage for both default and LLM spans
pub async fn get_llm_usage_for_span(
    // mut because input and output tokens are updated to new convention
    attributes: &mut SpanAttributes,
    db: Arc<DB>,
    cache: Arc<Cache>,
    span_name: &str,
) -> SpanUsage {
    let input_tokens = attributes.input_tokens();
    let output_tokens = attributes.output_tokens();
    let total_tokens = input_tokens.total() + output_tokens;

    let input_cost = attributes.input_cost();
    let output_cost = attributes.output_cost();
    let total_cost = attributes.total_cost();
    let response_model = attributes.response_model();
    let request_model = attributes.request_model();
    let model_name = response_model.clone().or(attributes.request_model());
    let provider_name = attributes.provider_name(span_name);

    if input_cost.is_some_and(|c| c > 0.0)
        || output_cost.is_some_and(|c| c > 0.0)
        || total_cost.is_some_and(|c| c > 0.0)
    {
        return SpanUsage {
            input_tokens: input_tokens.total(),
            output_tokens,
            total_tokens,
            input_cost: input_cost.unwrap_or(0.0),
            output_cost: output_cost.unwrap_or(0.0),
            total_cost: total_cost
                .unwrap_or(input_cost.unwrap_or(0.0) + output_cost.unwrap_or(0.0)),
            response_model: response_model.clone(),
            request_model: request_model.clone(),
            provider_name,
        };
    }

    let mut input_cost = input_cost.unwrap_or(0.0);
    let mut output_cost = output_cost.unwrap_or(0.0);
    let mut total_cost = total_cost.unwrap_or(input_cost + output_cost);

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
                total_cost = input_cost + output_cost;
            }
        }
    }

    SpanUsage {
        input_tokens: input_tokens.total(),
        output_tokens,
        total_tokens,
        input_cost,
        output_cost,
        total_cost,
        response_model,
        request_model,
        provider_name,
    }
}

pub async fn record_spans<'a>(
    db: Arc<DB>,
    spans: &Vec<Span>,
    trace_attributes_vec: &Vec<TraceAttributes>,
) -> anyhow::Result<()> {
    // batch spans by BATCH_SIZE and record batches in parallel
    let batch_size = env::var("DB_WRITE_SPAN_BATCH_SIZE")
        .unwrap_or("20".to_string())
        .parse::<usize>()
        .unwrap_or(20);

    if spans.len() != trace_attributes_vec.len() {
        log::warn!(
            "Spans and trace attributes vectors have different lengths: {} != {}",
            spans.len(),
            trace_attributes_vec.len()
        );
    }

    let mut errors = Vec::new();

    for (spans_chunk, trace_attributes_chunk) in spans
        .chunks(batch_size)
        .zip(trace_attributes_vec.chunks(batch_size))
    {
        if let Err(e) = record_spans_batch(db.clone(), spans_chunk, trace_attributes_chunk).await {
            log::error!("Failed to record spans: {:?}", e);
            errors.push(e);
        }
    }

    if !errors.is_empty() {
        return Err(anyhow::anyhow!("Failed to record some spans: {:?}", errors));
    }

    Ok(())
}

pub async fn record_spans_batch(
    db: Arc<DB>,
    spans: &[Span],
    trace_attributes_vec: &[TraceAttributes],
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
    if let Err(e) = trace::update_trace_attributes_batch(&db.pool, &trace_attributes_vec).await {
        log::error!(
            "Failed to update trace attributes for {} spans: {:?}",
            trace_attributes_vec.len(),
            e
        );
    }

    Ok(())
}

pub async fn record_tags_to_db_and_ch(
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    tags: &[String],
    span_id: &Uuid,
    project_id: &Uuid,
) -> anyhow::Result<()> {
    if tags.is_empty() {
        return Ok(());
    }

    let project_tag_class_ids =
        db::tags::get_tag_classes_by_project_id(&db.pool, *project_id, None)
            .await?
            .into_iter()
            .map(|tag_class| (tag_class.name, tag_class.id))
            .collect::<HashMap<_, _>>();

    for tag_name in tags {
        let tag_class_id = project_tag_class_ids.get(tag_name).cloned();
        let id = Uuid::new_v4();
        crate::tags::insert_or_update_tag(
            &db.pool,
            clickhouse.clone(),
            *project_id,
            id,
            *span_id,
            tag_class_id,
            None,
            tag_name.clone(),
            TagSource::CODE,
        )
        .await?;
    }

    Ok(())
}

pub fn skip_span_name(name: &str) -> bool {
    SKIP_SPAN_NAME_REGEX.is_match(name)
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
    trace_attributes.project_id = span.project_id;
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

pub fn convert_any_value_to_json_value(
    any_value: Option<opentelemetry_proto_common_v1::AnyValue>,
) -> Value {
    let Some(any_value) = any_value else {
        return Value::Null;
    };
    let Some(value) = any_value.value else {
        return Value::Null;
    };
    match value {
        opentelemetry_proto_common_v1::any_value::Value::StringValue(val) => {
            let mut val = val;

            // this is a workaround for cases when json.dumps equivalent is applied multiple times to the same value
            while let Ok(serde_json::Value::String(v)) =
                serde_json::from_str::<serde_json::Value>(&val)
            {
                val = v;
            }

            serde_json::Value::String(val)
        }
        opentelemetry_proto_common_v1::any_value::Value::BoolValue(val) => {
            serde_json::Value::Bool(val)
        }
        opentelemetry_proto_common_v1::any_value::Value::IntValue(val) => json!(val),
        opentelemetry_proto_common_v1::any_value::Value::DoubleValue(val) => json!(val),
        opentelemetry_proto_common_v1::any_value::Value::ArrayValue(val) => {
            let values: Vec<serde_json::Value> = val
                .values
                .into_iter()
                .map(|v| convert_any_value_to_json_value(Some(v)))
                .collect();
            json!(values)
        }
        opentelemetry_proto_common_v1::any_value::Value::KvlistValue(val) => {
            let map: serde_json::Map<String, serde_json::Value> = val
                .values
                .into_iter()
                .map(|kv| (kv.key, convert_any_value_to_json_value(kv.value)))
                .collect();
            json!(map)
        }
        opentelemetry_proto_common_v1::any_value::Value::BytesValue(val) => String::from_utf8(val)
            .map(|s| serde_json::from_str::<Value>(&s).unwrap_or(serde_json::Value::String(s)))
            .unwrap_or_default(),
    }
}
