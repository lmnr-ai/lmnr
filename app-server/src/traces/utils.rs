use std::collections::HashMap;
use std::sync::{Arc, LazyLock};

use indexmap::IndexMap;
use regex::Regex;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::opentelemetry_proto::opentelemetry_proto_common_v1;

use crate::{
    cache::Cache,
    db::{DB, spans::Span, trace::Trace},
    language_model::costs::{
        ModelCosts, ModelInfo, SpanCostInput, calculate_span_cost, get_model_costs_for_project,
    },
    traces::prompt_hash::{extract_system_message, structural_skeleton_hash},
};

use super::span_attributes::{
    ANTHROPIC_REQUEST_SERVICE_TIER, ANTHROPIC_RESPONSE_SERVICE_TIER, GEN_AI_REQUEST_BATCH,
    GEN_AI_REQUEST_SERVICE_TIER, GEN_AI_RESPONSE_SERVICE_TIER, GEN_AI_SYSTEM,
    GEN_AI_USAGE_AUDIO_INPUT_TOKENS, GEN_AI_USAGE_AUDIO_OUTPUT_TOKENS,
    GEN_AI_USAGE_CACHE_CREATION_EPHEMERAL_1H_TOKENS,
    GEN_AI_USAGE_CACHE_CREATION_EPHEMERAL_5M_TOKENS, GEN_AI_USAGE_REASONING_TOKENS,
    OPENAI_REQUEST_SERVICE_TIER, OPENAI_RESPONSE_SERVICE_TIER, SPAN_PROMPT_HASH,
};
use super::spans::{InputTokens, SpanAttributes, SpanUsage};

static SKIP_SPAN_NAME_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^Runnable[A-Z][A-Za-z]*(?:<[A-Za-z_,]+>)*\.task$").unwrap());

