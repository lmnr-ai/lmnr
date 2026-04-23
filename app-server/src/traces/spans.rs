use std::{
    collections::{HashMap, HashSet},
    sync::LazyLock,
};

use anyhow::Result;
use chrono::{TimeZone, Utc};
use indexmap::IndexMap;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{
    db::{
        events::Event,
        spans::{Span, SpanType},
        trace::TraceType,
        utils::span_id_to_uuid,
    },
    language_model::{
        ChatMessage, ChatMessageContent, ChatMessageContentPart, ChatMessageImageUrl,
        ChatMessageText, ChatMessageToolCall, InstrumentationChatMessageContentPart,
    },
    opentelemetry_proto::opentelemetry_proto_trace_v1::Span as OtelSpan,
    traces::{
        span_attributes::{GEN_AI_CACHE_READ_INPUT_TOKENS, GEN_AI_CACHE_WRITE_INPUT_TOKENS},
        utils::{convert_any_value_to_json_value, serialize_indexmap},
    },
    utils::{estimate_json_size, json_value_to_string},
};

use super::{
    span_attributes::{
        AISDK_MODEL_ID, AISDK_MODEL_PROVIDER, ASSOCIATION_PROPERTIES_PREFIX,
        GEN_AI_COMPLETION_TOKENS, GEN_AI_INPUT_COST, GEN_AI_INPUT_MESSAGES, GEN_AI_INPUT_TOKENS,
        GEN_AI_OPERATION_NAME, GEN_AI_OUTPUT_COST, GEN_AI_OUTPUT_MESSAGES, GEN_AI_OUTPUT_TOKENS,
        GEN_AI_PROMPT_TOKENS, GEN_AI_REQUEST_MODEL, GEN_AI_RESPONSE_MODEL, GEN_AI_SYSTEM,
        GEN_AI_SYSTEM_INSTRUCTIONS, GEN_AI_TOOL_CALL_ARGUMENTS, GEN_AI_TOOL_CALL_RESULT,
        GEN_AI_TOTAL_COST, SPAN_IDS_PATH, SPAN_PATH, SPAN_TYPE,
    },
    utils::skip_span_name,
};

/// Known operation prefixes used to namespace AI SDK span attributes.
const AISDK_OPERATION_PREFIXES: &[&str] = &[
    // Mastra prefixes with operation name instead of `ai`
    "stream",
    "generateText",
    "streamText",
    "generateObject",
    "streamObject",
];

const INPUT_ATTRIBUTE_NAME: &str = "lmnr.span.input";
const OUTPUT_ATTRIBUTE_NAME: &str = "lmnr.span.output";
/// If this attribute is set to true, the parent span will be overridden with
/// null. We hackily use this when we wrap a span in a NonRecordingSpan that
/// is not sent to the backend – this is done to overwrite trace IDs for spans.
const OVERRIDE_PARENT_SPAN_ATTRIBUTE_NAME: &str = "lmnr.internal.override_parent_span";
const TRACING_LEVEL_ATTRIBUTE_NAME: &str = "lmnr.internal.tracing_level";

const HAS_BROWSER_SESSION_ATTRIBUTE_NAME: &str = "lmnr.internal.has_browser_session";

static GEN_AI_CONTENT_OR_ROLE_ATTRIBUTE_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"gen_ai\.(prompt|completion)\.\d+\.(content|role)").unwrap());

static LEGACY_LITELLM_CONTENT_OR_ROLE_ATTRIBUTE_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"SpanAttributes\.LLM_(PROMPTS|COMPLETIONS)\.\d+\.(content|role)").unwrap()
});

static GEN_AI_PROMPT_ATTRIBUTE_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^gen_ai\.prompt\.(\d+)").unwrap());

static GEN_AI_COMPLETION_ATTRIBUTE_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^gen_ai\.completion\.(\d+)").unwrap());

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "snake_case")]
enum TracingLevel {
    Off,
    MetaOnly,
}

#[derive(Copy, Clone)]
pub struct InputTokens {
    pub regular_input_tokens: i64,
    pub cache_write_tokens: i64,
    pub cache_read_tokens: i64,
}

impl InputTokens {
    pub fn total(&self) -> i64 {
        self.regular_input_tokens + self.cache_write_tokens + self.cache_read_tokens
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct SpanAttributes {
    pub raw_attributes: HashMap<String, Value>,
}

impl SpanAttributes {
    pub fn new(attributes: HashMap<String, Value>) -> Self {
        Self {
            raw_attributes: attributes,
        }
    }

    pub fn string_attr(&self, key: &str) -> Option<String> {
        match self.raw_attributes.get(key) {
            Some(Value::String(s)) => Some(s.clone()),
            _ => None,
        }
    }

    pub fn int_attr(&self, key: &str) -> Option<i64> {
        match self.raw_attributes.get(key) {
            Some(Value::Number(n)) => n.as_i64(),
            _ => None,
        }
    }

    pub fn bool_attr(&self, key: &str) -> Option<bool> {
        match self.raw_attributes.get(key) {
            Some(Value::Bool(b)) => Some(*b),
            Some(Value::String(s)) => match s.to_lowercase().as_str() {
                "true" | "1" => Some(true),
                "false" | "0" => Some(false),
                _ => None,
            },
            _ => None,
        }
    }

    pub fn to_value(&self) -> Value {
        Value::Object(
            self.raw_attributes
                .iter()
                .filter_map(|(k, v)| {
                    if should_keep_attribute(&k) {
                        Some((k.clone(), v.clone()))
                    } else {
                        None
                    }
                })
                .collect::<serde_json::Map<String, Value>>(),
        )
    }

    pub fn to_string(&self) -> String {
        json_value_to_string(&self.to_value())
    }

    pub fn session_id(&self) -> Option<String> {
        let session_id_val = self
            .raw_attributes
            .get(&format!("{ASSOCIATION_PROPERTIES_PREFIX}.session_id"))
            .or(self.raw_attributes.get("ai.telemetry.metadata.session_id"))
            .or(self.raw_attributes.get("ai.telemetry.metadata.sessionId"));
        match session_id_val {
            Some(Value::String(s)) => Some(s.clone()),
            _ => None,
        }
    }

    pub fn user_id(&self) -> Option<String> {
        let user_id_val = self
            .raw_attributes
            .get(&format!("{ASSOCIATION_PROPERTIES_PREFIX}.user_id"))
            .or(self.raw_attributes.get("ai.telemetry.metadata.userId"))
            .or(self.raw_attributes.get("ai.telemetry.metadata.user_id"));
        match user_id_val {
            Some(Value::String(s)) => Some(s.clone()),
            _ => None,
        }
    }

    pub fn trace_type(&self) -> Option<TraceType> {
        self.raw_attributes
            .get(format!("{ASSOCIATION_PROPERTIES_PREFIX}.trace_type").as_str())
            .and_then(|s| serde_json::from_value(s.clone()).ok())
    }

    /// Normalize newer operation-prefixed attributes to standard `gen_ai.*` and `ai.*` keys so the existing extraction pipeline picks them up.
    pub fn normalize_aisdk_attributes(&mut self) {
        if let Some(model_id) = self.raw_attributes.get(AISDK_MODEL_ID).cloned() {
            self.insert_if_absent(GEN_AI_REQUEST_MODEL, model_id.clone());
            self.insert_if_absent("ai.model.id", model_id);
        }

        if let Some(provider) = self.raw_attributes.get(AISDK_MODEL_PROVIDER).cloned() {
            self.insert_if_absent("ai.model.provider", provider.clone());
        }
        // first normalize cached tokens for AI SDK
        self.normalize_if_absent("ai.usage.cachedInputTokens", GEN_AI_CACHE_READ_INPUT_TOKENS);
        self.normalize_if_absent(
            "ai.usage.inputTokenDetails.cacheReadTokens",
            GEN_AI_CACHE_READ_INPUT_TOKENS,
        );
        self.normalize_if_absent(
            "ai.usage.inputTokenDetails.cacheWriteTokens",
            GEN_AI_CACHE_WRITE_INPUT_TOKENS,
        );
        self.normalize_if_absent("ai.usage.inputTokens", GEN_AI_INPUT_TOKENS);
        self.normalize_if_absent("ai.usage.outputTokens", GEN_AI_OUTPUT_TOKENS);

        let Some(prefix) = self.detect_aisdk_operation_prefix() else {
            return;
        };

        // Usage attributes
        self.normalize_if_absent(&format!("{prefix}.usage.inputTokens"), GEN_AI_INPUT_TOKENS);
        self.normalize_if_absent(
            &format!("{prefix}.usage.outputTokens"),
            GEN_AI_OUTPUT_TOKENS,
        );
        self.normalize_if_absent(
            &format!("{prefix}.usage.cachedInputTokens"),
            GEN_AI_CACHE_READ_INPUT_TOKENS,
        );
        self.normalize_if_absent(
            &format!("{prefix}.usage.inputTokenDetails.cacheReadTokens"),
            GEN_AI_CACHE_READ_INPUT_TOKENS,
        );
        self.normalize_if_absent(
            &format!("{prefix}.usage.inputTokenDetails.cacheWriteTokens"),
            GEN_AI_CACHE_WRITE_INPUT_TOKENS,
        );

        self.normalize_if_absent(&format!("{prefix}.prompt.messages"), "ai.prompt.messages");
        self.normalize_if_absent(&format!("{prefix}.response.text"), "ai.response.text");
        self.normalize_if_absent(
            &format!("{prefix}.response.toolCalls"),
            "ai.response.toolCalls",
        );
        self.normalize_if_absent(&format!("{prefix}.response.object"), "ai.response.object");
    }

    fn detect_aisdk_operation_prefix(&self) -> Option<&'static str> {
        for prefix in AISDK_OPERATION_PREFIXES {
            if self
                .raw_attributes
                .contains_key(&format!("{prefix}.usage.inputTokens"))
                || self
                    .raw_attributes
                    .contains_key(&format!("{prefix}.usage.outputTokens"))
                || self
                    .raw_attributes
                    .contains_key(&format!("{prefix}.prompt.messages"))
                || self
                    .raw_attributes
                    .contains_key(&format!("{prefix}.response.text"))
                || self
                    .raw_attributes
                    .contains_key(&format!("{prefix}.response.toolCalls"))
                || self
                    .raw_attributes
                    .contains_key(&format!("{prefix}.response.object"))
            {
                return Some(prefix);
            }
        }
        None
    }

    /// Copy a value from `source_key` to `target_key` if source exists and target does not.
    fn normalize_if_absent(&mut self, source_key: &str, target_key: &str) {
        if !self.raw_attributes.contains_key(target_key) {
            if let Some(value) = self.raw_attributes.get(source_key).cloned() {
                self.raw_attributes.insert(target_key.to_string(), value);
            }
        }
    }

    /// Insert a value only if the key does not already exist.
    fn insert_if_absent(&mut self, key: &str, value: Value) {
        if !self.raw_attributes.contains_key(key) {
            self.raw_attributes.insert(key.to_string(), value);
        }
    }

    pub fn input_tokens(&mut self) -> InputTokens {
        let total_input_tokens =
            if let Some(Value::Number(n)) = self.raw_attributes.get(GEN_AI_INPUT_TOKENS) {
                n.as_i64().unwrap_or(0)
            } else if let Some(Value::Number(n)) = self.raw_attributes.get(GEN_AI_PROMPT_TOKENS) {
                // updating to the new convention
                let n = n.as_i64().unwrap_or(0);
                self.raw_attributes
                    .insert(GEN_AI_INPUT_TOKENS.to_string(), json!(n));
                n
            } else {
                0
            };

        let cache_write_tokens = self
            .raw_attributes
            .get(GEN_AI_CACHE_WRITE_INPUT_TOKENS)
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        let cache_read_tokens = self
            .raw_attributes
            .get(GEN_AI_CACHE_READ_INPUT_TOKENS)
            .and_then(|v| v.as_i64())
            .unwrap_or(0);

        let regular_input_tokens =
            (total_input_tokens - (cache_write_tokens + cache_read_tokens)).max(0);

        InputTokens {
            regular_input_tokens,
            cache_write_tokens,
            cache_read_tokens,
        }
    }

    pub fn output_tokens(&mut self) -> i64 {
        if let Some(Value::Number(n)) = self.raw_attributes.get(GEN_AI_OUTPUT_TOKENS) {
            n.as_i64().unwrap_or(0)
        } else if let Some(Value::Number(n)) = self.raw_attributes.get(GEN_AI_COMPLETION_TOKENS) {
            // updating to the new convention
            let n = n.as_i64().unwrap_or(0);
            self.raw_attributes
                .insert(GEN_AI_OUTPUT_TOKENS.to_string(), json!(n));
            n
        } else {
            0
        }
    }

    pub fn input_cost(&mut self) -> Option<f64> {
        if let Some(Value::Number(n)) = self.raw_attributes.get(GEN_AI_INPUT_COST) {
            n.as_f64()
        } else {
            None
        }
    }

    pub fn output_cost(&mut self) -> Option<f64> {
        if let Some(Value::Number(n)) = self.raw_attributes.get(GEN_AI_OUTPUT_COST) {
            n.as_f64()
        } else {
            None
        }
    }

    pub fn total_cost(&mut self) -> Option<f64> {
        if let Some(Value::Number(n)) = self.raw_attributes.get(GEN_AI_TOTAL_COST) {
            n.as_f64()
        } else {
            None
        }
    }

    pub fn request_model(&self) -> Option<String> {
        match self.raw_attributes.get(GEN_AI_REQUEST_MODEL) {
            Some(Value::String(s)) => Some(s.clone()),
            _ => None,
        }
    }

    pub fn response_model(&self) -> Option<String> {
        match self.raw_attributes.get(GEN_AI_RESPONSE_MODEL) {
            Some(Value::String(s)) => Some(s.clone()),
            _ => None,
        }
    }

    pub fn provider_name(&self, span_name: &str) -> Option<String> {
        let name = if let Some(Value::String(provider)) = self.raw_attributes.get(GEN_AI_SYSTEM) {
            // For several versions prior to https://github.com/traceloop/openllmetry/pull/3165
            // and thus before `opentelemetry-instrumentation-langchain` 0.43.1, OpenLLMetry used
            // to send the provider name as "Langchain" and the actual provider.

            // TODO: Since `lmnr 0.7.2` in Python, we have upgraded to OpenLLMetry >= 0.44.0,
            // which correctly sends the provider name as the actual provider name, so
            // this logic can be removed in a few months. We should also stop passing
            // the span name all the way to here when we remove this logic.
            if provider.to_lowercase().trim() == "langchain" {
                // In some old versions, they would add an association property `ls_provider`
                // to the span attributes.
                let ls_provider = self
                    .raw_attributes
                    .get(format!("{ASSOCIATION_PROPERTIES_PREFIX}.ls_provider").as_str())
                    .and_then(|s: &Value| serde_json::from_value(s.clone()).ok());
                if let Some(ls_provider) = ls_provider {
                    ls_provider
                } else if span_name.contains(".")
                    && span_name.to_lowercase().trim().starts_with("chat")
                {
                    // If there is no `ls_provider` attribute, we can try to extract the provider
                    // name from the span name.
                    span_name
                        .to_lowercase()
                        .replacen("chat", "", 1)
                        .split(".")
                        .next()
                        .map(String::from)
                } else {
                    Some(provider.clone())
                }
            } else {
                // handling the cases when provider is sent like "anthropic.messages"
                provider.split('.').next().map(String::from)
            }
        } else {
            None
        };

        name.map(|name| name.to_lowercase().trim().to_string())
    }

    pub fn span_type(&self) -> SpanType {
        if let Some(span_type) = self.raw_attributes.get(SPAN_TYPE) {
            return serde_json::from_value::<SpanType>(span_type.clone()).unwrap_or_default();
        }

        // OTel GenAI semantic conventions — use `gen_ai.operation.name` as the authoritative
        // signal when present (emitted by pydantic_ai v5 and other spec-compliant libraries).
        if let Some(Value::String(op)) = self.raw_attributes.get(GEN_AI_OPERATION_NAME) {
            match op.as_str() {
                "chat" | "text_completion" | "embeddings" | "generate_content" => {
                    return SpanType::LLM;
                }
                "execute_tool" => return SpanType::Tool,
                // `invoke_agent` stays Default — agent runs are containers whose children carry
                // the LLM/tool content.
                "invoke_agent" => return SpanType::Default,
                _ => {}
            }
        }

        // Some OTel GenAI emitters (e.g. pydantic_ai's tool spans) omit `gen_ai.operation.name`
        // but include `gen_ai.tool.call.*` attributes. Infer Tool type from those.
        if self.raw_attributes.contains_key(GEN_AI_TOOL_CALL_ARGUMENTS)
            || self.raw_attributes.contains_key(GEN_AI_TOOL_CALL_RESULT)
        {
            return SpanType::Tool;
        }

        // quick hack until we figure how to set span type on auto-instrumentation
        if self.raw_attributes.contains_key(GEN_AI_SYSTEM)
            || self.raw_attributes.iter().any(|(k, _)| {
                // AI SDK reports usage on parent spans as well, which we don't want converted to LLM type
                (k.starts_with("gen_ai.") && !k.starts_with("gen_ai.usage."))
                    || k.starts_with("llm.")
                    || k.starts_with("aisdk.")
            })
        {
            SpanType::LLM
        } else {
            SpanType::Default
        }
    }

    pub fn path(&self) -> Option<Vec<String>> {
        let raw_path = self.raw_path();
        raw_path.map(|path| {
            path.into_iter()
                .filter(|name| !skip_span_name(name))
                .collect()
        })
    }

    fn raw_path(&self) -> Option<Vec<String>> {
        match self.raw_attributes.get(SPAN_PATH) {
            Some(Value::Array(arr)) => Some(arr.iter().map(|v| json_value_to_string(v)).collect()),
            Some(Value::String(s)) => Some(vec![s.clone()]),
            _ => None,
        }
    }

    pub fn flat_path(&self) -> Option<String> {
        self.path().map(|path| path.join("."))
    }

    pub fn ids_path(&self) -> Option<Vec<String>> {
        let attributes_ids_path = match self.raw_attributes.get(SPAN_IDS_PATH) {
            Some(Value::Array(arr)) => Some(
                arr.iter()
                    .map(|v| json_value_to_string(v))
                    .collect::<Vec<_>>(),
            ),
            _ => None,
        };

        attributes_ids_path.map(|ids_path| {
            let path = self.raw_path();
            if let Some(path) = path {
                ids_path
                    .into_iter()
                    .zip(path.into_iter())
                    .filter_map(|(id, name)| {
                        if skip_span_name(&name) {
                            None
                        } else {
                            Some(id)
                        }
                    })
                    .collect()
            } else {
                ids_path
            }
        })
    }

    pub fn set_usage(&mut self, usage: &SpanUsage) {
        self.raw_attributes
            .insert(GEN_AI_INPUT_TOKENS.to_string(), json!(usage.input_tokens));
        self.raw_attributes
            .insert(GEN_AI_OUTPUT_TOKENS.to_string(), json!(usage.output_tokens));
        self.raw_attributes.insert(
            "llm.usage.total_tokens".to_string(),
            json!(usage.total_tokens),
        );
        self.raw_attributes
            .insert(GEN_AI_TOTAL_COST.to_string(), json!(usage.total_cost));
        self.raw_attributes
            .insert(GEN_AI_INPUT_COST.to_string(), json!(usage.input_cost));
        self.raw_attributes
            .insert(GEN_AI_OUTPUT_COST.to_string(), json!(usage.output_cost));

        if let Some(request_model) = &usage.request_model {
            self.raw_attributes
                .insert(GEN_AI_REQUEST_MODEL.to_string(), json!(request_model));
        }
        if let Some(response_model) = &usage.response_model {
            self.raw_attributes
                .insert(GEN_AI_RESPONSE_MODEL.to_string(), json!(response_model));
        }
        if let Some(provider_name) = &usage.provider_name {
            self.raw_attributes
                .insert(GEN_AI_SYSTEM.to_string(), json!(provider_name));
        }
    }

    /// Extend the span path.
    ///
    /// This is a hack which helps not to change traceloop auto-instrumentation code. It will
    /// modify autoinstrumented LLM spans to have correct span path.
    ///
    /// NOTE: Nested spans generated by Langchain auto-instrumentation may have the same path
    /// because we don't have a way to set the span name/path in the auto-instrumentation code.
    pub fn extend_span_path(&mut self, span_name: &str) {
        if let Some(serde_json::Value::Array(path)) = self.raw_attributes.get(SPAN_PATH) {
            if path.len() > 0
                && !matches!(path.last().unwrap(), serde_json::Value::String(s) if s == span_name)
            {
                let mut new_path = path.clone();
                new_path.push(serde_json::Value::String(span_name.to_string()));
                self.raw_attributes
                    .insert(SPAN_PATH.to_string(), Value::Array(new_path));
            }
        } else {
            self.raw_attributes.insert(
                SPAN_PATH.to_string(),
                Value::Array(vec![serde_json::Value::String(span_name.to_string())]),
            );
        }
    }

    pub fn update_path(&mut self) {
        self.raw_attributes.insert(
            SPAN_IDS_PATH.to_string(),
            Value::Array(
                self.ids_path()
                    .unwrap_or_default()
                    .into_iter()
                    .map(serde_json::Value::String)
                    .collect(),
            ),
        );
        self.raw_attributes.insert(
            SPAN_PATH.to_string(),
            Value::Array(
                self.path()
                    .unwrap_or_default()
                    .into_iter()
                    .map(serde_json::Value::String)
                    .collect(),
            ),
        );
    }

    pub fn tags(&self) -> Vec<String> {
        let attr_tags = self
            .raw_attributes
            .get(&format!("{ASSOCIATION_PROPERTIES_PREFIX}.tags"));
        let attr_labels = self
            .raw_attributes
            .get(&format!("{ASSOCIATION_PROPERTIES_PREFIX}.labels"));
        let aisdk_tags = self.raw_attributes.get("ai.telemetry.metadata.tags");
        match attr_tags.or(aisdk_tags).or(attr_labels) {
            Some(Value::Array(arr)) => arr
                .iter()
                .map(|v| json_value_to_string(v))
                .collect::<HashSet<String>>()
                .into_iter()
                .collect(),
            _ => Vec::new(),
        }
    }

    pub fn metadata(&self) -> Option<HashMap<String, Value>> {
        let mut metadata = self.get_flattened_association_properties("metadata");
        let ai_sdk_metadata = self.get_flattened_properties("ai", "telemetry.metadata");
        metadata.extend(ai_sdk_metadata);
        if metadata.is_empty() {
            None
        } else {
            Some(metadata)
        }
    }

    pub fn has_browser_session(&self) -> Option<bool> {
        if self
            .raw_attributes
            .contains_key(HAS_BROWSER_SESSION_ATTRIBUTE_NAME)
        {
            Some(true)
        } else {
            None
        }
    }

    fn get_flattened_association_properties(&self, entity: &str) -> HashMap<String, Value> {
        self.get_flattened_properties(ASSOCIATION_PROPERTIES_PREFIX, entity)
    }

    fn get_flattened_properties(
        &self,
        attribute_prefix: &str,
        entity: &str,
    ) -> HashMap<String, Value> {
        let mut res = HashMap::new();
        let prefix = format!("{attribute_prefix}.{entity}.");
        for (key, value) in self.raw_attributes.iter() {
            if key.starts_with(&prefix) {
                res.insert(
                    key.strip_prefix(&prefix).unwrap().to_string(),
                    value.clone(),
                );
            }
        }
        res
    }

    fn tracing_level(&self) -> Option<TracingLevel> {
        self.raw_attributes
            .get(TRACING_LEVEL_ATTRIBUTE_NAME)
            .and_then(|s| serde_json::from_value(s.clone()).ok())
    }

    fn is_claude_code_span(&self) -> bool {
        self.raw_attributes
            .get("lmnr.internal.claude_code_proxy")
            .is_some_and(|v| *v == Value::Bool(true))
    }

    fn is_skip_cc_span(&self) -> bool {
        self.is_claude_code_span()
            && self
                .raw_attributes
                .get("lmnr.internal.cc_skip_span")
                .is_some_and(|v| *v == Value::Bool(true))
    }
}

impl Span {
    /// An early check to filter out spans. Intended primarily to filter out noise spans from
    /// instrumentations. Assumes the skipped span, may have children, so it's the caller's
    /// responsibility to remove this span from their paths.
    pub fn should_save(&self) -> bool {
        self.attributes.tracing_level() != Some(TracingLevel::Off) && !skip_span_name(&self.name)
    }

