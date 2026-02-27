use std::collections::HashMap;
use std::sync::{Arc, LazyLock};

use indexmap::IndexMap;
use regex::Regex;
use serde_json::{Value, json};
use tracing::instrument;
use uuid::Uuid;

use crate::opentelemetry_proto::opentelemetry_proto_common_v1;

use crate::{
    cache::Cache,
    db::{DB, spans::Span, trace::Trace},
    language_model::costs::{
        ModelInfo, SpanCostInput, calculate_span_cost, get_model_costs,
    },
};

use super::span_attributes::{
    CLOUD_REGION, GEN_AI_REQUEST_BATCH, GEN_AI_USAGE_AUDIO_INPUT_TOKENS,
    GEN_AI_USAGE_AUDIO_OUTPUT_TOKENS, GEN_AI_USAGE_CACHE_CREATION_EPHEMERAL_1H_TOKENS,
    GEN_AI_USAGE_CACHE_CREATION_EPHEMERAL_5M_TOKENS, GEN_AI_USAGE_REASONING_TOKENS,
    OPENAI_REQUEST_SERVICE_TIER, OPENAI_RESPONSE_SERVICE_TIER,
};
use super::spans::{SpanAttributes, SpanUsage};

static SKIP_SPAN_NAME_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^Runnable[A-Z][A-Za-z]*(?:<[A-Za-z_,]+>)*\.task$").unwrap());

/// Calculate usage for both default and LLM spans
#[instrument(skip(attributes, db, cache, span_name))]
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
        let region = attributes.string_attr(CLOUD_REGION);
        let model_info =
            ModelInfo::extract(model, provider_name.as_deref(), region.as_deref());

        if let Some(model_costs) = get_model_costs(db.clone(), cache.clone(), &model_info).await {
            let span_cost_input = build_span_cost_input(attributes, &input_tokens, output_tokens);
            let cost_entry = calculate_span_cost(&model_costs, &span_cost_input);
            input_cost = cost_entry.input_cost;
            output_cost = cost_entry.output_cost;
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
        response_model,
        request_model,
        provider_name,
    }
}

/// Build SpanCostInput from span attributes
fn build_span_cost_input(
    attributes: &SpanAttributes,
    input_tokens: &super::spans::InputTokens,
    output_tokens: i64,
) -> SpanCostInput {
    let audio_input_tokens = attributes
        .int_attr(GEN_AI_USAGE_AUDIO_INPUT_TOKENS)
        .unwrap_or(0);
    let audio_output_tokens = attributes
        .int_attr(GEN_AI_USAGE_AUDIO_OUTPUT_TOKENS)
        .unwrap_or(0);
    let reasoning_tokens = attributes
        .int_attr(GEN_AI_USAGE_REASONING_TOKENS)
        .unwrap_or(0);
    let cache_creation_5m_tokens = attributes
        .int_attr(GEN_AI_USAGE_CACHE_CREATION_EPHEMERAL_5M_TOKENS)
        .unwrap_or(0);
    let cache_creation_1h_tokens = attributes
        .int_attr(GEN_AI_USAGE_CACHE_CREATION_EPHEMERAL_1H_TOKENS)
        .unwrap_or(0);

    let service_tier = attributes
        .string_attr(OPENAI_RESPONSE_SERVICE_TIER)
        .or_else(|| attributes.string_attr(OPENAI_REQUEST_SERVICE_TIER));

    let is_batch = attributes.bool_attr(GEN_AI_REQUEST_BATCH).unwrap_or(false);

    SpanCostInput {
        prompt_tokens: input_tokens.regular_input_tokens,
        completion_tokens: output_tokens,
        cache_read_tokens: input_tokens.cache_read_tokens,
        cache_creation_tokens: input_tokens.cache_write_tokens,
        cache_creation_5m_tokens,
        cache_creation_1h_tokens,
        audio_input_tokens,
        audio_output_tokens,
        reasoning_tokens,
        service_tier,
        is_batch,
    }
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

pub fn prepare_span_for_recording(span: &mut Span, span_usage: &SpanUsage) {
    // Check if any event is an exception to set span error status
    if span.events.iter().any(|event| event.name == "exception") {
        span.status = Some("error".to_string());
    }

    if span.is_llm_span() {
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

    span.attributes.update_path();
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

/// Groups traces by their project_id.
pub fn group_traces_by_project(traces: &[Trace]) -> HashMap<Uuid, Vec<&Trace>> {
    let mut grouped: HashMap<Uuid, Vec<&Trace>> = HashMap::new();
    for trace in traces {
        grouped.entry(trace.project_id()).or_default().push(trace);
    }
    grouped
}