/// Calculate usage for both default and LLM spans
pub async fn get_llm_usage_for_span(
    // mut because input and output tokens are updated to new convention
    attributes: &mut SpanAttributes,
    db: Arc<DB>,
    cache: Arc<Cache>,
    span_name: &str,
    project_id: &Uuid,
) -> SpanUsage {
    let input_tokens = attributes.input_tokens();
    let output_tokens = attributes.output_tokens();
    let total_tokens = input_tokens.total() + output_tokens;

    let input_cost = attributes.input_cost();
    let output_cost = attributes.output_cost();
    let total_cost = attributes.total_cost();
    let has_incoming_positive_cost = has_positive_cost(input_cost, output_cost, total_cost);
    let response_model = attributes.response_model();
    let request_model = attributes.request_model();
    let mut model_name = response_model.clone().or(request_model.clone());
    let mut provider_name = attributes.provider_name(span_name);

    // Store the original model and provider names for project custom model pricing lookup
    let (orig_model_name, orig_provider_name) = (model_name.clone(), provider_name.clone());

    // Transform the model name and provider names for universal model pricing lookup
    (model_name, provider_name) = tranform_model_and_provider(model_name, provider_name);

    if should_use_provided_cost(
        input_cost,
        output_cost,
        total_cost,
        attributes,
        &input_tokens,
    ) {
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
        let model_info = ModelInfo::extract(model, provider_name.as_deref());

        if let Some(model_costs) = get_model_costs_for_project(
            db.clone(),
            cache.clone(),
            &model_info,
            project_id,
            orig_provider_name.as_deref().unwrap_or(""),
            orig_model_name.as_deref().unwrap_or(""),
        )
        .await
        {
            if should_calculate_model_cost(
                &model_costs,
                has_incoming_positive_cost,
                attributes,
                &input_tokens,
            ) {
                let span_cost_input: SpanCostInput =
                    build_span_cost_input(attributes, &input_tokens, output_tokens);
                let cost_entry = calculate_span_cost(&model_costs, &span_cost_input);
                input_cost = cost_entry.input_cost;
                output_cost = cost_entry.output_cost;
                total_cost = input_cost + output_cost;
            }
        }
    } else if let Some(provider) = attributes
        .raw_attributes
        .get(GEN_AI_SYSTEM)
        .and_then(|v| v.as_str())
    {
        // Span has gen_ai.system but no model name.
        if total_tokens > 0 {
            log::warn!(
                "LLM span has tokens but no model name. Cost cannot be calculated. Provider: [{}].",
                provider,
            );
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

fn should_use_provided_cost(
    input_cost: Option<f64>,
    output_cost: Option<f64>,
    total_cost: Option<f64>,
    attributes: &SpanAttributes,
    input_tokens: &InputTokens,
) -> bool {
    has_positive_cost(input_cost, output_cost, total_cost)
        && !has_cache_token_breakdown(attributes, input_tokens)
}

fn has_positive_cost(
    input_cost: Option<f64>,
    output_cost: Option<f64>,
    total_cost: Option<f64>,
) -> bool {
    input_cost.is_some_and(|c| c > 0.0)
        || output_cost.is_some_and(|c| c > 0.0)
        || total_cost.is_some_and(|c| c > 0.0)
}

fn has_cache_token_breakdown(attributes: &SpanAttributes, input_tokens: &InputTokens) -> bool {
    input_tokens.cache_read_tokens > 0
        || input_tokens.cache_write_tokens > 0
        || attributes
            .int_attr(GEN_AI_USAGE_CACHE_CREATION_EPHEMERAL_5M_TOKENS)
            .is_some_and(|tokens| tokens > 0)
        || attributes
            .int_attr(GEN_AI_USAGE_CACHE_CREATION_EPHEMERAL_1H_TOKENS)
            .is_some_and(|tokens| tokens > 0)
}

fn should_calculate_model_cost(
    model_costs: &ModelCosts,
    has_incoming_positive_cost: bool,
    attributes: &SpanAttributes,
    input_tokens: &InputTokens,
) -> bool {
    if has_incoming_positive_cost && has_cache_token_breakdown(attributes, input_tokens) {
        return has_cache_pricing_for_breakdown(model_costs, attributes, input_tokens);
    }

    true
}

fn has_cache_pricing_for_breakdown(
    model_costs: &ModelCosts,
    attributes: &SpanAttributes,
    input_tokens: &InputTokens,
) -> bool {
    let costs = &model_costs.0;
    let has_cost = |key: &str| costs.get(key).and_then(Value::as_f64).is_some();

    let needs_cache_read_pricing = input_tokens.cache_read_tokens > 0;
    let cache_creation_1h_tokens = attributes
        .int_attr(GEN_AI_USAGE_CACHE_CREATION_EPHEMERAL_1H_TOKENS)
        .unwrap_or(0);
    let needs_cache_creation_pricing =
        input_tokens.cache_write_tokens > 0 || cache_creation_1h_tokens > 0;

    (!needs_cache_read_pricing || has_cost("cache_read_input_token_cost"))
        && (!needs_cache_creation_pricing || has_cost("cache_creation_input_token_cost"))
        && (cache_creation_1h_tokens <= 0 || has_cost("cache_creation_input_token_cost_above_1hr"))
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
        .string_attr(GEN_AI_RESPONSE_SERVICE_TIER)
        .or_else(|| attributes.string_attr(GEN_AI_REQUEST_SERVICE_TIER))
        .or_else(|| attributes.string_attr(OPENAI_RESPONSE_SERVICE_TIER))
        .or_else(|| attributes.string_attr(OPENAI_REQUEST_SERVICE_TIER))
        .or_else(|| attributes.string_attr(ANTHROPIC_RESPONSE_SERVICE_TIER))
        .or_else(|| attributes.string_attr(ANTHROPIC_REQUEST_SERVICE_TIER));

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

pub(crate) fn is_top_span(span: &Span, attributes: &SpanAttributes) -> bool {
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

    // Skip if the producer already wrote the hash; legacy / bypass
    // ingest paths still rely on this fallback.
    if span.is_llm_span()
        && !span
            .attributes
            .raw_attributes
            .contains_key(SPAN_PROMPT_HASH)
    {
        if let Some(hash) = compute_prompt_hash(&span.input) {
            span.attributes
                .raw_attributes
                .insert(SPAN_PROMPT_HASH.to_string(), Value::String(hash));
        }
    }

    span.attributes.update_path();
}

fn compute_prompt_hash(input: &Option<Value>) -> Option<String> {
    let (system_text, _) = extract_system_message(input.as_ref()?)?;
    Some(structural_skeleton_hash(&system_text))
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
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub fn group_traces_by_project(traces: &[Trace]) -> HashMap<Uuid, Vec<&Trace>> {
    let mut grouped: HashMap<Uuid, Vec<&Trace>> = HashMap::new();
    for trace in traces {
        grouped.entry(trace.project_id()).or_default().push(trace);
    }
    grouped
}

/// Custom logic to transform model/provider not covered by main flow
fn tranform_model_and_provider(
    model_name: Option<String>,
    provider_name: Option<String>,
) -> (Option<String>, Option<String>) {
    match provider_name.as_deref() {
        // Old versions of laminar sdk were removing provider prefix from model names when using openrouter.
        // Remove this logic when we stop supporting old versions of laminar sdk
        Some("openrouter") => {
            let new_model = model_name.map(|model| {
                const MODEL_PREFIX_TO_PROVIDER: &[(&[&str], &str)] = &[
                    (&["gpt-", "o1", "o3", "o4"], "openai"),
                    (&["claude-"], "anthropic"),
                    (&["gemini-", "gemma-"], "google"),
                    (&["llama-", "llama3"], "meta-llama"),
                    (
                        &[
                            "mistral-",
                            "mixtral-",
                            "codestral-",
                            "devstral-",
                            "pixtral-",
                            "voxtral-",
                            "magistral-",
                            "ministral-",
                        ],
                        "mistralai",
                    ),
                    (&["deepseek-"], "deepseek"),
                    (&["grok-"], "x-ai"),
                    (&["command-"], "cohere"),
                    (&["sonar-", "r1-1776"], "perplexity"),
                    (&["qwen-", "qwq-"], "qwen"),
                    (&["phi-"], "microsoft"),
                    (&["nemotron-"], "nvidia"),
                    (&["kimi-"], "moonshot"),
                ];

                match MODEL_PREFIX_TO_PROVIDER
                    .iter()
                    .find(|(prefixes, _)| prefixes.iter().any(|p| model.starts_with(p)))
                {
                    Some((_, provider)) => format!("{provider}/{model}"),
                    None => model,
                }
            });
            (new_model, provider_name)
        }
        // LiteLLM stores "gateway" as "vercel_ai_gateway"
        Some("gateway") => (model_name, Some("vercel_ai_gateway".to_string())),
        _ => (model_name, provider_name),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_float_eq(actual: f64, expected: f64) {
        assert!(
            (actual - expected).abs() < 1e-12,
            "expected {actual} to equal {expected}"
        );
    }

    #[test]
    fn provided_cost_is_authoritative_without_cache_tokens() {
        let attributes = SpanAttributes::new(HashMap::new());
        let input_tokens = InputTokens {
            regular_input_tokens: 100,
            cache_write_tokens: 0,
            cache_read_tokens: 0,
        };

        assert!(should_use_provided_cost(
            Some(0.1),
            Some(0.2),
            Some(0.3),
            &attributes,
            &input_tokens
        ));
    }

    #[test]
    fn provided_cost_does_not_bypass_model_pricing_with_cache_tokens() {
        let attributes = SpanAttributes::new(HashMap::new());
        let input_tokens = InputTokens {
            regular_input_tokens: 1,
            cache_write_tokens: 3421,
            cache_read_tokens: 6839,
        };

        assert!(!should_use_provided_cost(
            Some(0.051305),
            Some(0.004475),
            Some(0.05578),
            &attributes,
            &input_tokens
        ));
    }

    #[test]
    fn ephemeral_cache_tokens_count_as_cache_breakdown() {
        let attributes = SpanAttributes::new(HashMap::from([(
            GEN_AI_USAGE_CACHE_CREATION_EPHEMERAL_5M_TOKENS.to_string(),
            json!(3421),
        )]));
        let input_tokens = InputTokens {
            regular_input_tokens: 1,
            cache_write_tokens: 0,
            cache_read_tokens: 0,
        };

        assert!(!should_use_provided_cost(
            Some(0.051305),
            Some(0.004475),
            Some(0.05578),
            &attributes,
            &input_tokens
        ));
    }

    #[test]
    fn accounting_review_cache_shape_uses_cache_aware_model_cost() {
        let attributes = SpanAttributes::new(HashMap::from([(
            GEN_AI_USAGE_CACHE_CREATION_EPHEMERAL_5M_TOKENS.to_string(),
            json!(3421),
        )]));
        let input_tokens = InputTokens {
            regular_input_tokens: 1,
            cache_write_tokens: 3421,
            cache_read_tokens: 6839,
        };
        let span_cost_input = build_span_cost_input(&attributes, &input_tokens, 179);
        let model_costs = ModelCosts(json!({
            "input_cost_per_token": 0.000005,
            "output_cost_per_token": 0.000025,
            "cache_read_input_token_cost": 0.0000005,
            "cache_creation_input_token_cost": 0.00000625
        }));

        let cost_entry = calculate_span_cost(&model_costs, &span_cost_input);

        assert_float_eq(cost_entry.input_cost, 0.02480575);
        assert_float_eq(cost_entry.output_cost, 0.004475);
        assert!(cost_entry.input_cost < 10261.0 * 0.000005);
    }

    #[test]
    fn cache_bearing_span_with_incomplete_cache_pricing_keeps_provided_cost() {
        let attributes = SpanAttributes::new(HashMap::new());
        let input_tokens = InputTokens {
            regular_input_tokens: 1,
            cache_write_tokens: 3421,
            cache_read_tokens: 6839,
        };
        let model_costs = ModelCosts(json!({
            "input_cost_per_token": 0.000005,
            "output_cost_per_token": 0.000025
        }));

        assert!(!should_calculate_model_cost(
            &model_costs,
            true,
            &attributes,
            &input_tokens
        ));
    }

    #[test]
    fn prompt_hash_stable_across_cc_versions() {
        let input_v1 = json!([
            {
                "role": "system",
                "content": [
                    {"text": "x-anthropic-billing-header: cc_version=2.1.112.186; cc_entrypoint=sdk-ts;", "type": "text"},
                    {"text": "You are Claude Code.", "type": "text"}
                ]
            }
        ]);
        let input_v2 = json!([
            {
                "role": "system",
                "content": [
                    {"text": "x-anthropic-billing-header: cc_version=2.2.0.1; cc_entrypoint=cli;", "type": "text"},
                    {"text": "You are Claude Code.", "type": "text"}
                ]
            }
        ]);
        let h1 = compute_prompt_hash(&Some(input_v1)).unwrap();
        let h2 = compute_prompt_hash(&Some(input_v2)).unwrap();
        assert_eq!(h1, h2);
    }

    #[test]
    fn prompt_hash_differs_when_body_differs() {
        let a = json!([{"role": "system", "content": "You are assistant A."}]);
        let b = json!([{"role": "system", "content": "You are assistant B completely different."}]);
        let ha = compute_prompt_hash(&Some(a)).unwrap();
        let hb = compute_prompt_hash(&Some(b)).unwrap();
        assert_ne!(ha, hb);
    }

    #[test]
    fn prompt_hash_stable_for_real_claude_agent_payload() {
        let make_input = |version: &str, cch: &str| {
            json!([
                {
                    "role": "system",
                    "content": [
                        {"text": format!("x-anthropic-billing-header: cc_version={version}; cc_entrypoint=sdk-ts; cch={cch};"), "type": "text"},
                        {"cache_control": {"type": "ephemeral"}, "text": "You are a Claude agent, built on Anthropic's Claude Agent SDK.", "type": "text"},
                        {"cache_control": {"type": "ephemeral"}, "text": "<role>\nYou are a senior portfolio manager orchestrating a research workflow.\n</role>", "type": "text"}
                    ]
                }
            ])
        };
        let h1 = compute_prompt_hash(&Some(make_input("2.1.104.8ec", "00000"))).unwrap();
        let h2 = compute_prompt_hash(&Some(make_input("2.2.0.abc", "ffffff"))).unwrap();
        assert_eq!(h1, h2);
    }
}