    /// Create a span from an OpenTelemetry span.
    ///
    /// This is called on the producer side of the MQ, i.e. at the OTel ingester
    /// side, so it must be lightweight.
    pub fn from_otel_span(otel_span: OtelSpan, project_id: Uuid) -> Self {
        let trace_id = Uuid::from_slice(&otel_span.trace_id).unwrap();

        let span_id = span_id_to_uuid(&otel_span.span_id);

        let parent_span_id = if otel_span.parent_span_id.is_empty() {
            None
        } else {
            Some(span_id_to_uuid(&otel_span.parent_span_id))
        };

        let events = otel_span
            .events
            .into_iter()
            .map(|event| Event::from_otel(event, span_id, project_id, trace_id))
            .collect();

        let attributes = otel_span
            .attributes
            .into_iter()
            .map(|k| (k.key, convert_any_value_to_json_value(k.value)))
            .collect::<HashMap<String, Value>>();

        let override_parent_span = attributes.get(OVERRIDE_PARENT_SPAN_ATTRIBUTE_NAME).cloned();

        let mut span = Span {
            span_id,
            project_id,
            trace_id,
            parent_span_id,
            name: otel_span.name,
            attributes: SpanAttributes::new(attributes),
            start_time: Utc.timestamp_nanos(otel_span.start_time_unix_nano as i64),
            end_time: Utc.timestamp_nanos(otel_span.end_time_unix_nano as i64),
            events,
            ..Default::default()
        };

        // Only set span type and handle basic attribute overrides - keep this lightweight
        span.span_type = span.attributes.span_type();

        // Spans with this attribute are wrapped in a NonRecordingSpan that, and we only
        // do that when we add a new span to a trace as a root span.
        if let Some(Value::Bool(true)) = override_parent_span {
            span.parent_span_id = None;
        }

        span
    }

    /// Parse and enrich span attributes for input/output extraction.
    /// This is called on the consumer side where we can afford heavier processing.
    pub fn parse_and_enrich_attributes(&mut self) {
        // Get the raw attributes map for parsing
        if self.attributes.raw_attributes.is_empty() {
            return;
        }

        self.attributes.normalize_aisdk_attributes();

        if self.is_llm_span() {
            if self
                .attributes
                .raw_attributes
                .get("gen_ai.prompt.0.role")
                .is_some()
                || self
                    .attributes
                    .raw_attributes
                    .get("gen_ai.prompt.0.content")
                    .is_some()
            {
                let input_messages = input_chat_messages_from_genai_attributes(
                    &mut self.attributes.raw_attributes,
                    "gen_ai.prompt",
                );

                self.input = Some(json!(input_messages));
                self.output = output_from_genai_attributes(&mut self.attributes.raw_attributes);
            } else if let Some(stringified_value) = self
                .attributes
                .raw_attributes
                .get("ai.prompt.messages")
                .and_then(|v| v.as_str())
            {
                if let Ok(prompt_messages_val) = serde_json::from_str::<Value>(stringified_value) {
                    if let Ok(input_messages) = input_chat_messages_from_json(&prompt_messages_val)
                    {
                        self.input = Some(json!(input_messages));
                    }
                }

                if let Some(output) = try_parse_ai_sdk_output(&mut self.attributes.raw_attributes) {
                    self.output = Some(output);
                }
                convert_ai_sdk_tool_calls(&mut self.attributes.raw_attributes);
            }

            // OTel GenAI semantic conventions — `gen_ai.input.messages` / `gen_ai.output.messages`
            // carry a JSON array of `{role, parts: [...]}` objects. Convert to our canonical
            // ChatMessage shape so the frontend's message renderer can display them. Overrides
            // older `gen_ai.prompt.*` / `gen_ai.completion.*` if both are present.
            if let Some(input) = self.attributes.raw_attributes.remove(GEN_AI_INPUT_MESSAGES) {
                let parsed = parse_genai_messages_attribute(&input);
                if let Some(mut messages) = convert_genai_input_messages(&parsed) {
                    if let Some(system) = self
                        .attributes
                        .raw_attributes
                        .remove(GEN_AI_SYSTEM_INSTRUCTIONS)
                    {
                        let parsed_system = parse_genai_messages_attribute(&system);
                        if let Some(system_parts) =
                            convert_genai_system_instructions(&parsed_system)
                        {
                            messages.insert(0, system_parts);
                        } else {
                            // Conversion failed (e.g. value is a plain string, not a parts
                            // array). Put it back so the attribute isn't silently lost.
                            self.attributes
                                .raw_attributes
                                .insert(GEN_AI_SYSTEM_INSTRUCTIONS.to_string(), system);
                        }
                    }
                    self.input = Some(serde_json::to_value(messages).unwrap_or(parsed));
                } else {
                    self.input = Some(parsed);
                }
            } else if let Some(system) = self
                .attributes
                .raw_attributes
                .remove(GEN_AI_SYSTEM_INSTRUCTIONS)
            {
                // `system_instructions` present but no input.messages — surface it anyway.
                let parsed = parse_genai_messages_attribute(&system);
                if let Some(system_msg) = convert_genai_system_instructions(&parsed) {
                    self.input = Some(serde_json::to_value(vec![system_msg]).unwrap_or(parsed));
                } else {
                    self.input = Some(parsed);
                }
            }
            if let Some(output) = self
                .attributes
                .raw_attributes
                .remove(GEN_AI_OUTPUT_MESSAGES)
            {
                let parsed = parse_genai_messages_attribute(&output);
                if let Some(messages) = convert_genai_output_messages(&parsed) {
                    self.output = Some(serde_json::to_value(messages).unwrap_or(parsed));
                } else {
                    self.output = Some(parsed);
                }
            }
        }

        // OTel GenAI tool spans (pydantic_ai's `execute_tool {name}`). These aren't LLM spans,
        // so they don't go through the LLM path — handle them separately. Gate on
        // `span_type == Tool` (which `span_type()` already infers from `gen_ai.operation.name`
        // or the `gen_ai.tool.call.*` fallback) so we don't clobber LLM-span input/output if a
        // spec-violating emitter mixes LLM message attrs with tool-call attrs on the same span.
        if self.span_type == SpanType::Tool {
            if let Some(args) = self
                .attributes
                .raw_attributes
                .remove(GEN_AI_TOOL_CALL_ARGUMENTS)
            {
                self.input = Some(parse_genai_messages_attribute(&args));
            }
            if let Some(result) = self
                .attributes
                .raw_attributes
                .remove(GEN_AI_TOOL_CALL_RESULT)
            {
                self.output = Some(parse_genai_messages_attribute(&result));
            }
        }

        // try parsing LiteLLM inner span for well-known providers
        if self.name == "raw_gen_ai_request" {
            self.input = self
                .input
                .take()
                .or(self
                    .attributes
                    .raw_attributes
                    .get("llm.openai.messages")
                    .cloned())
                .or(self
                    .attributes
                    .raw_attributes
                    .get("llm.anthropic.messages")
                    .cloned());

            self.output = self
                .output
                .take()
                .or(self
                    .attributes
                    .raw_attributes
                    .get("llm.openai.choices")
                    .cloned())
                .or(self
                    .attributes
                    .raw_attributes
                    .get("llm.anthropic.content")
                    .cloned());
        }

        // Vercel AI SDK wraps "raw" LLM spans in an additional `ai.generateText` span.
        // Which is not really an LLM span, but it has the prompt in its attributes.
        // Set the input to the prompt and the output to the response.
        if let Some(serde_json::Value::String(s)) = self.attributes.raw_attributes.get("ai.prompt")
        {
            let ai_prompt =
                serde_json::from_str::<Value>(s).unwrap_or(serde_json::Value::String(s.clone()));
            if let Some(messages_value) = ai_prompt.get("messages") {
                let mut messages =
                    input_chat_messages_from_json(&messages_value).unwrap_or_default();
                let system = ai_prompt
                    .get("system")
                    .and_then(|v| v.as_str())
                    .map(|v| v.to_string());
                if let Some(system) = system {
                    messages.insert(
                        0,
                        ChatMessage {
                            role: "system".to_string(),
                            content: ChatMessageContent::Text(system),
                            tool_call_id: None,
                        },
                    );
                }
                self.input = Some(serde_json::to_value(messages).unwrap());
            }
            self.output = self
                .output
                .take()
                .or(try_parse_ai_sdk_output(&mut self.attributes.raw_attributes));
            // Rename AI SDK spans to what's set by telemetry.functionId
            if let Some(Value::String(s)) = self.attributes.raw_attributes.get("operation.name") {
                if s.starts_with(&format!("{} ", self.name)) {
                    let new_name = s
                        .strip_prefix(&format!("{} ", self.name))
                        .unwrap_or(&self.name)
                        .to_string();
                    rename_last_span_in_path(
                        &mut self.attributes.raw_attributes,
                        &self.name,
                        &new_name,
                    );
                    self.name = new_name;
                }
            }
            convert_ai_sdk_tool_calls(&mut self.attributes.raw_attributes);
        }

        if self.is_ai_sdk_tool_call_span() {
            self.span_type = SpanType::Tool;
            if let Some(Value::String(name)) =
                self.attributes.raw_attributes.remove("ai.toolCall.name")
            {
                self.name = name;
            }
            if let Some(args_value) = self.attributes.raw_attributes.remove("ai.toolCall.args") {
                if let Value::String(s) = &args_value {
                    if let Ok(args) = serde_json::from_str::<Value>(s) {
                        self.input = Some(args);
                    } else {
                        self.input = Some(args_value);
                    }
                } else {
                    self.input = Some(args_value);
                }
            }
            if let Some(result_value) = self.attributes.raw_attributes.remove("ai.toolCall.result")
            {
                if let Value::String(s) = &result_value {
                    if let Ok(result) = serde_json::from_str::<Value>(s) {
                        self.output = Some(result);
                    } else {
                        self.output = Some(result_value);
                    }
                } else {
                    self.output = Some(result_value);
                }
            }
        }

        // Traceloop hard-codes these attributes to LangChain auto-instrumented spans.
        // Take their values if input/output are not already set.
        self.input = self.input.take().or(self
            .attributes
            .raw_attributes
            .get("traceloop.entity.input")
            .cloned());
        self.output = self.output.take().or(self
            .attributes
            .raw_attributes
            .get("traceloop.entity.output")
            .cloned());

        // Ignore inputs for Traceloop Langchain RunnableSequence spans
        if self.name.starts_with("RunnableSequence")
            && self
                .attributes
                .raw_attributes
                .get("traceloop.entity.name")
                .map(|s| json_value_to_string(s) == "RunnableSequence")
                .unwrap_or(false)
        {
            self.input = None;
        }

        // If an LLM span is sent manually, we prefer `lmnr.span.input` and `lmnr.span.output`
        // attributes over gen_ai/vercel/LiteLLM attributes.
        // Therefore this block is outside and after the LLM span type check.
        if let Some(serde_json::Value::String(s)) =
            self.attributes.raw_attributes.get(INPUT_ATTRIBUTE_NAME)
        {
            let input =
                serde_json::from_str::<Value>(s).unwrap_or(serde_json::Value::String(s.clone()));
            if self.is_llm_span() {
                let input_messages = input_chat_messages_from_json(&input);
                if let Ok(input_messages) = input_messages {
                    self.input = Some(json!(input_messages));
                } else {
                    self.input = Some(input);
                }
            } else {
                self.input = Some(input);
            }
        }
        if let Some(serde_json::Value::String(s)) =
            self.attributes.raw_attributes.get(OUTPUT_ATTRIBUTE_NAME)
        {
            // TODO: try parse output as ChatMessage with tool calls
            self.output = Some(
                serde_json::from_str::<Value>(s).unwrap_or(serde_json::Value::String(s.clone())),
            );
        }

        if let Some(TracingLevel::MetaOnly) = self.attributes.tracing_level() {
            self.input = None;
            self.output = None;
        }
    }

    /// This function MUST to be called right after we deserialize or create a span object.
    pub fn estimate_size_bytes(&mut self) {
        // 16 bytes for span_id,
        // 16 bytes for trace_id,
        // 16 bytes for parent_span_id,
        // 8 bytes for start_time,
        // 8 bytes for end_time,

        // For OTel spans, input/output start inside raw_attributes and are
        // parsed out later, so raw_attributes alone captures the payload.
        // For /v1/spans, input/output are set directly on the Span and must
        // be counted separately.
        let size_bytes = 16
            + 16
            + 16
            + 8
            + 8
            + self.name.len()
            + self
                .attributes
                .raw_attributes
                .iter()
                .map(|(k, v)| k.len() + estimate_json_size(v))
                .sum::<usize>()
            + self.input.as_ref().map_or(0, |v| estimate_json_size(v))
            + self.output.as_ref().map_or(0, |v| estimate_json_size(v))
            + self
                .events
                .iter()
                .map(|event| event.estimate_size_bytes())
                .sum::<usize>();
        self.size_bytes = size_bytes;
    }

    /// Check if the span is the wrapper of a tool call made by AI SDK on behalf
    /// of the user, when `execute` was register in tool definitions when calling
    /// `generateText`
    fn is_ai_sdk_tool_call_span(&self) -> bool {
        // "or" here so this doesn't break if AI SDK renames the span
        self.name == "ai.toolCall"
            || (self
                .attributes
                .raw_attributes
                .contains_key("ai.toolCall.name")
                || self
                    .attributes
                    .raw_attributes
                    .contains_key("ai.toolCall.id"))
    }

    pub fn is_llm_span(&self) -> bool {
        let is_cached_llm_span = self.attributes.span_type() == SpanType::Cached
            && self
                .attributes
                .raw_attributes
                .get("lmnr.span.original_type")
                == Some(&Value::String("LLM".to_string()));
        !self.is_ai_sdk_tool_call_span()
            && (self.attributes.span_type() == SpanType::LLM
                || is_cached_llm_span
                || self.span_type == SpanType::LLM)
    }

    pub fn should_record_to_clickhouse(&self) -> bool {
        // This function is intended to filter out "signal" spans from record to clickhouse.
        // Signal spans are assumed to be leaf spans, so they are not removed from path.
        // They could be LLM spans though, so this check can/should be performed after
        // aggregating trace token/cost stats.

        // One of the signal spans is the span that carries the attribute to indicate whether
        // the trace has a browser session or not and is named "cdp_use.session".
        if self.attributes.has_browser_session().unwrap_or(false) && self.name == "cdp_use.session"
        {
            return false;
        }
        // Older Claude Code made LLM calls inside Bash tool calls, and we don't need these
        // spans.
        if self.name == "anthropic.messages" {
            // New versions of our proxy annotate this via attributes
            if self.attributes.is_skip_cc_span() {
                return false;
            }
            // For older versions of our proxy, apply similar heuristics here directly
            if self.attributes.is_claude_code_span()
                && (self
                    .attributes
                    .request_model()
                    .is_some_and(|m| m.to_lowercase().contains("haiku"))
                || self
                    .attributes
                    .response_model()
                    .is_some_and(|m| m.to_lowercase().contains("haiku"))
                )
                // input check is relatively heavy, so perform it after simpler checks
                && self.is_input_cc_bash_check()
            {
                return false;
            }
        }
        true
    }

    fn is_input_cc_bash_check(&self) -> bool {
        // We stringify the input for this check, which causes newline chars to be escaped.
        static IS_DISPLAYING_CONTENT_REGEX: LazyLock<Regex> = LazyLock::new(|| {
            Regex::new(
            "Format your response as:(?:\\\\n)*<is_displaying_contents>(?:\\\\n)*(?:true|false)(?:\\\\n)*</is_displaying_contents>(?:\\\\n)*<filepaths>(?:\\\\n)*path/to/file1(?:\\\\n)*path/to/file2(?:\\\\n)*</filepaths>"
        ).unwrap()
        });
        static PREFIX_DETECTION_REGEX: LazyLock<Regex> = LazyLock::new(|| {
            Regex::new(
                "<policy_spec>(?:\\\\n)*# Claude (?:Code ){1,2}Bash command prefix detection",
            )
            .unwrap()
        });
        static COMMAND_REGEX: LazyLock<Regex> =
            LazyLock::new(|| Regex::new("(?:\\\\n)*[Cc]ommand: ").unwrap());

        let maybe_input_str = self.input.as_ref().map(|i| json_value_to_string(i));
        let is_displaying_content = maybe_input_str
            .as_ref()
            .is_some_and(|s| IS_DISPLAYING_CONTENT_REGEX.is_match(s));

        if is_displaying_content {
            return true;
        }

        let prefix_detection = maybe_input_str
            .as_ref()
            .is_some_and(|s| PREFIX_DETECTION_REGEX.is_match(s) && COMMAND_REGEX.is_match(s));
        if prefix_detection {
            return true;
        }
        false
    }
}

pub fn should_keep_attribute(attribute: &str) -> bool {
    // do not duplicate function input/output as they are stored in DEFAULT span's input/output
    if attribute == INPUT_ATTRIBUTE_NAME || attribute == OUTPUT_ATTRIBUTE_NAME {
        return false;
    }
    // remove traceloop.entity.input/output as we parse them to span's input/output
    // These are hard-coded by opentelemetry-instrumentation-langchain for some of
    // the deeply nested spans
    if attribute == "traceloop.entity.input" || attribute == "traceloop.entity.output" {
        return false;
    }

    if attribute == "traceloop.entity.path" {
        return false;
    }

    if attribute == OVERRIDE_PARENT_SPAN_ATTRIBUTE_NAME {
        return false;
    }

    // OpenLLMetry
    // remove gen_ai.prompt/completion attributes as they are stored in LLM span's input/output
    if GEN_AI_CONTENT_OR_ROLE_ATTRIBUTE_REGEX.is_match(attribute) {
        return false;
    }

    // older LiteLLM
    // remove SpanAttributes.LLM_PROMPTS/COMPLETIONS attributes as they are stored in LLM span's input/output;
    if LEGACY_LITELLM_CONTENT_OR_ROLE_ATTRIBUTE_REGEX.is_match(attribute) {
        return false;
    }

    // AI SDK
    // remove ai.prompt.messages as it is stored in AI SDK span inputs
    if attribute == "ai.prompt.messages" || attribute == "ai.prompt" {
        return false;
    }

    // Newer AI SDK operation-prefixed attributes that have been normalized to
    // standard `ai.*` / `gen_ai.*` keys. Remove the originals to save storage.
    const AISDK_NORMALIZED_SUFFIXES: &[&str] = &[
        ".prompt.messages",
        ".response.text",
        ".response.object",
        ".usage.inputTokens",
        ".usage.outputTokens",
        ".usage.cachedInputTokens",
    ];
    if AISDK_OPERATION_PREFIXES
        .iter()
        .any(|p| attribute.starts_with(&format!("{p}.")))
        && AISDK_NORMALIZED_SUFFIXES
            .iter()
            .any(|s| attribute.ends_with(s))
    {
        return false;
    }

    true
}

pub struct SpanUsage {
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub total_tokens: i64,
    pub input_cost: f64,
    pub output_cost: f64,
    pub total_cost: f64,
    pub request_model: Option<String>,
    pub response_model: Option<String>,
    pub provider_name: Option<String>,
}

fn input_chat_messages_from_genai_attributes(
    attributes: &mut HashMap<String, Value>,
    prefix: &str,
) -> Vec<ChatMessage> {
    let mut input_messages: Vec<ChatMessage> = vec![];

    let prompt_message_count = attributes
        .keys()
        .filter_map(|k| {
            GEN_AI_PROMPT_ATTRIBUTE_REGEX
                .captures(k)
                .and_then(|m| m.get(1).and_then(|s| s.as_str().parse::<usize>().ok()))
        })
        .max()
        .unwrap_or(0);

    for i in 0..=prompt_message_count {
        let tool_calls = parse_tool_calls(attributes, &format!("{prefix}.{i}"));
        let content = if let Some(serde_json::Value::String(s)) =
            attributes.remove(&format!("{prefix}.{i}.content"))
        {
            s
            // Some instrumentations send reasoning as a separate field
            // While others like Anthropic send it as a separate message with role "reasoning"
        } else if let Some(serde_json::Value::String(s)) =
            attributes.remove(&format!("{prefix}.{i}.reasoning"))
        {
            s
        } else {
            "".to_string()
        };

        let role = if let Some(serde_json::Value::String(s)) =
            attributes.remove(&format!("{prefix}.{i}.role"))
        {
            s
        } else if tool_calls.is_empty() {
            "user".to_string()
        } else {
            "assistant".to_string()
        };
        let tool_call_id = attributes
            .get(&format!("{prefix}.{i}.tool_call_id"))
            .and_then(|v| v.as_str())
            .map(String::from);

        input_messages.push(ChatMessage {
            tool_call_id,
            role,
            content: match serde_json::from_str::<Vec<InstrumentationChatMessageContentPart>>(
                &content,
            ) {
                Ok(otel_parts) => {
                    let mut parts = Vec::new();
                    for part in otel_parts {
                        parts.push(ChatMessageContentPart::from_instrumentation_content_part(
                            part,
                        ));
                    }
                    for tool_call in tool_calls {
                        parts.push(ChatMessageContentPart::ToolCall(tool_call));
                    }

                    ChatMessageContent::ContentPartList(parts)
                }
                Err(_) => {
                    if !tool_calls.is_empty() {
                        let mut parts = Vec::new();
                        if !content.is_empty() {
                            parts.push(ChatMessageContentPart::Text(ChatMessageText {
                                text: content,
                            }));
                        }
                        for tool_call in tool_calls {
                            parts.push(ChatMessageContentPart::ToolCall(tool_call));
                        }
                        ChatMessageContent::ContentPartList(parts)
                    } else {
                        ChatMessageContent::Text(content)
                    }
                }
            },
        });
    }

    input_messages
}

fn input_chat_messages_from_json(input: &serde_json::Value) -> Result<Vec<ChatMessage>> {
    if let Some(messages) = input.as_array() {
        messages
            .iter()
            .map(|message| {
                let Some(role) = message.get("role").and_then(|v| v.as_str()) else {
                    return Err(anyhow::anyhow!("Can't find role in message"));
                };
                let Some(otel_content) = message.get("content") else {
                    return Err(anyhow::anyhow!("Can't find content in message"));
                };
                let tool_call_id = message
                    .get("tool_call_id")
                    .and_then(|v| v.as_str())
                    .map(String::from);
                let content = match serde_json::from_value::<
                    Vec<InstrumentationChatMessageContentPart>,
                >(otel_content.clone())
                {
                    Ok(otel_parts) => {
                        let mut parts = Vec::new();
                        for part in otel_parts {
                            parts.push(ChatMessageContentPart::from_instrumentation_content_part(
                                part,
                            ));
                        }
                        ChatMessageContent::ContentPartList(parts)
                    }
                    Err(_) => ChatMessageContent::Text(json_value_to_string(&otel_content)),
                };
                Ok(ChatMessage {
                    role: role.to_string(),
                    content,
                    tool_call_id,
                })
            })
            .collect()
    } else {
        Err(anyhow::anyhow!("Input is not a list"))
    }
}

/// Parse a `gen_ai.*` attribute that is either a JSON string (the common case
/// when the SDK serialises a message array) or an already-structured Value.
fn parse_genai_messages_attribute(value: &Value) -> Value {
    match value {
        Value::String(s) => {
            serde_json::from_str::<Value>(s).unwrap_or_else(|_| Value::String(s.clone()))
        }
        other => other.clone(),
    }
}

/// Convert an OTel GenAI semconv input-messages array (pydantic_ai-style
/// `[{role, parts: [...]}]`) into the canonical `Vec<ChatMessage>` shape that
/// the Laminar frontend already knows how to render. Returns `None` if the
/// input is not a recognisable array of role-bearing objects — the caller
/// then falls back to the raw Value.
///
/// Each `part` in pydantic_ai/GenAI semconv is one of:
///   - `{type: "text", content: "..."}`
///   - `{type: "tool_call", id, name, arguments}`
///   - `{type: "tool_call_response", id, name, result}`
///   - `{type: "thinking", content}`
///   - `{type: "uri"|"blob", modality, mime_type, uri|content}`  (v4+)
fn convert_genai_input_messages(value: &Value) -> Option<Vec<ChatMessage>> {
    let arr = value.as_array()?;
    let mut out = Vec::with_capacity(arr.len());
    for raw in arr {
        if let Some(msg) = convert_one_genai_message(raw) {
            out.push(msg);
        }
    }
    if out.is_empty() { None } else { Some(out) }
}

/// Output messages share the same `{role, parts: [...]}` shape as input
/// messages in the OTel GenAI semconv, so we reuse the input converter.
/// `finish_reason` is already surfaced separately via span attributes.
fn convert_genai_output_messages(value: &Value) -> Option<Vec<ChatMessage>> {
    convert_genai_input_messages(value)
}

/// `gen_ai.system_instructions` is a JSON array of parts (typically text) that
/// describe the system prompt. Convert to a single `system`-role ChatMessage.
/// Returns `None` if the array is empty or all parts were unrecognised — the
/// caller then falls back to preserving the raw attribute instead of silently
/// dropping the system prompt.
fn convert_genai_system_instructions(value: &Value) -> Option<ChatMessage> {
    let parts = convert_genai_parts(value.as_array()?)?;
    if parts.is_empty() {
        return None;
    }
    Some(ChatMessage {
        role: "system".to_string(),
        content: ChatMessageContent::ContentPartList(parts),
        tool_call_id: None,
    })
}

fn convert_one_genai_message(raw: &Value) -> Option<ChatMessage> {
    let obj = raw.as_object()?;
    let role = obj.get("role").and_then(|v| v.as_str())?.to_string();
    let parts_value = obj.get("parts").and_then(|v| v.as_array());
    let mut content_parts: Vec<ChatMessageContentPart> = Vec::new();
    let mut tool_call_id: Option<String> = None;
    if let Some(parts) = parts_value {
        // Tool response messages carry a single `tool_call_response` part whose
        // `id` should bubble up to the canonical ChatMessage.tool_call_id so the
        // frontend threads it to the matching tool_call.
        for part in parts {
            // Some emitters pass bare strings (e.g. `system_instructions: ["Be helpful"]`)
            // instead of `{type: "text", content: ...}` objects. Treat those as implicit
            // text parts so the content isn't silently dropped.
            if let Some(text) = part.as_str() {
                if !text.is_empty() {
                    content_parts.push(ChatMessageContentPart::Text(ChatMessageText {
                        text: text.to_string(),
                    }));
                }
                continue;
            }
            let Some(part_obj) = part.as_object() else {
                continue;
            };
            let ty = part_obj
                .get("type")
                .and_then(|v| v.as_str())
                .unwrap_or("text");
            match ty {
                "text" => {
                    // Skip parts with missing/empty content instead of pushing empty
                    // text placeholders that clutter the rendered message.
                    if let Some(text) = part_obj.get("content").and_then(|v| v.as_str())
                        && !text.is_empty()
                    {
                        content_parts.push(ChatMessageContentPart::Text(ChatMessageText {
                            text: text.to_string(),
                        }));
                    }
                }
                "thinking" => {
                    // Thinking content gets surfaced as plain text so existing
                    // renderers display it; backends that want to distinguish
                    // thinking can still key on the span attribute.
                    if let Some(text) = part_obj.get("content").and_then(|v| v.as_str())
                        && !text.is_empty()
                    {
                        content_parts.push(ChatMessageContentPart::Text(ChatMessageText {
                            text: text.to_string(),
                        }));
                    }
                }
                "tool_call" => {
                    let name = part_obj
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let id = part_obj
                        .get("id")
                        .and_then(|v| v.as_str())
                        .map(String::from);
                    let arguments = part_obj.get("arguments").cloned();
                    content_parts.push(ChatMessageContentPart::ToolCall(ChatMessageToolCall {
                        name,
                        id,
                        arguments,
                    }));
                }
                "tool_call_response" => {
                    // Surface the actual tool output as the message content
                    // (usually this whole message has a single part).
                    if let Some(id) = part_obj.get("id").and_then(|v| v.as_str()) {
                        tool_call_id = Some(id.to_string());
                    }
                    if let Some(result) = part_obj.get("result") {
                        let text = match result {
                            Value::String(s) => s.clone(),
                            other => json_value_to_string(other),
                        };
                        content_parts.push(ChatMessageContentPart::Text(ChatMessageText { text }));
                    }
                }
                "uri" => {
                    let uri = part_obj
                        .get("uri")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let modality = part_obj.get("modality").and_then(|v| v.as_str());
                    if matches!(modality, Some("image") | None) && !uri.is_empty() {
                        content_parts.push(ChatMessageContentPart::ImageUrl(ChatMessageImageUrl {
                            url: uri,
                            detail: None,
                        }));
                    } else {
                        // Fall back to a text representation so the content is
                        // not lost for unsupported modalities.
                        content_parts
                            .push(ChatMessageContentPart::Text(ChatMessageText { text: uri }));
                    }
                }
                "blob" => {
                    let mime = part_obj
                        .get("mime_type")
                        .and_then(|v| v.as_str())
                        .unwrap_or("application/octet-stream");
                    let data = part_obj
                        .get("content")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    let modality = part_obj.get("modality").and_then(|v| v.as_str());
                    if matches!(modality, Some("image")) && !data.is_empty() {
                        content_parts.push(ChatMessageContentPart::ImageUrl(ChatMessageImageUrl {
                            url: format!("data:{mime};base64,{data}"),
                            detail: None,
                        }));
                    } else {
                        content_parts.push(ChatMessageContentPart::Text(ChatMessageText {
                            text: data.to_string(),
                        }));
                    }
                }
                _ => {
                    // Unknown part type — serialise to keep the payload visible.
                    content_parts.push(ChatMessageContentPart::Text(ChatMessageText {
                        text: json_value_to_string(part),
                    }));
                }
            }
        }
    }
    let content = if content_parts.is_empty() {
        ChatMessageContent::Text(String::new())
    } else if content_parts.len() == 1 {
        // Collapse trivial single-text to a plain string so the renderer uses
        // its simple-text path (matches what OpenAI input looks like).
        if let ChatMessageContentPart::Text(t) = &content_parts[0] {
            ChatMessageContent::Text(t.text.clone())
        } else {
            ChatMessageContent::ContentPartList(content_parts)
        }
    } else {
        ChatMessageContent::ContentPartList(content_parts)
    };
    Some(ChatMessage {
        role,
        content,
        tool_call_id,
    })
}

fn convert_genai_parts(parts: &[Value]) -> Option<Vec<ChatMessageContentPart>> {
    let fake_msg = json!({ "role": "system", "parts": parts });
    let msg = convert_one_genai_message(&fake_msg)?;
    match msg.content {
        ChatMessageContent::ContentPartList(p) => Some(p),
        ChatMessageContent::Text(t) => Some(vec![ChatMessageContentPart::Text(ChatMessageText {
            text: t,
        })]),
    }
}

fn convert_ai_sdk_tool_calls(attributes: &mut HashMap<String, Value>) {
    if let Some(aisdk_tools) = attributes.remove("ai.prompt.tools") {
        if let Value::Array(tools) = aisdk_tools {
            attributes.insert(
                "ai.prompt.tools".to_string(),
                serde_json::Value::Array(
                    tools
                        .into_iter()
                        .map(|tool| match &tool {
                            serde_json::Value::String(s) => {
                                serde_json::from_str::<HashMap<String, serde_json::Value>>(s)
                                    .map(|m| serde_json::to_value(m).unwrap())
                                    .unwrap_or(tool)
                            }
                            _ => tool,
                        })
                        .collect(),
                ),
            );
        }
    }
}

fn output_from_genai_attributes(
    attributes: &mut HashMap<String, Value>,
) -> Option<serde_json::Value> {
    let mut out_vec = Vec::new();
    let completion_message_count = attributes
        .keys()
        .filter_map(|k| {
            GEN_AI_COMPLETION_ATTRIBUTE_REGEX
                .captures(k)
                .and_then(|m| m.get(1).and_then(|s| s.as_str().parse::<usize>().ok()))
        })
        .max()
        .unwrap_or(0);

    for i in 0..=completion_message_count {
        if let Some(message_output) =
            output_message_from_genai_attributes(attributes, &format!("gen_ai.completion.{i}"))
        {
            out_vec.push(serde_json::to_value(message_output).unwrap());
        }
    }
    if out_vec.is_empty() {
        None
    } else {
        Some(serde_json::Value::Array(out_vec))
    }
}

fn output_message_from_genai_attributes(
    attributes: &mut HashMap<String, Value>,
    prefix: &str,
) -> Option<ChatMessage> {
    let msg_content = attributes
        .remove(&format!("{prefix}.content"))
        // Some instrumentations send reasoning as a separate field
        .or(attributes.remove(&format!("{prefix}.reasoning")));
    let msg_role = attributes
        .remove(&format!("{prefix}.role"))
        .map(|v| match v {
            Value::String(s) => s,
            _ => v.to_string(),
        })
        .unwrap_or("assistant".to_string());

    let tool_calls = parse_tool_calls(attributes, prefix);

    let content_parts = if let Some(Value::String(s)) = msg_content {
        if let Ok(content) = serde_json::from_str::<Vec<InstrumentationChatMessageContentPart>>(&s)
        {
            content
                .into_iter()
                .map(ChatMessageContentPart::from_instrumentation_content_part)
                .collect()
        } else {
            if s.is_empty() || s == "\"\"" {
                vec![]
            } else {
                vec![ChatMessageContentPart::Text(ChatMessageText { text: s })]
            }
        }
    } else {
        vec![]
    };
    let tool_call_parts = tool_calls
        .into_iter()
        .map(|tool_call| ChatMessageContentPart::ToolCall(tool_call))
        .collect::<Vec<_>>();

    if content_parts.is_empty() && tool_call_parts.is_empty() {
        None
    } else {
        Some(ChatMessage {
            role: msg_role,
            content: ChatMessageContent::ContentPartList(
                content_parts.into_iter().chain(tool_call_parts).collect(),
            ),
            tool_call_id: None,
        })
    }
}

fn parse_tool_calls(attributes: &HashMap<String, Value>, prefix: &str) -> Vec<ChatMessageToolCall> {
    let mut tool_calls = Vec::new();
    let mut i = 0;

    while let Some(serde_json::Value::String(tool_call_name)) = attributes
        .get(&format!("{prefix}.tool_calls.{i}.name"))
        .or(attributes.get(&format!("{prefix}.function_call.name")))
    {
        let is_litellm_tool_call = attributes
            .get(&format!("{prefix}.function_call.name"))
            .is_some()
            && attributes
                .get(&format!("{prefix}.tool_calls.{i}.name"))
                .is_none();
        let tool_call_id = attributes
            .get(&format!("{prefix}.tool_calls.{i}.id"))
            .or(attributes.get(&format!("{prefix}.function_call.id")))
            .and_then(|id| id.as_str())
            .map(String::from);
        let tool_call_arguments_raw = attributes
            .get(&format!("{prefix}.tool_calls.{i}.arguments"))
            .or(attributes.get(&format!("{prefix}.function_call.arguments")));
        let tool_call_arguments: Option<Value> = match tool_call_arguments_raw {
            Some(serde_json::Value::String(s)) => {
                let parsed = serde_json::from_str::<IndexMap<String, Value>>(s);
                if let Ok(parsed) = parsed {
                    serialize_indexmap(parsed)
                } else {
                    Some(serde_json::Value::String(s.clone()))
                }
            }
            _ => tool_call_arguments_raw.cloned(),
        };
        let tool_call = ChatMessageToolCall {
            name: tool_call_name.clone(),
            id: tool_call_id,
            arguments: tool_call_arguments,
        };
        tool_calls.push(tool_call);
        i += 1;
        if is_litellm_tool_call {
            // LiteLLM indexes tool calls by gen_ai.completion.N, i.e. parallel
            // tool calls are like two completion messages. We break to avoid
            // infinite loop.
            break;
        }
    }
    tool_calls
}

fn try_parse_ai_sdk_output(attributes: &mut HashMap<String, Value>) -> Option<serde_json::Value> {
    let mut content_parts = Vec::new();

    if let Some(serde_json::Value::String(s)) = attributes.remove("ai.response.text") {
        if !s.is_empty() {
            content_parts.push(ChatMessageContentPart::Text(ChatMessageText { text: s }));
        }
    }
    if let Some(serde_json::Value::String(s)) = attributes.remove("ai.response.object") {
        let content = serde_json::from_str::<serde_json::Value>(&s)
            .unwrap_or(serde_json::Value::String(s.clone()));
        content_parts.push(ChatMessageContentPart::Text(ChatMessageText {
            text: json_value_to_string(&content),
        }));
    }
    if let Some(serde_json::Value::String(s)) = attributes.remove("ai.response.toolCalls") {
        if let Ok(tool_call_values) =
            serde_json::from_str::<Vec<HashMap<String, serde_json::Value>>>(&s)
        {
            let tool_calls = parse_ai_sdk_tool_calls(tool_call_values)
                .iter()
                .map(|tool_call| ChatMessageContentPart::ToolCall(tool_call.clone()))
                .collect::<Vec<_>>();
            content_parts.extend(tool_calls);
        }
    }

    if content_parts.is_empty() {
        None
    } else {
        // form as a message array
        Some(serde_json::Value::Array(vec![
            serde_json::to_value(ChatMessage {
                role: "assistant".to_string(),
                content: ChatMessageContent::ContentPartList(content_parts),
                tool_call_id: None,
            })
            .unwrap(),
        ]))
    }
}

fn parse_ai_sdk_tool_calls(
    tool_calls: Vec<HashMap<String, serde_json::Value>>,
) -> Vec<ChatMessageToolCall> {
    tool_calls
        .iter()
        .filter_map(|tool_call| {
            tool_call.get("toolName").map(|tool_name| {
                let args_value = tool_call
                    .get("args")
                    .or(tool_call.get("input"))
                    .cloned()
                    .unwrap_or_default();
                let args = if let serde_json::Value::String(s) = &args_value {
                    serde_json::from_str::<IndexMap<String, serde_json::Value>>(s).ok()
                } else {
                    serde_json::from_value::<IndexMap<String, serde_json::Value>>(args_value).ok()
                };
                ChatMessageToolCall {
                    name: json_value_to_string(tool_name),
                    id: tool_call.get("toolCallId").map(json_value_to_string),
                    arguments: args.and_then(serialize_indexmap),
                }
            })
        })
        .collect::<Vec<_>>()
}

fn rename_last_span_in_path(attributes: &mut HashMap<String, Value>, from: &str, to: &str) {
    if let Some(path_value) = attributes.get_mut(SPAN_PATH) {
        if let Some(path_array) = path_value.as_array_mut() {
            if let Some(last) = path_array.last_mut() {
                if last.as_str() == Some(from) {
                    *last = serde_json::Value::String(to.to_string());
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_parse_and_enrich_attributes_openai() {
        // Create a span with OpenAI-style attributes with conversation history and tool calls
        let attributes = HashMap::from([
            ("gen_ai.system".to_string(), json!("OpenAI")),
            ("gen_ai.request.model".to_string(), json!("gpt-4.1-nano")),
            (
                "gen_ai.response.model".to_string(),
                json!("gpt-4.1-nano-2025-04-14"),
            ),
            // First message - user question
            ("gen_ai.prompt.0.role".to_string(), json!("user")),
            (
                "gen_ai.prompt.0.content".to_string(),
                json!("What is the weather and current time in San Francisco?"),
            ),
            // Second message - assistant with tool call
            ("gen_ai.prompt.1.role".to_string(), json!("assistant")),
            (
                "gen_ai.prompt.1.tool_calls.0.id".to_string(),
                json!("call_1"),
            ),
            (
                "gen_ai.prompt.1.tool_calls.0.name".to_string(),
                json!("get_weather"),
            ),
            (
                "gen_ai.prompt.1.tool_calls.0.arguments".to_string(),
                json!("{\"location\": \"San Francisco, CA\"}"),
            ),
            // Third message - tool response
            ("gen_ai.prompt.2.role".to_string(), json!("tool")),
            (
                "gen_ai.prompt.2.content".to_string(),
                json!("Sunny and 65 degrees Fahrenheit"),
            ),
            ("gen_ai.prompt.2.tool_call_id".to_string(), json!("call_1")),
            // Completion - assistant with another tool call
            ("gen_ai.completion.0.role".to_string(), json!("assistant")),
            (
                "gen_ai.completion.0.finish_reason".to_string(),
                json!("tool_calls"),
            ),
            (
                "gen_ai.completion.0.tool_calls.0.id".to_string(),
                json!("call_vqQRzJX8Csv19WyJucQnOUJH"),
            ),
            (
                "gen_ai.completion.0.tool_calls.0.name".to_string(),
                json!("get_time"),
            ),
            (
                "gen_ai.completion.0.tool_calls.0.arguments".to_string(),
                json!("{\"location\":\"San Francisco, CA\"}"),
            ),
            // Token usage
            ("gen_ai.usage.prompt_tokens".to_string(), json!(173)),
            ("gen_ai.usage.completion_tokens".to_string(), json!(17)),
        ]);

        let mut span = Span {
            span_id: Uuid::new_v4(),
            project_id: Uuid::new_v4(),
            trace_id: Uuid::new_v4(),
            parent_span_id: None,
            name: "openai.chat".to_string(),
            attributes: SpanAttributes::new(attributes),
            start_time: Utc::now(),
            end_time: Utc::now(),
            span_type: SpanType::LLM,
            input: None,
            output: None,
            events: vec![],
            status: None,
            tags: None,
            input_url: None,
            output_url: None,
            size_bytes: 0,
        };

        // Verify initial state
        assert!(span.input.is_none());
        assert!(span.output.is_none());
        assert!(
            span.attributes
                .raw_attributes
                .get("gen_ai.prompt.0.content")
                .is_some()
        );
        assert!(
            span.attributes
                .raw_attributes
                .get("gen_ai.prompt.1.tool_calls.0.name")
                .is_some()
        );
        assert!(
            span.attributes
                .raw_attributes
                .get("gen_ai.completion.0.tool_calls.0.name")
                .is_some()
        );

        // Apply transformations
        span.parse_and_enrich_attributes();

        // Verify input is correctly parsed - should have 3 messages
        assert!(span.input.is_some());
        let input = span.input.as_ref().unwrap();
        let input_messages: Vec<ChatMessage> = serde_json::from_value(input.clone()).unwrap();
        assert_eq!(input_messages.len(), 3);

        // First message: user question
        assert_eq!(input_messages[0].role, "user");
        match &input_messages[0].content {
            ChatMessageContent::Text(text) => {
                assert_eq!(
                    text,
                    "What is the weather and current time in San Francisco?"
                );
            }
            _ => panic!("Expected text content for user message"),
        }

        // Second message: assistant with tool call
        assert_eq!(input_messages[1].role, "assistant");
        match &input_messages[1].content {
            ChatMessageContent::ContentPartList(parts) => {
                assert_eq!(parts.len(), 1);
                match &parts[0] {
                    ChatMessageContentPart::ToolCall(tool_call) => {
                        assert_eq!(tool_call.name, "get_weather");
                        assert_eq!(tool_call.id, Some("call_1".to_string()));
                        assert!(tool_call.arguments.is_some());
                        let args = tool_call.arguments.as_ref().unwrap();
                        assert_eq!(args.get("location").unwrap(), &json!("San Francisco, CA"));
                    }
                    _ => panic!("Expected tool call"),
                }
            }
            _ => panic!("Expected content part list for assistant message"),
        }

        // Third message: tool response
        assert_eq!(input_messages[2].role, "tool");
        assert_eq!(input_messages[2].tool_call_id, Some("call_1".to_string()));
        match &input_messages[2].content {
            ChatMessageContent::Text(text) => {
                assert_eq!(text, "Sunny and 65 degrees Fahrenheit");
            }
            _ => panic!("Expected text content for tool message"),
        }

        // Verify output is correctly parsed - should have 1 message
        assert!(span.output.is_some());
        let output = span.output.as_ref().unwrap();
        let output_messages: Vec<ChatMessage> = serde_json::from_value(output.clone()).unwrap();
        assert_eq!(output_messages.len(), 1);

        // Output message: assistant with tool call
        assert_eq!(output_messages[0].role, "assistant");
        match &output_messages[0].content {
            ChatMessageContent::ContentPartList(parts) => {
                assert_eq!(parts.len(), 1);
                match &parts[0] {
                    ChatMessageContentPart::ToolCall(tool_call) => {
                        assert_eq!(tool_call.name, "get_time");
                        assert_eq!(
                            tool_call.id,
                            Some("call_vqQRzJX8Csv19WyJucQnOUJH".to_string())
                        );
                        assert!(tool_call.arguments.is_some());
                        let args = tool_call.arguments.as_ref().unwrap();
                        assert_eq!(args.get("location").unwrap(), &json!("San Francisco, CA"));
                    }
                    _ => panic!("Expected tool call"),
                }
            }
            _ => panic!("Expected content part list for assistant output"),
        }

        // Verify that tool call attributes are preserved
        assert_eq!(
            span.attributes
                .raw_attributes
                .get("gen_ai.prompt.1.tool_calls.0.name"),
            Some(&json!("get_weather"))
        );
        assert_eq!(
            span.attributes
                .raw_attributes
                .get("gen_ai.prompt.1.tool_calls.0.id"),
            Some(&json!("call_1"))
        );
        assert_eq!(
            span.attributes
                .raw_attributes
                .get("gen_ai.prompt.1.tool_calls.0.arguments"),
            Some(&json!("{\"location\": \"San Francisco, CA\"}"))
        );
        assert_eq!(
            span.attributes
                .raw_attributes
                .get("gen_ai.completion.0.tool_calls.0.name"),
            Some(&json!("get_time"))
        );
        assert_eq!(
            span.attributes
                .raw_attributes
                .get("gen_ai.completion.0.tool_calls.0.id"),
            Some(&json!("call_vqQRzJX8Csv19WyJucQnOUJH"))
        );
        assert_eq!(
            span.attributes
                .raw_attributes
                .get("gen_ai.completion.0.tool_calls.0.arguments"),
            Some(&json!("{\"location\":\"San Francisco, CA\"}"))
        );

        // Verify that other attributes are preserved
        assert_eq!(
            span.attributes.raw_attributes.get("gen_ai.system"),
            Some(&json!("OpenAI"))
        );
        assert_eq!(
            span.attributes.raw_attributes.get("gen_ai.request.model"),
            Some(&json!("gpt-4.1-nano"))
        );
        assert_eq!(
            span.attributes.raw_attributes.get("gen_ai.response.model"),
            Some(&json!("gpt-4.1-nano-2025-04-14"))
        );
        assert_eq!(
            span.attributes
                .raw_attributes
                .get("gen_ai.completion.0.finish_reason"),
            Some(&json!("tool_calls"))
        );
        assert_eq!(
            span.attributes
                .raw_attributes
                .get("gen_ai.usage.prompt_tokens"),
            Some(&json!(173))
        );
        assert_eq!(
            span.attributes
                .raw_attributes
                .get("gen_ai.usage.completion_tokens"),
            Some(&json!(17))
        );
    }

    #[test]
    fn test_parse_and_enrich_attributes_langchain() {
        // Create a span with LangChain-style attributes with conversation history and tool calls
        // This is based on real span data from the logs
        let attributes = HashMap::from([
            (
                "lmnr.span.path".to_string(),
                json!([
                    "integration/0150_langchain_tool_calls_with_history",
                    "ChatOpenAI.chat"
                ]),
            ),
            (
                "lmnr.span.ids_path".to_string(),
                json!([
                    "00000000-0000-0000-f961-aebceb94f98a",
                    "00000000-0000-0000-46eb-a5ee110c65db"
                ]),
            ),
            (
                "lmnr.span.instrumentation_source".to_string(),
                json!("python"),
            ),
            ("lmnr.span.sdk_version".to_string(), json!("0.6.16")),
            (
                "lmnr.span.language_version".to_string(),
                json!("python@3.13"),
            ),
            (
                "lmnr.association.properties.ls_provider".to_string(),
                json!("openai"),
            ),
            (
                "lmnr.association.properties.ls_model_name".to_string(),
                json!("gpt-4.1-nano"),
            ),
            (
                "lmnr.association.properties.ls_model_type".to_string(),
                json!("chat"),
            ),
            ("gen_ai.system".to_string(), json!("Langchain")),
            ("llm.request.type".to_string(), json!("chat")),
            ("gen_ai.request.model".to_string(), json!("gpt-4.1-nano")),
            (
                "llm.request.functions.0.name".to_string(),
                json!("get_weather"),
            ),
            (
                "llm.request.functions.0.parameters".to_string(),
                json!(
                    "{\"properties\": {\"location\": {\"type\": \"string\"}}, \"required\": [\"location\"], \"type\": \"object\"}"
                ),
            ),
            (
                "llm.request.functions.1.name".to_string(),
                json!("get_time"),
            ),
            (
                "llm.request.functions.1.parameters".to_string(),
                json!(
                    "{\"properties\": {\"location\": {\"type\": \"string\"}}, \"required\": [\"location\"], \"type\": \"object\"}"
                ),
            ),
            (
                "llm.request.functions.2.name".to_string(),
                json!("get_city_population"),
            ),
            (
                "llm.request.functions.2.parameters".to_string(),
                json!(
                    "{\"properties\": {\"location\": {\"type\": \"string\"}}, \"required\": [\"location\"], \"type\": \"object\"}"
                ),
            ),
            // First message - user question
            ("gen_ai.prompt.0.role".to_string(), json!("user")),
            (
                "gen_ai.prompt.0.content".to_string(),
                json!("What is the weather and current time in San Francisco?"),
            ),
            // Second message - assistant with tool call
            ("gen_ai.prompt.1.role".to_string(), json!("assistant")),
            (
                "gen_ai.prompt.1.tool_calls.0.id".to_string(),
                json!("call_1"),
            ),
            (
                "gen_ai.prompt.1.tool_calls.0.name".to_string(),
                json!("get_weather"),
            ),
            (
                "gen_ai.prompt.1.tool_calls.0.arguments".to_string(),
                json!("{\"location\": \"San Francisco, CA\"}"),
            ),
            // Third message - tool response
            ("gen_ai.prompt.2.role".to_string(), json!("tool")),
            (
                "gen_ai.prompt.2.content".to_string(),
                json!("Sunny and 65 degrees Fahrenheit"),
            ),
            ("gen_ai.prompt.2.tool_call_id".to_string(), json!("call_1")),
            // Response metadata
            (
                "gen_ai.response.model".to_string(),
                json!("gpt-4.1-nano-2025-04-14"),
            ),
            (
                "gen_ai.response.id".to_string(),
                json!("chatcmpl-BpaSv7Z7XDi3F3egHJXBxKPJIVxqg"),
            ),
            // Completion - assistant with another tool call
            ("gen_ai.completion.0.content".to_string(), json!("")),
            (
                "gen_ai.completion.0.finish_reason".to_string(),
                json!("tool_calls"),
            ),
            ("gen_ai.completion.0.role".to_string(), json!("assistant")),
            (
                "gen_ai.completion.0.tool_calls.0.id".to_string(),
                json!("call_TCZXJQAoVZoeGRcTwN6I7rh1"),
            ),
            (
                "gen_ai.completion.0.tool_calls.0.name".to_string(),
                json!("get_time"),
            ),
            (
                "gen_ai.completion.0.tool_calls.0.arguments".to_string(),
                json!("{\"location\": \"San Francisco, CA\"}"),
            ),
            // Token usage
            ("gen_ai.usage.prompt_tokens".to_string(), json!(108)),
            ("gen_ai.usage.completion_tokens".to_string(), json!(17)),
            ("llm.usage.total_tokens".to_string(), json!(125)),
            ("gen_ai.usage.cache_read_input_tokens".to_string(), json!(0)),
        ]);

        let mut span = Span {
            span_id: Uuid::new_v4(),
            project_id: Uuid::new_v4(),
            trace_id: Uuid::new_v4(),
            parent_span_id: Some(Uuid::new_v4()),
            name: "ChatOpenAI.chat".to_string(),
            attributes: SpanAttributes::new(attributes),
            start_time: Utc::now(),
            end_time: Utc::now(),
            span_type: SpanType::LLM,
            input: None,
            output: None,
            events: vec![],
            status: None,
            tags: None,
            input_url: None,
            output_url: None,
            size_bytes: 0,
        };

        // Verify initial state
        assert!(span.input.is_none());
        assert!(span.output.is_none());
        assert!(
            span.attributes
                .raw_attributes
                .get("gen_ai.prompt.0.content")
                .is_some()
        );
        assert!(
            span.attributes
                .raw_attributes
                .get("gen_ai.prompt.1.tool_calls.0.name")
                .is_some()
        );
        assert!(
            span.attributes
                .raw_attributes
                .get("gen_ai.completion.0.tool_calls.0.name")
                .is_some()
        );

        // Apply transformations
        span.parse_and_enrich_attributes();

        // Verify input is correctly parsed - should have 3 messages
        assert!(span.input.is_some());
        let input = span.input.as_ref().unwrap();
        let input_messages: Vec<ChatMessage> = serde_json::from_value(input.clone()).unwrap();
        assert_eq!(input_messages.len(), 3);

        // First message: user question
        assert_eq!(input_messages[0].role, "user");
        match &input_messages[0].content {
            ChatMessageContent::Text(text) => {
                assert_eq!(
                    text,
                    "What is the weather and current time in San Francisco?"
                );
            }
            _ => panic!("Expected text content for user message"),
        }

        // Second message: assistant with tool call
        assert_eq!(input_messages[1].role, "assistant");
        match &input_messages[1].content {
            ChatMessageContent::ContentPartList(parts) => {
                assert_eq!(parts.len(), 1);
                match &parts[0] {
                    ChatMessageContentPart::ToolCall(tool_call) => {
                        assert_eq!(tool_call.name, "get_weather");
                        assert_eq!(tool_call.id, Some("call_1".to_string()));
                        assert!(tool_call.arguments.is_some());
                        let args = tool_call.arguments.as_ref().unwrap();
                        assert_eq!(args.get("location").unwrap(), &json!("San Francisco, CA"));
                    }
                    _ => panic!("Expected tool call"),
                }
            }
            _ => panic!("Expected content part list for assistant message"),
        }

        // Third message: tool response
        assert_eq!(input_messages[2].role, "tool");
        assert_eq!(input_messages[2].tool_call_id, Some("call_1".to_string()));
        match &input_messages[2].content {
            ChatMessageContent::Text(text) => {
                assert_eq!(text, "Sunny and 65 degrees Fahrenheit");
            }
            _ => panic!("Expected text content for tool message"),
        }

        // Verify output is correctly parsed - should have 1 message
        assert!(span.output.is_some());
        let output = span.output.as_ref().unwrap();
        let output_messages: Vec<ChatMessage> = serde_json::from_value(output.clone()).unwrap();
        assert_eq!(output_messages.len(), 1);

        // Output message: assistant with tool call
        assert_eq!(output_messages[0].role, "assistant");
        match &output_messages[0].content {
            ChatMessageContent::ContentPartList(parts) => {
                assert_eq!(parts.len(), 1);
                match &parts[0] {
                    ChatMessageContentPart::ToolCall(tool_call) => {
                        assert_eq!(tool_call.name, "get_time");
                        assert_eq!(
                            tool_call.id,
                            Some("call_TCZXJQAoVZoeGRcTwN6I7rh1".to_string())
                        );
                        assert!(tool_call.arguments.is_some());
                        let args = tool_call.arguments.as_ref().unwrap();
                        assert_eq!(args.get("location").unwrap(), &json!("San Francisco, CA"));
                    }
                    _ => panic!("Expected tool call"),
                }
            }
            _ => panic!("Expected content part list for assistant output"),
        }

        // Verify that tool call attributes are preserved
        assert_eq!(
            span.attributes
                .raw_attributes
                .get("gen_ai.prompt.1.tool_calls.0.name"),
            Some(&json!("get_weather"))
        );
        assert_eq!(
            span.attributes
                .raw_attributes
                .get("gen_ai.prompt.1.tool_calls.0.id"),
            Some(&json!("call_1"))
        );
        assert_eq!(
            span.attributes
                .raw_attributes
                .get("gen_ai.prompt.1.tool_calls.0.arguments"),
            Some(&json!("{\"location\": \"San Francisco, CA\"}"))
        );
        assert_eq!(
            span.attributes
                .raw_attributes
                .get("gen_ai.completion.0.tool_calls.0.name"),
            Some(&json!("get_time"))
        );
        assert_eq!(
            span.attributes
                .raw_attributes
                .get("gen_ai.completion.0.tool_calls.0.id"),
            Some(&json!("call_TCZXJQAoVZoeGRcTwN6I7rh1"))
        );
        assert_eq!(
            span.attributes
                .raw_attributes
                .get("gen_ai.completion.0.tool_calls.0.arguments"),
            Some(&json!("{\"location\": \"San Francisco, CA\"}"))
        );

        // Verify that LangChain-specific attributes are preserved
        assert_eq!(
            span.attributes.raw_attributes.get("gen_ai.system"),
            Some(&json!("Langchain"))
        );
        assert_eq!(
            span.attributes.raw_attributes.get("gen_ai.request.model"),
            Some(&json!("gpt-4.1-nano"))
        );
        assert_eq!(
            span.attributes.raw_attributes.get("gen_ai.response.model"),
            Some(&json!("gpt-4.1-nano-2025-04-14"))
        );
        assert_eq!(
            span.attributes.raw_attributes.get("gen_ai.response.id"),
            Some(&json!("chatcmpl-BpaSv7Z7XDi3F3egHJXBxKPJIVxqg"))
        );
        assert_eq!(
            span.attributes
                .raw_attributes
                .get("gen_ai.completion.0.finish_reason"),
            Some(&json!("tool_calls"))
        );
        assert_eq!(
            span.attributes
                .raw_attributes
                .get("gen_ai.usage.prompt_tokens"),
            Some(&json!(108))
        );
        assert_eq!(
            span.attributes
                .raw_attributes
                .get("gen_ai.usage.completion_tokens"),
            Some(&json!(17))
        );
        assert_eq!(
            span.attributes.raw_attributes.get("llm.usage.total_tokens"),
            Some(&json!(125))
        );
        assert_eq!(
            span.attributes
                .raw_attributes
                .get("gen_ai.usage.cache_read_input_tokens"),
            Some(&json!(0))
        );

        // Verify LangChain-specific attributes are preserved
        assert_eq!(
            span.attributes
                .raw_attributes
                .get("lmnr.association.properties.ls_provider"),
            Some(&json!("openai"))
        );
        assert_eq!(
            span.attributes
                .raw_attributes
                .get("lmnr.association.properties.ls_model_name"),
            Some(&json!("gpt-4.1-nano"))
        );
        assert_eq!(
            span.attributes
                .raw_attributes
                .get("lmnr.association.properties.ls_model_type"),
            Some(&json!("chat"))
        );
        assert_eq!(
            span.attributes.raw_attributes.get("llm.request.type"),
            Some(&json!("chat"))
        );

        // Verify function metadata is preserved
        assert_eq!(
            span.attributes
                .raw_attributes
                .get("llm.request.functions.0.name"),
            Some(&json!("get_weather"))
        );
        assert_eq!(
            span.attributes
                .raw_attributes
                .get("llm.request.functions.1.name"),
            Some(&json!("get_time"))
        );
        assert_eq!(
            span.attributes
                .raw_attributes
                .get("llm.request.functions.2.name"),
            Some(&json!("get_city_population"))
        );

        // Verify path and ids_path are preserved
        assert_eq!(
            span.attributes.raw_attributes.get("lmnr.span.path"),
            Some(&json!([
                "integration/0150_langchain_tool_calls_with_history",
                "ChatOpenAI.chat"
            ]))
        );
        assert_eq!(
            span.attributes.raw_attributes.get("lmnr.span.ids_path"),
            Some(&json!([
                "00000000-0000-0000-f961-aebceb94f98a",
                "00000000-0000-0000-46eb-a5ee110c65db"
            ]))
        );
        assert_eq!(
            span.attributes
                .raw_attributes
                .get("lmnr.span.instrumentation_source"),
            Some(&json!("python"))
        );
        assert_eq!(
            span.attributes.raw_attributes.get("lmnr.span.sdk_version"),
            Some(&json!("0.6.16"))
        );
        assert_eq!(
            span.attributes
                .raw_attributes
                .get("lmnr.span.language_version"),
            Some(&json!("python@3.13"))
        );
    }

    #[test]
    fn test_parse_and_enrich_attributes_ai_sdk() {
        // AI SDK creates two spans: parent (ai.generateText) and child (ai.generateText.doGenerate)
        // This test verifies both spans and their parent-child relationship

        let parent_span_id = Uuid::new_v4();
        let child_span_id = Uuid::new_v4();
        let trace_id = Uuid::new_v4();

        // Create parent span (ai.generateText) - has DEFAULT span type
        let parent_attributes = HashMap::from([
            ("operation.name".to_string(), json!("ai.generateText")),
            ("ai.operationId".to_string(), json!("ai.generateText")),
            ("ai.model.provider".to_string(), json!("openai.chat")),
            ("ai.model.id".to_string(), json!("gpt-4.1-nano")),
            ("ai.settings.maxRetries".to_string(), json!(2)),
            (
                "ai.prompt".to_string(),
                Value::String(
                    json!({
                        "system": "You are a helpful assistant.",
                        "messages": [
                            {
                                "role": "user",
                                "content": [{"type": "text", "text": "What is the weather in SF?"}]
                            }
                        ]
                    })
                    .to_string(),
                ),
            ),
            ("ai.settings.maxSteps".to_string(), json!(1)),
            (
                "lmnr.span.ids_path".to_string(),
                json!([parent_span_id.to_string()]),
            ),
            ("lmnr.span.path".to_string(), json!(["ai.generateText"])),
            (
                "lmnr.span.instrumentation_source".to_string(),
                json!("javascript"),
            ),
            ("lmnr.span.sdk_version".to_string(), json!("0.6.13")),
            (
                "lmnr.span.language_version".to_string(),
                json!("node@23.3.0"),
            ),
            ("ai.response.finishReason".to_string(), json!("tool-calls")),
            (
                "ai.response.toolCalls".to_string(),
                Value::String(
                    json!([
                        {
                            "toolCallType": "function",
                            "toolCallId": "call_akUJWoAUcWDcvNJzcZx3MzPg",
                            "toolName": "get_weather",
                            "args": "{\"location\":\"San Francisco, CA\"}"
                        }
                    ])
                    .to_string(),
                ),
            ),
            ("ai.usage.promptTokens".to_string(), json!(108)),
            ("ai.usage.completionTokens".to_string(), json!(17)),
        ]);

        let mut parent_span = Span {
            span_id: parent_span_id,
            project_id: Uuid::new_v4(),
            trace_id,
            parent_span_id: None,
            name: "ai.generateText".to_string(),
            attributes: SpanAttributes::new(parent_attributes),
            start_time: Utc::now(),
            end_time: Utc::now(),
            span_type: SpanType::Default,
            input: None,
            output: None,
            events: vec![],
            status: None,
            tags: None,
            input_url: None,
            output_url: None,
            size_bytes: 0,
        };

        // Create child span (ai.generateText.doGenerate) - has LLM span type
        let child_attributes = HashMap::from([
            (
                "operation.name".to_string(),
                json!("ai.generateText.doGenerate"),
            ),
            (
                "ai.operationId".to_string(),
                json!("ai.generateText.doGenerate"),
            ),
            ("ai.model.provider".to_string(), json!("openai.chat")),
            ("ai.model.id".to_string(), json!("gpt-4.1-nano")),
            ("ai.settings.maxRetries".to_string(), json!(2)),
            ("ai.prompt.format".to_string(), json!("messages")),
            (
                "ai.prompt.messages".to_string(),
                Value::String(
                    json!([
                        {"role":"system","content":"You are a helpful assistant."},
                        {"role":"user","content":[{"type":"text","text":"What is the weather in SF?"}]}
                    ])
                    .to_string(),
                ),
            ),
            (
                "ai.prompt.tools".to_string(),
                json!([
                    Value::String(
                        json!({
                            "type":"function",
                            "name":"get_weather",
                            "description":"Get the weather in a given location",
                            "parameters":{
                                "type":"object",
                                "properties":{"location":{"type":"string","description":"The city and state, e.g. San Francisco, CA"}},
                                "required":["location"],
                                "additionalProperties":false,
                                "$schema":"http://json-schema.org/draft-07/schema#"
                            }
                        })
                        .to_string()
                    ),
                    Value::String(
                        json!({
                            "type":"function",
                            "name":"get_time",
                            "description":"Get the time in a given location",
                            "parameters":{
                                "type":"object",
                                "properties":{"location":{"type":"string","description":"The city and state, e.g. San Francisco, CA"}},
                                "required":["location"],
                                "additionalProperties":false,
                                "$schema":"http://json-schema.org/draft-07/schema#"
                            }
                        })
                            .to_string(),
                        ),
                    ])
            ),
            (
                "ai.prompt.toolChoice".to_string(),
                json!("{\"type\":\"auto\"}"),
            ),
            ("gen_ai.system".to_string(), json!("openai.chat")),
            ("gen_ai.request.model".to_string(), json!("gpt-4.1-nano")),
            (
                "lmnr.span.ids_path".to_string(),
                json!([parent_span_id.to_string(), child_span_id.to_string()]),
            ),
            (
                "lmnr.span.path".to_string(),
                json!(["ai.generateText", "ai.generateText.doGenerate"]),
            ),
            (
                "lmnr.span.instrumentation_source".to_string(),
                json!("javascript"),
            ),
            ("lmnr.span.sdk_version".to_string(), json!("0.6.13")),
            (
                "lmnr.span.language_version".to_string(),
                json!("node@23.3.0"),
            ),
            ("ai.response.finishReason".to_string(), json!("tool-calls")),
            (
                "ai.response.toolCalls".to_string(),
                Value::String(
                    json!([
                        {
                            "toolCallType":"function",
                            "toolCallId":"call_akUJWoAUcWDcvNJzcZx3MzPg",
                            "toolName":"get_weather",
                            "args":"{\"location\":\"San Francisco, CA\"}"
                        }
                    ])
                    .to_string(),
                ),
            ),
            (
                "ai.response.id".to_string(),
                json!("chatcmpl-BpafAvtYoJBBUQpui72D8vHSt8CDp"),
            ),
            (
                "ai.response.model".to_string(),
                json!("gpt-4.1-nano-2025-04-14"),
            ),
            (
                "ai.response.timestamp".to_string(),
                json!("2025-07-04T13:22:40.000Z"),
            ),
            ("ai.usage.promptTokens".to_string(), json!(108)),
            ("ai.usage.completionTokens".to_string(), json!(17)),
            (
                "gen_ai.response.finish_reasons".to_string(),
                json!(["tool-calls"]),
            ),
            (
                "gen_ai.response.id".to_string(),
                json!("chatcmpl-BpafAvtYoJBBUQpui72D8vHSt8CDp"),
            ),
            (
                "gen_ai.response.model".to_string(),
                json!("gpt-4.1-nano-2025-04-14"),
            ),
            ("gen_ai.usage.input_tokens".to_string(), json!(108)),
            ("gen_ai.usage.output_tokens".to_string(), json!(17)),
        ]);

        let mut child_span = Span {
            span_id: child_span_id,
            project_id: Uuid::new_v4(),
            trace_id,
            parent_span_id: Some(parent_span_id),
            name: "ai.generateText.doGenerate".to_string(),
            attributes: SpanAttributes::new(child_attributes),
            start_time: Utc::now(),
            end_time: Utc::now(),
            span_type: SpanType::LLM,
            input: None,
            output: None,
            events: vec![],
            status: None,
            tags: None,
            input_url: None,
            output_url: None,
            size_bytes: 0,
        };

        // Verify initial span relationships and structure
        assert_eq!(parent_span.parent_span_id, None);
        assert_eq!(child_span.parent_span_id, Some(parent_span_id));
        assert_eq!(parent_span.trace_id, child_span.trace_id);
        assert_eq!(parent_span.span_type, SpanType::Default);
        assert_eq!(child_span.span_type, SpanType::LLM);

        // Verify initial path and ids_path
        assert_eq!(
            parent_span.attributes.raw_attributes.get("lmnr.span.path"),
            Some(&json!(["ai.generateText"]))
        );
        assert_eq!(
            parent_span
                .attributes
                .raw_attributes
                .get("lmnr.span.ids_path"),
            Some(&json!([parent_span_id.to_string()]))
        );
        assert_eq!(
            child_span.attributes.raw_attributes.get("lmnr.span.path"),
            Some(&json!(["ai.generateText", "ai.generateText.doGenerate"]))
        );
        assert_eq!(
            child_span
                .attributes
                .raw_attributes
                .get("lmnr.span.ids_path"),
            Some(&json!([
                parent_span_id.to_string(),
                child_span_id.to_string()
            ]))
        );

        // Verify initial state - no input/output yet
        assert!(parent_span.input.is_none());
        assert!(parent_span.output.is_none());
        assert!(child_span.input.is_none());
        assert!(child_span.output.is_none());

        // Apply transformations to both spans
        parent_span.parse_and_enrich_attributes();
        child_span.parse_and_enrich_attributes();

        // Verify parent span parsing (ai.generateText)
        assert!(parent_span.input.is_some());
        assert!(parent_span.output.is_some());

        let parent_input = parent_span.input.as_ref().unwrap();
        let parent_input_messages: Vec<ChatMessage> =
            serde_json::from_value(parent_input.clone()).unwrap();
        assert_eq!(parent_input_messages.len(), 2);

        // First message: system
        assert_eq!(parent_input_messages[0].role, "system");
        match &parent_input_messages[0].content {
            ChatMessageContent::Text(text) => {
                assert_eq!(text, "You are a helpful assistant.");
            }
            _ => panic!("Expected text content for system message"),
        }

        // Second message: user
        assert_eq!(parent_input_messages[1].role, "user");
        match &parent_input_messages[1].content {
            ChatMessageContent::ContentPartList(parts) => {
                assert_eq!(parts.len(), 1);
                match &parts[0] {
                    ChatMessageContentPart::Text(text) => {
                        assert_eq!(text.text, "What is the weather in SF?");
                    }
                    _ => panic!("Expected text content part"),
                }
            }
            _ => panic!("Expected content part list for user message"),
        }

        // Verify parent span output (tool call)
        let parent_output = parent_span.output.as_ref().unwrap();
        let parent_output_messages: Vec<ChatMessage> =
            serde_json::from_value(parent_output.clone()).unwrap();
        assert_eq!(parent_output_messages.len(), 1);

        assert_eq!(parent_output_messages[0].role, "assistant");
        match &parent_output_messages[0].content {
            ChatMessageContent::ContentPartList(parts) => {
                assert_eq!(parts.len(), 1);
                match &parts[0] {
                    ChatMessageContentPart::ToolCall(tool_call) => {
                        assert_eq!(tool_call.name, "get_weather");
                        assert_eq!(
                            tool_call.id,
                            Some("call_akUJWoAUcWDcvNJzcZx3MzPg".to_string())
                        );
                        assert!(tool_call.arguments.is_some());
                        let args = tool_call.arguments.as_ref().unwrap();
                        assert_eq!(args.get("location").unwrap(), &json!("San Francisco, CA"));
                    }
                    _ => panic!("Expected tool call"),
                }
            }
            _ => panic!("Expected content part list for parent output"),
        }

        // Verify child span parsing (ai.generateText.doGenerate)
        assert!(child_span.input.is_some());
        assert!(child_span.output.is_some());

        let child_input = child_span.input.as_ref().unwrap();
        let child_input_messages: Vec<ChatMessage> =
            serde_json::from_value(child_input.clone()).unwrap();
        assert_eq!(child_input_messages.len(), 2);

        // Child input should match parent input
        assert_eq!(child_input_messages[0].role, "system");
        assert_eq!(child_input_messages[1].role, "user");

        // Verify child span output (tool call)
        let child_output = child_span.output.as_ref().unwrap();
        let child_output_messages: Vec<ChatMessage> =
            serde_json::from_value(child_output.clone()).unwrap();
        assert_eq!(child_output_messages.len(), 1);

        assert_eq!(child_output_messages[0].role, "assistant");
        match &child_output_messages[0].content {
            ChatMessageContent::ContentPartList(parts) => {
                assert_eq!(parts.len(), 1);
                match &parts[0] {
                    ChatMessageContentPart::ToolCall(tool_call) => {
                        assert_eq!(tool_call.name, "get_weather");
                        assert_eq!(
                            tool_call.id,
                            Some("call_akUJWoAUcWDcvNJzcZx3MzPg".to_string())
                        );
                        assert!(tool_call.arguments.is_some());
                        let args = tool_call.arguments.as_ref().unwrap();
                        assert_eq!(args.get("location").unwrap(), &json!("San Francisco, CA"));
                    }
                    _ => panic!("Expected tool call"),
                }
            }
            _ => panic!("Expected content part list for child output"),
        }

        // Verify that AI SDK tool definitions are CONVERTED from strings to objects
        assert!(
            child_span
                .attributes
                .raw_attributes
                .contains_key("ai.prompt.tools")
        );
        let tools = child_span
            .attributes
            .raw_attributes
            .get("ai.prompt.tools")
            .unwrap();
        if let serde_json::Value::Array(tools_array) = tools {
            assert_eq!(tools_array.len(), 2);
            // First tool should be parsed as object, not string
            assert!(tools_array[0].is_object());
            assert_eq!(tools_array[0].get("name").unwrap(), &json!("get_weather"));
            assert_eq!(tools_array[0].get("type").unwrap(), &json!("function"));
            assert!(tools_array[1].is_object());
            assert_eq!(tools_array[1].get("name").unwrap(), &json!("get_time"));
            assert_eq!(tools_array[1].get("type").unwrap(), &json!("function"));
        } else {
            panic!("Expected tools to be an array");
        }

        // Note: AI SDK tool conversion from strings to objects happens in prepare_span_db_values, not here

        // Verify that important attributes are preserved
        assert_eq!(
            parent_span.attributes.raw_attributes.get("operation.name"),
            Some(&json!("ai.generateText"))
        );
        assert_eq!(
            child_span.attributes.raw_attributes.get("operation.name"),
            Some(&json!("ai.generateText.doGenerate"))
        );
        assert_eq!(
            parent_span
                .attributes
                .raw_attributes
                .get("ai.model.provider"),
            Some(&json!("openai.chat"))
        );
        assert_eq!(
            child_span
                .attributes
                .raw_attributes
                .get("ai.model.provider"),
            Some(&json!("openai.chat"))
        );
        assert_eq!(
            parent_span.attributes.raw_attributes.get("ai.model.id"),
            Some(&json!("gpt-4.1-nano"))
        );
        assert_eq!(
            child_span.attributes.raw_attributes.get("ai.model.id"),
            Some(&json!("gpt-4.1-nano"))
        );

        // Verify path and ids_path are preserved
        assert_eq!(
            parent_span.attributes.raw_attributes.get("lmnr.span.path"),
            Some(&json!(["ai.generateText"]))
        );
        assert_eq!(
            parent_span
                .attributes
                .raw_attributes
                .get("lmnr.span.ids_path"),
            Some(&json!([parent_span_id.to_string()]))
        );
        assert_eq!(
            child_span.attributes.raw_attributes.get("lmnr.span.path"),
            Some(&json!(["ai.generateText", "ai.generateText.doGenerate"]))
        );
        assert_eq!(
            child_span
                .attributes
                .raw_attributes
                .get("lmnr.span.ids_path"),
            Some(&json!([
                parent_span_id.to_string(),
                child_span_id.to_string()
            ]))
        );

        // Verify token usage attributes
        assert_eq!(
            parent_span
                .attributes
                .raw_attributes
                .get("ai.usage.promptTokens"),
            Some(&json!(108))
        );
        assert_eq!(
            parent_span
                .attributes
                .raw_attributes
                .get("ai.usage.completionTokens"),
            Some(&json!(17))
        );
        assert_eq!(
            child_span
                .attributes
                .raw_attributes
                .get("ai.usage.promptTokens"),
            Some(&json!(108))
        );
        assert_eq!(
            child_span
                .attributes
                .raw_attributes
                .get("ai.usage.completionTokens"),
            Some(&json!(17))
        );
        assert_eq!(
            child_span
                .attributes
                .raw_attributes
                .get("gen_ai.usage.input_tokens"),
            Some(&json!(108))
        );
        assert_eq!(
            child_span
                .attributes
                .raw_attributes
                .get("gen_ai.usage.output_tokens"),
            Some(&json!(17))
        );

        // Verify response attributes
        assert_eq!(
            parent_span
                .attributes
                .raw_attributes
                .get("ai.response.finishReason"),
            Some(&json!("tool-calls"))
        );
        assert_eq!(
            child_span
                .attributes
                .raw_attributes
                .get("ai.response.finishReason"),
            Some(&json!("tool-calls"))
        );
        assert_eq!(
            child_span
                .attributes
                .raw_attributes
                .get("gen_ai.response.id"),
            Some(&json!("chatcmpl-BpafAvtYoJBBUQpui72D8vHSt8CDp"))
        );
        assert_eq!(
            child_span
                .attributes
                .raw_attributes
                .get("gen_ai.response.model"),
            Some(&json!("gpt-4.1-nano-2025-04-14"))
        );

        // Verify instrumentation metadata
        assert_eq!(
            parent_span
                .attributes
                .raw_attributes
                .get("lmnr.span.instrumentation_source"),
            Some(&json!("javascript"))
        );
        assert_eq!(
            child_span
                .attributes
                .raw_attributes
                .get("lmnr.span.instrumentation_source"),
            Some(&json!("javascript"))
        );
        assert_eq!(
            parent_span
                .attributes
                .raw_attributes
                .get("lmnr.span.sdk_version"),
            Some(&json!("0.6.13"))
        );
        assert_eq!(
            child_span
                .attributes
                .raw_attributes
                .get("lmnr.span.sdk_version"),
            Some(&json!("0.6.13"))
        );
        assert_eq!(
            parent_span
                .attributes
                .raw_attributes
                .get("lmnr.span.language_version"),
            Some(&json!("node@23.3.0"))
        );
        assert_eq!(
            child_span
                .attributes
                .raw_attributes
                .get("lmnr.span.language_version"),
            Some(&json!("node@23.3.0"))
        );

        // Verify GenAI attributes are only on the LLM span
        assert!(
            parent_span
                .attributes
                .raw_attributes
                .get("gen_ai.system")
                .is_none()
        );
        assert_eq!(
            child_span.attributes.raw_attributes.get("gen_ai.system"),
            Some(&json!("openai.chat"))
        );
        assert!(
            parent_span
                .attributes
                .raw_attributes
                .get("gen_ai.request.model")
                .is_none()
        );
        assert_eq!(
            child_span
                .attributes
                .raw_attributes
                .get("gen_ai.request.model"),
            Some(&json!("gpt-4.1-nano"))
        );
    }

    #[test]
    fn test_aisdk_tool_results_v4() {
        test_aisdk_tool_results(true);
    }

    #[test]
    fn test_aisdk_tool_results_v5() {
        test_aisdk_tool_results(false);
    }

    fn test_aisdk_tool_results(is_v4: bool) {
        let parent_span_id = Uuid::new_v4();
        let child_span_id = Uuid::new_v4();
        let trace_id = Uuid::new_v4();
        let output_key = if is_v4 { "result" } else { "output" };
        let input_key = if is_v4 { "args" } else { "input" };

        // Create parent span (ai.generateText) - has DEFAULT span type
        let parent_attributes = HashMap::from([
            ("operation.name".to_string(), json!("ai.generateText")),
            ("ai.operationId".to_string(), json!("ai.generateText")),
            ("ai.model.provider".to_string(), json!("openai.chat")),
            ("ai.model.id".to_string(), json!("gpt-4.1-nano")),
            ("ai.settings.maxRetries".to_string(), json!(2)),
            (
                "ai.prompt".to_string(),
                Value::String(
                    json!({
                        "system":"You are a helpful assistant.",
                        "messages":[
                            {"role":"user","content":"What is the weather and time in SF?"},
                            {"role":"assistant","content":[
                                {"type":"tool-call","toolCallId":"call_9oYyi7pB9xSW5ceOmcWnERiS","toolName":"get_weather",input_key:{"location":"San Francisco, CA"}},
                                {"type":"tool-call","toolCallId":"call_K9NDZ4DGgxbiy4HIL5IDNjiS","toolName":"get_time",input_key:{"location":"San Francisco, CA"}}
                            ]},
                            {"role":"tool","content":[
                                {"type":"tool-result","toolCallId":"call_9oYyi7pB9xSW5ceOmcWnERiS","toolName":"get_weather",output_key:"Sunny as always!"},
                                {"type":"tool-result","toolCallId":"call_K9NDZ4DGgxbiy4HIL5IDNjiS","toolName":"get_time",output_key:"12:00 PM"}
                            ]}
                        ]
                    }).to_string(),
                ),
            ),
            ("ai.settings.maxSteps".to_string(), json!(1)),
            (
                "lmnr.span.ids_path".to_string(),
                json!([parent_span_id.to_string()]),
            ),
            ("lmnr.span.path".to_string(), json!(["ai.generateText"])),
            (
                "lmnr.span.instrumentation_source".to_string(),
                json!("javascript"),
            ),
            ("lmnr.span.sdk_version".to_string(), json!("0.6.13")),
            (
                "lmnr.span.language_version".to_string(),
                json!("node@23.3.0"),
            ),
            ("ai.response.finishReason".to_string(), json!("tool-calls")),
            (
                "ai.response.toolCalls".to_string(),
                Value::String(
                    json!([
                        {
                            "toolCallType": "function",
                            "toolCallId": "call_akUJWoAUcWDcvNJzcZx3MzPg",
                            "toolName": "get_weather",
                            "args": "{\"location\":\"San Francisco, CA\"}"
                        }
                    ])
                    .to_string(),
                ),
            ),
            ("ai.usage.promptTokens".to_string(), json!(108)),
            ("ai.usage.completionTokens".to_string(), json!(17)),
        ]);

        let mut parent_span = Span {
            span_id: parent_span_id,
            project_id: Uuid::new_v4(),
            trace_id,
            parent_span_id: None,
            name: "ai.generateText".to_string(),
            attributes: SpanAttributes::new(parent_attributes),
            start_time: Utc::now(),
            end_time: Utc::now(),
            span_type: SpanType::Default,
            input: None,
            output: None,
            events: vec![],
            status: None,
            tags: None,
            input_url: None,
            output_url: None,
            size_bytes: 0,
        };

        // Create child span (ai.generateText.doGenerate) - has LLM span type
        let child_attributes = HashMap::from([
            (
                "operation.name".to_string(),
                json!("ai.generateText.doGenerate"),
            ),
            (
                "ai.operationId".to_string(),
                json!("ai.generateText.doGenerate"),
            ),
            ("ai.model.provider".to_string(), json!("openai.chat")),
            ("ai.model.id".to_string(), json!("gpt-4.1-nano")),
            ("ai.settings.maxRetries".to_string(), json!(2)),
            ("ai.prompt.format".to_string(), json!("messages")),
            (
                "ai.prompt.messages".to_string(),
                Value::String(
                    Value::Array(vec![
                        json!({"role":"system","content":"You are a helpful assistant."}),
                        json!({"role":"user","content":[{"type":"text","text":"What is the weather and time in SF?"}]}),
                        json!({"role":"assistant","content":[
                            {"type":"tool-call","toolCallId":"call_D2fRbvPAs1s4C9fd60l9diSk","toolName":"get_weather",input_key:{"location":"San Francisco, CA"}},
                            {"type":"tool-call","toolCallId":"call_mB9nVqiW5NlbtFtBi06Gzr5F","toolName":"get_time",input_key:{"location":"San Francisco, CA"}}
                        ]}),
                        json!({"role":"tool","content":[
                            {"type":"tool-result","toolCallId":"call_D2fRbvPAs1s4C9fd60l9diSk","toolName":"get_weather",output_key:"Sunny as always!"},
                            {"type":"tool-result","toolCallId":"call_mB9nVqiW5NlbtFtBi06Gzr5F","toolName":"get_time",output_key:"12:00 PM"}]})
                    ])
                    .to_string()
                ),
            ),
            (
                "ai.prompt.tools".to_string(),
                json!([
                    Value::String(
                        json!({
                            "type":"function",
                            "name":"get_weather",
                            "description":"Get the weather in a given location",
                            "parameters":{
                                "type":"object",
                                "properties":{"location":{"type":"string","description":"The city and state, e.g. San Francisco, CA"}},
                                "required":["location"],
                                "additionalProperties":false,
                                "$schema":"http://json-schema.org/draft-07/schema#"
                            }
                        })
                        .to_string()
                    ),
                    Value::String(
                        json!({
                            "type":"function",
                            "name":"get_time",
                            "description":"Get the time in a given location",
                            "parameters":{
                                "type":"object",
                                "properties":{"location":{"type":"string","description":"The city and state, e.g. San Francisco, CA"}},
                                "required":["location"],
                                "additionalProperties":false,
                                "$schema":"http://json-schema.org/draft-07/schema#"
                            }
                        })
                            .to_string(),
                        ),
                    ])
            ),
            (
                "ai.prompt.toolChoice".to_string(),
                json!("{\"type\":\"auto\"}"),
            ),
            ("gen_ai.system".to_string(), json!("openai.chat")),
            ("gen_ai.request.model".to_string(), json!("gpt-4.1-nano")),
            (
                "lmnr.span.ids_path".to_string(),
                json!([parent_span_id.to_string(), child_span_id.to_string()]),
            ),
            (
                "lmnr.span.path".to_string(),
                json!(["ai.generateText", "ai.generateText.doGenerate"]),
            ),
            (
                "lmnr.span.instrumentation_source".to_string(),
                json!("javascript"),
            ),
            ("lmnr.span.sdk_version".to_string(), json!("0.6.13")),
            (
                "lmnr.span.language_version".to_string(),
                json!("node@23.3.0"),
            ),
            ("ai.response.finishReason".to_string(), json!("tool-calls")),
            (
                "ai.response.toolCalls".to_string(),
                Value::String(
                    json!([
                        {
                            "toolCallType":"function",
                            "toolCallId":"call_akUJWoAUcWDcvNJzcZx3MzPg",
                            "toolName":"get_weather",
                            "args":"{\"location\":\"San Francisco, CA\"}"
                        }
                    ])
                    .to_string(),
                ),
            ),
            (
                "ai.response.id".to_string(),
                json!("chatcmpl-BpafAvtYoJBBUQpui72D8vHSt8CDp"),
            ),
            (
                "ai.response.model".to_string(),
                json!("gpt-4.1-nano-2025-04-14"),
            ),
            (
                "ai.response.timestamp".to_string(),
                json!("2025-07-04T13:22:40.000Z"),
            ),
            ("ai.usage.promptTokens".to_string(), json!(108)),
            ("ai.usage.completionTokens".to_string(), json!(17)),
            (
                "gen_ai.response.finish_reasons".to_string(),
                json!(["tool-calls"]),
            ),
            (
                "gen_ai.response.id".to_string(),
                json!("chatcmpl-BpafAvtYoJBBUQpui72D8vHSt8CDp"),
            ),
            (
                "gen_ai.response.model".to_string(),
                json!("gpt-4.1-nano-2025-04-14"),
            ),
            ("gen_ai.usage.input_tokens".to_string(), json!(108)),
            ("gen_ai.usage.output_tokens".to_string(), json!(17)),
        ]);

        let mut child_span = Span {
            span_id: child_span_id,
            project_id: Uuid::new_v4(),
            trace_id,
            parent_span_id: Some(parent_span_id),
            name: "ai.generateText.doGenerate".to_string(),
            attributes: SpanAttributes::new(child_attributes),
            start_time: Utc::now(),
            end_time: Utc::now(),
            span_type: SpanType::LLM,
            input: None,
            output: None,
            events: vec![],
            status: None,
            tags: None,
            input_url: None,
            output_url: None,
            size_bytes: 0,
        };

        // Verify initial span relationships and structure
        assert_eq!(parent_span.parent_span_id, None);
        assert_eq!(child_span.parent_span_id, Some(parent_span_id));
        assert_eq!(parent_span.trace_id, child_span.trace_id);
        assert_eq!(parent_span.span_type, SpanType::Default);
        assert_eq!(child_span.span_type, SpanType::LLM);

        // Verify initial path and ids_path
        assert_eq!(
            parent_span.attributes.raw_attributes.get("lmnr.span.path"),
            Some(&json!(["ai.generateText"]))
        );
        assert_eq!(
            parent_span
                .attributes
                .raw_attributes
                .get("lmnr.span.ids_path"),
            Some(&json!([parent_span_id.to_string()]))
        );
        assert_eq!(
            child_span.attributes.raw_attributes.get("lmnr.span.path"),
            Some(&json!(["ai.generateText", "ai.generateText.doGenerate"]))
        );
        assert_eq!(
            child_span
                .attributes
                .raw_attributes
                .get("lmnr.span.ids_path"),
            Some(&json!([
                parent_span_id.to_string(),
                child_span_id.to_string()
            ]))
        );

        // Verify initial state - no input/output yet
        assert!(parent_span.input.is_none());
        assert!(parent_span.output.is_none());
        assert!(child_span.input.is_none());
        assert!(child_span.output.is_none());

        // Apply transformations to both spans
        parent_span.parse_and_enrich_attributes();
        child_span.parse_and_enrich_attributes();

        // Verify parent span parsing (ai.generateText)
        assert!(parent_span.input.is_some());
        assert!(parent_span.output.is_some());

        let parent_input = parent_span.input.as_ref().unwrap();
        let parent_input_messages: Vec<ChatMessage> =
            serde_json::from_value(parent_input.clone()).unwrap();

        // First message: system
        assert_eq!(parent_input_messages[0].role, "system");
        match &parent_input_messages[0].content {
            ChatMessageContent::Text(text) => {
                assert_eq!(text, "You are a helpful assistant.");
            }
            _ => panic!("Expected text content for system message"),
        }

        // Second message: user
        assert_eq!(parent_input_messages[1].role, "user");
        match &parent_input_messages[1].content {
            ChatMessageContent::Text(text) => {
                assert_eq!(text, "What is the weather and time in SF?");
            }
            _ => panic!("Expected text content for user message"),
        }

        assert!(child_span.input.is_some());
        assert!(child_span.output.is_some());

        let child_input = child_span.input.as_ref().unwrap();
        let child_input_messages: Vec<ChatMessage> =
            serde_json::from_value(child_input.clone()).unwrap();
        assert_eq!(child_input_messages.len(), 4);

        // Child input should match parent input
        assert_eq!(child_input_messages[0].role, "system");
        assert_eq!(child_input_messages[1].role, "user");
        assert_eq!(child_input_messages[2].role, "assistant");
        assert_eq!(child_input_messages[3].role, "tool");

        let assistant_message = &child_input_messages[2];
        let assistant_message_content = match &assistant_message.content {
            ChatMessageContent::ContentPartList(parts) => parts,
            _ => panic!("Expected content part list for assistant message"),
        };
        assert_eq!(assistant_message_content.len(), 2);

        for part in assistant_message_content {
            match part {
                ChatMessageContentPart::ToolCall(tool_call) => {
                    assert_eq!(
                        tool_call.arguments,
                        Some(json!({"location":"San Francisco, CA"}))
                    );
                }
                _ => panic!("Expected tool call for assistant message"),
            }
        }

        let tool_message = &child_input_messages[3];
        let tool_message_content = match &tool_message.content {
            ChatMessageContent::ContentPartList(parts) => parts,
            _ => panic!("Expected content part list for tool message"),
        };
        assert_eq!(tool_message_content.len(), 2);
        match &tool_message_content[0] {
            ChatMessageContentPart::AISDKToolResult(tool_result) => {
                assert_eq!(tool_result.tool_call_id, "call_D2fRbvPAs1s4C9fd60l9diSk");
                assert_eq!(tool_result.tool_name, "get_weather");
                assert_eq!(tool_result.output, "Sunny as always!");
            }
            _ => panic!("Expected AISDKToolResult for tool message"),
        }
        match &tool_message_content[1] {
            ChatMessageContentPart::AISDKToolResult(tool_result) => {
                assert_eq!(tool_result.tool_call_id, "call_mB9nVqiW5NlbtFtBi06Gzr5F");
                assert_eq!(tool_result.tool_name, "get_time");
                assert_eq!(tool_result.output, "12:00 PM");
            }
            _ => panic!("Expected AISDKToolResult for tool message"),
        }

        // Verify GenAI attributes are only on the LLM span
        assert!(
            parent_span
                .attributes
                .raw_attributes
                .get("gen_ai.system")
                .is_none()
        );
    }

    #[test]
    fn test_parse_tool_calls_preserves_argument_order() {
        // Create attributes with tool call arguments in specific order (z before a)
        let mut attributes = HashMap::new();
        attributes.insert(
            "gen_ai.completion.0.tool_calls.0.name".to_string(),
            json!("test_function"),
        );
        attributes.insert(
            "gen_ai.completion.0.tool_calls.0.id".to_string(),
            json!("call_123"),
        );
        attributes.insert(
            "gen_ai.completion.0.tool_calls.0.arguments".to_string(),
            json!("{\"z\": 3, \"a\": 1}"),
        );

        let prefix = "gen_ai.completion.0";
        let tool_calls = parse_tool_calls(&attributes, prefix);

        assert_eq!(tool_calls.len(), 1);
        let tool_call = &tool_calls[0];

        assert_eq!(tool_call.name, "test_function");
        assert_eq!(tool_call.id, Some("call_123".to_string()));

        // Verify arguments preserve order
        if let Some(arguments) = &tool_call.arguments {
            let arguments_str = serde_json::to_string(arguments).unwrap();
            // The serialized JSON should maintain the original order: z before a
            assert!(
                arguments_str.find("\"z\"").unwrap() < arguments_str.find("\"a\"").unwrap(),
                "Expected 'z' to appear before 'a' in serialized arguments, got: {}",
                arguments_str
            );

            // Also verify the actual values are correct
            assert_eq!(arguments.get("z").unwrap(), &json!(3));
            assert_eq!(arguments.get("a").unwrap(), &json!(1));
        } else {
            panic!("Expected arguments to be present");
        }
    }

    /// This test primarily tests that when the output of the model contains text parts
    /// and tool calls, the text parts are parsed correctly. In contrast, anthropic
    /// instrumentation yields the text block preceding the tool calls as a raw string.
    #[test]
    fn test_parse_and_enrich_attributes_google_genai() {
        let attributes = HashMap::from([
            ("gen_ai.system".to_string(), json!("gemini")),
            (
                "gen_ai.request.model".to_string(),
                json!("gemini-2.5-flash-lite"),
            ),
            (
                "gen_ai.response.model".to_string(),
                json!("gemini-2.5-flash-lite"),
            ),
            (
                "gen_ai.response.id".to_string(),
                json!("F1CwaLjFLfOUxN8PhMGb-Qc"),
            ),
            ("gen_ai.prompt.0.role".to_string(), json!("user")),
            (
                "gen_ai.prompt.0.content".to_string(),
                json!(
                    "[{\"type\":\"text\",\"text\":\"What's the opposite of 'bright'? Also, what is the weather in Tokyo?\"}]"
                ),
            ),
            // This is the important bit. Notice how the output is a list of text parts
            ("gen_ai.completion.0.role".to_string(), json!("model")),
            (
                "gen_ai.completion.0.content".to_string(),
                json!(
                    "[{\"type\":\"text\",\"text\":\"The opposite of 'bright' is 'dim'. I'll go ahead and get the weather in Tokyo for you.\"}]"
                ),
            ),
            (
                "gen_ai.completion.0.tool_calls.0.id".to_string(),
                json!("get_weather"),
            ),
            (
                "gen_ai.completion.0.tool_calls.0.name".to_string(),
                json!("get_weather"),
            ),
            (
                "gen_ai.completion.0.tool_calls.0.arguments".to_string(),
                json!("{\"location\":\"Tokyo\"}"),
            ),
            ("gen_ai.usage.input_tokens".to_string(), json!(66)),
            ("gen_ai.usage.output_tokens".to_string(), json!(39)),
            ("llm.usage.total_tokens".to_string(), json!(105)),
            ("llm.request.type".to_string(), json!("completion")),
            ("lmnr.span.sdk_version".to_string(), json!("0.7.8")),
            (
                "lmnr.span.language_version".to_string(),
                json!("python@3.13"),
            ),
            (
                "lmnr.span.instrumentation_source".to_string(),
                json!("python"),
            ),
        ]);

        let mut span = Span {
            span_id: Uuid::new_v4(),
            project_id: Uuid::new_v4(),
            trace_id: Uuid::new_v4(),
            parent_span_id: None,
            name: "gemini.generate_content".to_string(),
            attributes: SpanAttributes::new(attributes),
            start_time: Utc::now(),
            end_time: Utc::now(),
            span_type: SpanType::LLM,
            input: None,
            output: None,
            events: vec![],
            status: None,
            tags: None,
            input_url: None,
            output_url: None,
            size_bytes: 0,
        };

        // Verify initial state
        assert!(span.input.is_none());
        assert!(span.output.is_none());
        assert!(
            span.attributes
                .raw_attributes
                .get("gen_ai.prompt.0.content")
                .is_some()
        );
        assert!(
            span.attributes
                .raw_attributes
                .get("gen_ai.completion.0.content")
                .is_some()
        );
        assert!(
            span.attributes
                .raw_attributes
                .get("gen_ai.completion.0.tool_calls.0.name")
                .is_some()
        );

        span.parse_and_enrich_attributes();

        assert!(span.input.is_some());
        let input = span.input.as_ref().unwrap();
        let input_messages: Vec<ChatMessage> = serde_json::from_value(input.clone()).unwrap();
        assert_eq!(input_messages.len(), 1);

        assert_eq!(input_messages[0].role, "user");
        match &input_messages[0].content {
            ChatMessageContent::ContentPartList(parts) => {
                assert_eq!(parts.len(), 1);
                let text_part = &parts[0];
                match text_part {
                    ChatMessageContentPart::Text(text) => {
                        assert_eq!(
                            text.text,
                            "What's the opposite of 'bright'? Also, what is the weather in Tokyo?"
                        );
                    }
                    _ => panic!("Expected text content for user message"),
                }
            }
            _ => panic!("Expected content part list for user message"),
        }

        assert!(span.output.is_some());
        let output = span.output.as_ref().unwrap();
        let output_messages: Vec<ChatMessage> = serde_json::from_value(output.clone()).unwrap();
        assert_eq!(output_messages.len(), 1);

        assert_eq!(output_messages[0].role, "model");
        match &output_messages[0].content {
            ChatMessageContent::ContentPartList(parts) => {
                assert_eq!(parts.len(), 2); // text part + tool call part

                // First part should be text
                match &parts[0] {
                    ChatMessageContentPart::Text(text_part) => {
                        assert_eq!(
                            text_part.text,
                            "The opposite of 'bright' is 'dim'. I'll go ahead and get the weather in Tokyo for you."
                        );
                    }
                    _ => panic!("Expected text part as first content part"),
                }

                // Second part should be tool call
                match &parts[1] {
                    ChatMessageContentPart::ToolCall(tool_call) => {
                        assert_eq!(tool_call.name, "get_weather");
                        assert_eq!(tool_call.id, Some("get_weather".to_string()));
                        assert!(tool_call.arguments.is_some());
                        let args = tool_call.arguments.as_ref().unwrap();
                        assert_eq!(args.get("location").unwrap(), &json!("Tokyo"));
                    }
                    _ => panic!("Expected tool call as second content part"),
                }
            }
            _ => panic!("Expected content part list for assistant output"),
        }

        // Verify that tool call attributes are preserved
        assert_eq!(
            span.attributes
                .raw_attributes
                .get("gen_ai.completion.0.tool_calls.0.name"),
            Some(&json!("get_weather"))
        );
        assert_eq!(
            span.attributes
                .raw_attributes
                .get("gen_ai.completion.0.tool_calls.0.id"),
            Some(&json!("get_weather"))
        );
        assert_eq!(
            span.attributes
                .raw_attributes
                .get("gen_ai.completion.0.tool_calls.0.arguments"),
            Some(&json!("{\"location\":\"Tokyo\"}"))
        );

        // Verify that other attributes are preserved
        assert_eq!(
            span.attributes.raw_attributes.get("gen_ai.system"),
            Some(&json!("gemini"))
        );
        assert_eq!(
            span.attributes.raw_attributes.get("gen_ai.request.model"),
            Some(&json!("gemini-2.5-flash-lite"))
        );
        assert_eq!(
            span.attributes.raw_attributes.get("gen_ai.response.model"),
            Some(&json!("gemini-2.5-flash-lite"))
        );
        assert_eq!(
            span.attributes.raw_attributes.get("gen_ai.response.id"),
            Some(&json!("F1CwaLjFLfOUxN8PhMGb-Qc"))
        );
        assert_eq!(
            span.attributes
                .raw_attributes
                .get("gen_ai.usage.input_tokens"),
            Some(&json!(66))
        );
        assert_eq!(
            span.attributes
                .raw_attributes
                .get("gen_ai.usage.output_tokens"),
            Some(&json!(39))
        );
        assert_eq!(
            span.attributes.raw_attributes.get("llm.usage.total_tokens"),
            Some(&json!(105))
        );
    }

    #[test]
    fn test_normalize_aisdk_stream_attributes() {
        // Simulates a span with newer AI SDK stream.* / aisdk.* attributes.
        // Verifies that tokens, model, provider, and input/output are all extracted correctly.
        let attributes = HashMap::from([
            ("aisdk.model.id".to_string(), json!("glm-4.5-flash")),
            ("aisdk.model.provider".to_string(), json!("openai.chat")),
            ("stream.usage.inputTokens".to_string(), json!(14)),
            ("stream.usage.outputTokens".to_string(), json!(87)),
            ("stream.usage.cachedInputTokens".to_string(), json!(12)),
            (
                "stream.prompt.messages".to_string(),
                json!("[{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"hello\"}]}]"),
            ),
            ("stream.response.text".to_string(), json!("Hi there!")),
            ("stream.response.toolCalls".to_string(), json!("[]")),
        ]);

        let mut span = Span {
            span_id: Uuid::new_v4(),
            project_id: Uuid::new_v4(),
            trace_id: Uuid::new_v4(),
            parent_span_id: None,
            name: "mastra.stream".to_string(),
            attributes: SpanAttributes::new(attributes),
            start_time: Utc::now(),
            end_time: Utc::now(),
            span_type: SpanType::Default,
            input: None,
            output: None,
            events: vec![],
            status: None,
            tags: None,
            input_url: None,
            output_url: None,
            size_bytes: 0,
        };

        span.parse_and_enrich_attributes();

        // Token counts should be extracted via gen_ai.usage.* normalization
        let input_tokens = span.attributes.input_tokens();
        assert_eq!(input_tokens.total(), 14);
        assert_eq!(input_tokens.cache_read_tokens, 12);
        assert_eq!(input_tokens.regular_input_tokens, 2);
        assert_eq!(span.attributes.output_tokens(), 87);

        // Model from aisdk.model.id
        assert_eq!(
            span.attributes.request_model(),
            Some("glm-4.5-flash".to_string())
        );

        assert!(span.input.is_some(), "span input should be parsed");

        assert!(span.output.is_some(), "span output should be parsed");

        assert_eq!(
            span.attributes
                .raw_attributes
                .get("stream.usage.inputTokens"),
            Some(&json!(14))
        );
        assert_eq!(
            span.attributes.raw_attributes.get("aisdk.model.provider"),
            Some(&json!("openai.chat"))
        );
    }

    #[test]
    fn test_normalize_aisdk_generate_text_attributes() {
        let attributes = HashMap::from([
            ("aisdk.model.id".to_string(), json!("gpt-4o")),
            ("aisdk.model.provider".to_string(), json!("openai")),
            ("generateText.usage.inputTokens".to_string(), json!(50)),
            ("generateText.usage.outputTokens".to_string(), json!(100)),
        ]);

        let mut span = Span {
            span_id: Uuid::new_v4(),
            project_id: Uuid::new_v4(),
            trace_id: Uuid::new_v4(),
            parent_span_id: None,
            name: "ai.generateText".to_string(),
            attributes: SpanAttributes::new(attributes),
            start_time: Utc::now(),
            end_time: Utc::now(),
            span_type: SpanType::Default,
            input: None,
            output: None,
            events: vec![],
            status: None,
            tags: None,
            input_url: None,
            output_url: None,
            size_bytes: 0,
        };

        span.parse_and_enrich_attributes();

        assert_eq!(span.attributes.input_tokens().total(), 50);
        assert_eq!(span.attributes.output_tokens(), 100);
        assert_eq!(span.attributes.request_model(), Some("gpt-4o".to_string()));
    }

    #[test]
    fn test_normalize_aisdk_does_not_overwrite_existing() {
        // If standard gen_ai.* keys already exist, normalization should NOT overwrite them.
        let attributes = HashMap::from([
            ("gen_ai.usage.input_tokens".to_string(), json!(50)),
            ("gen_ai.usage.output_tokens".to_string(), json!(200)),
            ("gen_ai.request.model".to_string(), json!("existing-model")),
            ("gen_ai.system".to_string(), json!("existing-provider")),
            // These should be ignored since standard keys already exist
            ("aisdk.model.id".to_string(), json!("overwrite-model")),
            (
                "aisdk.model.provider".to_string(),
                json!("overwrite.provider"),
            ),
            ("stream.usage.inputTokens".to_string(), json!(999)),
            ("stream.usage.outputTokens".to_string(), json!(888)),
        ]);

        let mut attrs = SpanAttributes::new(attributes);
        attrs.normalize_aisdk_attributes();

        assert_eq!(
            attrs.raw_attributes.get(GEN_AI_INPUT_TOKENS),
            Some(&json!(50))
        );
        assert_eq!(
            attrs.raw_attributes.get(GEN_AI_OUTPUT_TOKENS),
            Some(&json!(200))
        );
        assert_eq!(
            attrs.raw_attributes.get(GEN_AI_REQUEST_MODEL),
            Some(&json!("existing-model"))
        );
        assert_eq!(
            attrs.raw_attributes.get(GEN_AI_SYSTEM),
            Some(&json!("existing-provider"))
        );
    }

    #[test]
    fn test_normalize_aisdk_no_op_without_aisdk_attributes() {
        // Normalization should be a no-op for spans without any aisdk/stream attributes.
        let attributes = HashMap::from([
            ("gen_ai.system".to_string(), json!("openai")),
            ("gen_ai.usage.input_tokens".to_string(), json!(10)),
            ("gen_ai.usage.output_tokens".to_string(), json!(20)),
        ]);

        let mut attrs = SpanAttributes::new(attributes.clone());
        attrs.normalize_aisdk_attributes();

        assert_eq!(attrs.raw_attributes.len(), attributes.len());
        assert_eq!(
            attrs.raw_attributes.get(GEN_AI_INPUT_TOKENS),
            Some(&json!(10))
        );
    }

    #[test]
    fn test_normalize_aisdk_stream_object_prefix() {
        // Verify that streamObject prefix is also detected and normalized.
        let attributes = HashMap::from([
            ("aisdk.model.id".to_string(), json!("gpt-4o")),
            ("aisdk.model.provider".to_string(), json!("openai")),
            ("streamObject.usage.inputTokens".to_string(), json!(30)),
            ("streamObject.usage.outputTokens".to_string(), json!(60)),
            (
                "streamObject.prompt.messages".to_string(),
                json!(
                    "[{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"extract data\"}]}]"
                ),
            ),
        ]);

        let mut attrs = SpanAttributes::new(attributes);
        attrs.normalize_aisdk_attributes();

        assert_eq!(
            attrs.raw_attributes.get(GEN_AI_INPUT_TOKENS),
            Some(&json!(30))
        );
        assert_eq!(
            attrs.raw_attributes.get(GEN_AI_OUTPUT_TOKENS),
            Some(&json!(60))
        );
        assert!(attrs.raw_attributes.contains_key("ai.prompt.messages"));
    }

    #[test]
    fn test_cache_tokens_exceed_total_clips_to_zero() {
        // When cache tokens > total (inconsistent instrumentation), regular_input_tokens
        // should clip to 0 rather than go negative.
        let attributes = HashMap::from([
            ("gen_ai.usage.input_tokens".to_string(), json!(100)),
            (
                "gen_ai.usage.cache_read_input_tokens".to_string(),
                json!(150),
            ),
        ]);

        let mut attrs = SpanAttributes::new(attributes);
        let input_tokens = attrs.input_tokens();

        assert_eq!(input_tokens.regular_input_tokens, 0);
        assert_eq!(input_tokens.cache_read_tokens, 150);
        assert_eq!(input_tokens.total(), 150);
    }

    #[test]
    fn test_cache_write_tokens_from_input_token_details() {
        // inputTokenDetails.cacheWriteTokens should map to gen_ai.usage.cache_creation_input_tokens
        let attributes = HashMap::from([
            ("aisdk.model.id".to_string(), json!("gpt-4o")),
            ("aisdk.model.provider".to_string(), json!("openai")),
            ("stream.usage.inputTokens".to_string(), json!(100)),
            ("stream.usage.outputTokens".to_string(), json!(50)),
            (
                "stream.usage.inputTokenDetails.cacheWriteTokens".to_string(),
                json!(30),
            ),
        ]);

        let mut attrs = SpanAttributes::new(attributes);
        attrs.normalize_aisdk_attributes();

        assert_eq!(
            attrs.raw_attributes.get(GEN_AI_CACHE_WRITE_INPUT_TOKENS),
            Some(&json!(30))
        );
        // cache read should not be set
        assert!(
            !attrs
                .raw_attributes
                .contains_key(GEN_AI_CACHE_READ_INPUT_TOKENS)
        );
    }

    #[test]
    fn test_cached_input_tokens_maps_to_cache_read() {
        // cachedInputTokens should map to gen_ai.usage.cache_read_input_tokens
        let attributes = HashMap::from([
            ("aisdk.model.id".to_string(), json!("gpt-4o")),
            ("aisdk.model.provider".to_string(), json!("openai")),
            ("stream.usage.inputTokens".to_string(), json!(100)),
            ("stream.usage.outputTokens".to_string(), json!(50)),
            ("stream.usage.cachedInputTokens".to_string(), json!(40)),
        ]);

        let mut attrs = SpanAttributes::new(attributes);
        attrs.normalize_aisdk_attributes();

        assert_eq!(
            attrs.raw_attributes.get(GEN_AI_CACHE_READ_INPUT_TOKENS),
            Some(&json!(40))
        );
    }

    #[test]
    fn test_cache_read_tokens_from_input_token_details() {
        // inputTokenDetails.cacheReadTokens should map to gen_ai.usage.cache_read_input_tokens
        // when cachedInputTokens is absent
        let attributes = HashMap::from([
            ("aisdk.model.id".to_string(), json!("gpt-4o")),
            ("aisdk.model.provider".to_string(), json!("openai")),
            ("stream.usage.inputTokens".to_string(), json!(100)),
            ("stream.usage.outputTokens".to_string(), json!(50)),
            (
                "stream.usage.inputTokenDetails.cacheReadTokens".to_string(),
                json!(25),
            ),
        ]);

        let mut attrs = SpanAttributes::new(attributes);
        attrs.normalize_aisdk_attributes();

        assert_eq!(
            attrs.raw_attributes.get(GEN_AI_CACHE_READ_INPUT_TOKENS),
            Some(&json!(25))
        );
    }

    #[test]
    fn test_cached_input_tokens_has_precedence_over_cache_read_token_details() {
        // When both cachedInputTokens and inputTokenDetails.cacheReadTokens are present,
        // cachedInputTokens should take precedence because it is normalized first.
        let attributes = HashMap::from([
            ("aisdk.model.id".to_string(), json!("gpt-4o")),
            ("aisdk.model.provider".to_string(), json!("openai")),
            ("stream.usage.inputTokens".to_string(), json!(100)),
            ("stream.usage.outputTokens".to_string(), json!(50)),
            ("stream.usage.cachedInputTokens".to_string(), json!(40)),
            (
                "stream.usage.inputTokenDetails.cacheReadTokens".to_string(),
                json!(25),
            ),
        ]);

        let mut attrs = SpanAttributes::new(attributes);
        attrs.normalize_aisdk_attributes();

        // cachedInputTokens (40) wins over inputTokenDetails.cacheReadTokens (25)
        assert_eq!(
            attrs.raw_attributes.get(GEN_AI_CACHE_READ_INPUT_TOKENS),
            Some(&json!(40))
        );
    }

    #[test]
    fn test_all_cache_token_attributes_together() {
        // All three cache token attributes present: cacheWriteTokens, cachedInputTokens,
        // and cacheReadTokens. Verify they all resolve correctly with proper precedence.
        let attributes = HashMap::from([
            ("aisdk.model.id".to_string(), json!("claude-3-opus")),
            (
                "aisdk.model.provider".to_string(),
                json!("anthropic.messages"),
            ),
            ("generateText.usage.inputTokens".to_string(), json!(200)),
            ("generateText.usage.outputTokens".to_string(), json!(80)),
            (
                "generateText.usage.cachedInputTokens".to_string(),
                json!(60),
            ),
            (
                "generateText.usage.inputTokenDetails.cacheReadTokens".to_string(),
                json!(45),
            ),
            (
                "generateText.usage.inputTokenDetails.cacheWriteTokens".to_string(),
                json!(30),
            ),
        ]);

        let mut attrs = SpanAttributes::new(attributes);
        attrs.normalize_aisdk_attributes();

        // cacheWriteTokens -> gen_ai.usage.cache_creation_input_tokens
        assert_eq!(
            attrs.raw_attributes.get(GEN_AI_CACHE_WRITE_INPUT_TOKENS),
            Some(&json!(30))
        );
        // cachedInputTokens (60) takes precedence over inputTokenDetails.cacheReadTokens (45)
        assert_eq!(
            attrs.raw_attributes.get(GEN_AI_CACHE_READ_INPUT_TOKENS),
            Some(&json!(60))
        );

        // Verify input_tokens() computation uses the normalized values
        let input_tokens = attrs.input_tokens();
        assert_eq!(input_tokens.cache_write_tokens, 30);
        assert_eq!(input_tokens.cache_read_tokens, 60);
        // regular = total - cache_write - cache_read = 200 - 30 - 60 = 110
        assert_eq!(input_tokens.regular_input_tokens, 110);
        assert_eq!(input_tokens.total(), 200);
    }

    #[test]
    fn test_normalize_aisdk_only_model_no_prefix() {
        // Span has aisdk.model.* but no operation-prefixed attributes.
        // Model/provider should still be normalized.
        let attributes = HashMap::from([
            ("aisdk.model.id".to_string(), json!("claude-3-opus")),
            (
                "aisdk.model.provider".to_string(),
                json!("anthropic.messages"),
            ),
        ]);

        let mut attrs = SpanAttributes::new(attributes);
        attrs.normalize_aisdk_attributes();

        assert_eq!(
            attrs.raw_attributes.get(GEN_AI_REQUEST_MODEL),
            Some(&json!("claude-3-opus"))
        );
        assert!(!attrs.raw_attributes.contains_key(GEN_AI_INPUT_TOKENS));
        assert!(!attrs.raw_attributes.contains_key(GEN_AI_OUTPUT_TOKENS));
    }

    fn make_llm_span(attributes: HashMap<String, Value>) -> Span {
        Span {
            span_id: Uuid::new_v4(),
            project_id: Uuid::new_v4(),
            trace_id: Uuid::new_v4(),
            parent_span_id: None,
            name: "chat gpt-4o".to_string(),
            attributes: SpanAttributes::new(attributes),
            start_time: Utc::now(),
            end_time: Utc::now(),
            span_type: SpanType::LLM,
            input: None,
            output: None,
            events: vec![],
            status: None,
            tags: None,
            input_url: None,
            output_url: None,
            size_bytes: 0,
        }
    }

    #[test]
    fn test_parse_gen_ai_semconv_chat_span() {
        // Mirrors pydantic_ai v5 InstrumentationSettings output for a chat-model call.
        let input_messages = json!([
            {
                "role": "user",
                "parts": [
                    {"type": "text", "content": "What's the weather in SF?"}
                ]
            }
        ])
        .to_string();
        let output_messages = json!([
            {
                "role": "assistant",
                "parts": [
                    {"type": "text", "content": "Let me check that."},
                    {
                        "type": "tool_call",
                        "id": "call_abc",
                        "name": "get_weather",
                        "arguments": {"location": "SF"}
                    }
                ],
                "finish_reason": "tool_calls"
            }
        ])
        .to_string();

        let attributes = HashMap::from([
            ("gen_ai.operation.name".to_string(), json!("chat")),
            ("gen_ai.provider.name".to_string(), json!("openai")),
            ("gen_ai.request.model".to_string(), json!("gpt-4o")),
            ("gen_ai.input.messages".to_string(), json!(input_messages)),
            ("gen_ai.output.messages".to_string(), json!(output_messages)),
        ]);

        let mut span = make_llm_span(attributes);
        span.parse_and_enrich_attributes();

        // input has one user message with plain text
        let input: Vec<ChatMessage> = serde_json::from_value(span.input.clone().unwrap()).unwrap();
        assert_eq!(input.len(), 1);
        assert_eq!(input[0].role, "user");
        if let ChatMessageContent::Text(t) = &input[0].content {
            assert_eq!(t, "What's the weather in SF?");
        } else {
            panic!("expected plain text content, got {:?}", input[0].content);
        }

        // output has one assistant message with text + tool_call parts
        let output: Vec<ChatMessage> =
            serde_json::from_value(span.output.clone().unwrap()).unwrap();
        assert_eq!(output.len(), 1);
        assert_eq!(output[0].role, "assistant");
        if let ChatMessageContent::ContentPartList(parts) = &output[0].content {
            assert_eq!(parts.len(), 2);
            match &parts[1] {
                ChatMessageContentPart::ToolCall(tc) => {
                    assert_eq!(tc.name, "get_weather");
                    assert_eq!(tc.id.as_deref(), Some("call_abc"));
                    assert_eq!(tc.arguments, Some(json!({"location": "SF"})));
                }
                other => panic!("expected tool_call part, got {:?}", other),
            }
        } else {
            panic!("expected content list, got {:?}", output[0].content);
        }

        // Raw attributes are consumed so they don't leak into the Attributes tab.
        assert!(
            !span
                .attributes
                .raw_attributes
                .contains_key("gen_ai.input.messages")
        );
        assert!(
            !span
                .attributes
                .raw_attributes
                .contains_key("gen_ai.output.messages")
        );
    }

    #[test]
    fn test_parse_gen_ai_semconv_tool_span() {
        // Mirrors pydantic_ai v5 ToolManager output for `execute_tool {name}`.
        let mut attributes = HashMap::from([
            ("gen_ai.operation.name".to_string(), json!("execute_tool")),
            ("gen_ai.tool.name".to_string(), json!("get_weather")),
            ("gen_ai.tool.call.id".to_string(), json!("call_abc")),
            (
                "gen_ai.tool.call.arguments".to_string(),
                json!(r#"{"location": "SF"}"#),
            ),
            (
                "gen_ai.tool.call.result".to_string(),
                json!(r#"{"temp_f": 65, "description": "Sunny"}"#),
            ),
        ]);

        // Tool spans arrive with SpanType::Tool inferred from gen_ai.operation.name.
        let attrs_for_type = SpanAttributes::new(attributes.clone());
        assert_eq!(attrs_for_type.span_type(), SpanType::Tool);

        let mut span = Span {
            span_id: Uuid::new_v4(),
            project_id: Uuid::new_v4(),
            trace_id: Uuid::new_v4(),
            parent_span_id: None,
            name: "execute_tool get_weather".to_string(),
            attributes: SpanAttributes::new(std::mem::take(&mut attributes)),
            start_time: Utc::now(),
            end_time: Utc::now(),
            span_type: SpanType::Tool,
            input: None,
            output: None,
            events: vec![],
            status: None,
            tags: None,
            input_url: None,
            output_url: None,
            size_bytes: 0,
        };
        span.parse_and_enrich_attributes();

        assert_eq!(span.input, Some(json!({"location": "SF"})));
        assert_eq!(
            span.output,
            Some(json!({"temp_f": 65, "description": "Sunny"}))
        );
    }

    #[test]
    fn test_span_type_tool_without_operation_name() {
        // Real-world pydantic_ai tool spans omit gen_ai.operation.name but still carry
        // gen_ai.tool.call.* attributes. Make sure we still recognize them as Tool.
        let attrs = SpanAttributes::new(HashMap::from([
            ("gen_ai.tool.name".to_string(), json!("get_weather")),
            ("gen_ai.tool.call.id".to_string(), json!("call_abc")),
            (
                "gen_ai.tool.call.arguments".to_string(),
                json!(r#"{"location": "SF"}"#),
            ),
            ("gen_ai.tool.call.result".to_string(), json!("Sunny")),
        ]));
        assert_eq!(attrs.span_type(), SpanType::Tool);
    }

    #[test]
    fn test_span_type_from_gen_ai_operation_name() {
        let chat = SpanAttributes::new(HashMap::from([(
            "gen_ai.operation.name".to_string(),
            json!("chat"),
        )]));
        assert_eq!(chat.span_type(), SpanType::LLM);

        let tool = SpanAttributes::new(HashMap::from([(
            "gen_ai.operation.name".to_string(),
            json!("execute_tool"),
        )]));
        assert_eq!(tool.span_type(), SpanType::Tool);

        let agent = SpanAttributes::new(HashMap::from([(
            "gen_ai.operation.name".to_string(),
            json!("invoke_agent"),
        )]));
        // Agent runs stay Default so they render as container spans.
        assert_eq!(agent.span_type(), SpanType::Default);
    }

    #[test]
    fn test_parse_gen_ai_semconv_tool_response_message() {
        // Tool-response messages in pydantic_ai come through gen_ai.input.messages as
        // role=user (or role=tool for some providers) with a single tool_call_response part.
        let input_messages = json!([
            {
                "role": "user",
                "parts": [
                    {
                        "type": "tool_call_response",
                        "id": "call_abc",
                        "name": "get_weather",
                        "result": {"temp_f": 65}
                    }
                ]
            }
        ])
        .to_string();

        let attributes = HashMap::from([
            ("gen_ai.operation.name".to_string(), json!("chat")),
            ("gen_ai.input.messages".to_string(), json!(input_messages)),
        ]);

        let mut span = make_llm_span(attributes);
        span.parse_and_enrich_attributes();

        let input: Vec<ChatMessage> = serde_json::from_value(span.input.clone().unwrap()).unwrap();
        assert_eq!(input.len(), 1);
        assert_eq!(input[0].tool_call_id.as_deref(), Some("call_abc"));
    }

    #[test]
    fn test_gen_ai_system_instructions_as_string_array() {
        // Some emitters ship `gen_ai.system_instructions` as a bare string array
        // (`["Be helpful"]`) instead of `[{type: "text", content: "..."}]`. Make
        // sure the text content ends up merged into the final system message rather
        // than silently dropped.
        let input_messages = json!([{
            "role": "user",
            "parts": [{"type": "text", "content": "Hi"}]
        }])
        .to_string();
        let system_instructions = json!(["Be helpful", "Answer concisely"]).to_string();

        let attributes = HashMap::from([
            ("gen_ai.operation.name".to_string(), json!("chat")),
            ("gen_ai.input.messages".to_string(), json!(input_messages)),
            (
                "gen_ai.system_instructions".to_string(),
                json!(system_instructions),
            ),
        ]);

        let mut span = make_llm_span(attributes);
        span.parse_and_enrich_attributes();

        let input: Vec<ChatMessage> = serde_json::from_value(span.input.clone().unwrap()).unwrap();
        assert_eq!(input.len(), 2);
        assert_eq!(input[0].role, "system");
        let ChatMessageContent::ContentPartList(parts) = &input[0].content else {
            panic!("expected system content list, got {:?}", input[0].content);
        };
        assert_eq!(parts.len(), 2);
        match &parts[0] {
            ChatMessageContentPart::Text(t) => assert_eq!(t.text, "Be helpful"),
            other => panic!("expected text part, got {:?}", other),
        }
        match &parts[1] {
            ChatMessageContentPart::Text(t) => assert_eq!(t.text, "Answer concisely"),
            other => panic!("expected text part, got {:?}", other),
        }
    }
}
