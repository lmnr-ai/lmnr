use std::{
    collections::HashMap,
    env,
    sync::{Arc, LazyLock},
};

use anyhow::Result;
use chrono::{TimeZone, Utc};
use regex::Regex;
use serde::Deserialize;
use serde_json::{Map, Value, json};
use uuid::Uuid;

use crate::{
    db::{
        spans::{Span, SpanType},
        trace::TraceType,
        utils::{convert_any_value_to_json_value, span_id_to_uuid},
    },
    language_model::{
        ChatMessage, ChatMessageContent, ChatMessageContentPart, ChatMessageText,
        ChatMessageToolCall, InstrumentationChatMessageContentPart,
    },
    opentelemetry::opentelemetry_proto_trace_v1::Span as OtelSpan,
    storage::{Storage, StorageTrait},
    traces::span_attributes::{GEN_AI_CACHE_READ_INPUT_TOKENS, GEN_AI_CACHE_WRITE_INPUT_TOKENS},
    utils::json_value_to_string,
};

use super::{
    span_attributes::{
        ASSOCIATION_PROPERTIES_PREFIX, GEN_AI_COMPLETION_TOKENS, GEN_AI_INPUT_COST,
        GEN_AI_INPUT_TOKENS, GEN_AI_OUTPUT_COST, GEN_AI_OUTPUT_TOKENS, GEN_AI_PROMPT_TOKENS,
        GEN_AI_REQUEST_MODEL, GEN_AI_RESPONSE_MODEL, GEN_AI_SYSTEM, GEN_AI_TOTAL_COST,
        SPAN_IDS_PATH, SPAN_PATH, SPAN_TYPE,
    },
    utils::skip_span_name,
};

const INPUT_ATTRIBUTE_NAME: &str = "lmnr.span.input";
const OUTPUT_ATTRIBUTE_NAME: &str = "lmnr.span.output";
/// If this attribute is set to true, the parent span will be overridden with
/// null. We hackily use this when we wrap a span in a NonRecordingSpan that
/// is not sent to the backend – this is done to overwrite trace IDs for spans.
const OVERRIDE_PARENT_SPAN_ATTRIBUTE_NAME: &str = "lmnr.internal.override_parent_span";
const TRACING_LEVEL_ATTRIBUTE_NAME: &str = "lmnr.internal.tracing_level";
const HAS_BROWSER_SESSION_ATTRIBUTE_NAME: &str = "lmnr.internal.has_browser_session";

// Minimal number of tokens in the input or output to store the payload
// in storage instead of database.
//
// We use 7/2 as an estimate of the number of characters per token.
// And 128K is a common input size for LLM calls.
const DEFAULT_PAYLOAD_SIZE_THRESHOLD: usize = 128_000 * 7 / 2; // approx 448KB

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

pub struct SpanAttributes {
    pub attributes: HashMap<String, Value>,
}

impl SpanAttributes {
    pub fn new(attributes: HashMap<String, Value>) -> Self {
        Self { attributes }
    }

    pub fn session_id(&self) -> Option<String> {
        let session_id_val = self
            .attributes
            .get(&format!("{ASSOCIATION_PROPERTIES_PREFIX}.session_id"))
            .or(self.attributes.get("ai.telemetry.metadata.session_id"))
            .or(self.attributes.get("ai.telemetry.metadata.sessionId"));
        match session_id_val {
            Some(Value::String(s)) => Some(s.clone()),
            _ => None,
        }
    }

    pub fn user_id(&self) -> Option<String> {
        let user_id_val = self
            .attributes
            .get(&format!("{ASSOCIATION_PROPERTIES_PREFIX}.user_id"))
            .or(self.attributes.get("ai.telemetry.metadata.userId"))
            .or(self.attributes.get("ai.telemetry.metadata.user_id"));
        match user_id_val {
            Some(Value::String(s)) => Some(s.clone()),
            _ => None,
        }
    }

    pub fn trace_type(&self) -> Option<TraceType> {
        self.attributes
            .get(format!("{ASSOCIATION_PROPERTIES_PREFIX}.trace_type").as_str())
            .and_then(|s| serde_json::from_value(s.clone()).ok())
    }

    pub fn input_tokens(&mut self) -> InputTokens {
        let total_input_tokens =
            if let Some(Value::Number(n)) = self.attributes.get(GEN_AI_INPUT_TOKENS) {
                n.as_i64().unwrap_or(0)
            } else if let Some(Value::Number(n)) = self.attributes.get(GEN_AI_PROMPT_TOKENS) {
                // updating to the new convention
                let n = n.as_i64().unwrap_or(0);
                self.attributes
                    .insert(GEN_AI_INPUT_TOKENS.to_string(), json!(n));
                n
            } else {
                0
            };

        let cache_write_tokens = self
            .attributes
            .get(GEN_AI_CACHE_WRITE_INPUT_TOKENS)
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        let cache_read_tokens = self
            .attributes
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

    pub fn completion_tokens(&mut self) -> i64 {
        if let Some(Value::Number(n)) = self.attributes.get(GEN_AI_OUTPUT_TOKENS) {
            n.as_i64().unwrap_or(0)
        } else if let Some(Value::Number(n)) = self.attributes.get(GEN_AI_COMPLETION_TOKENS) {
            // updating to the new convention
            let n = n.as_i64().unwrap_or(0);
            self.attributes
                .insert(GEN_AI_OUTPUT_TOKENS.to_string(), json!(n));
            n
        } else {
            0
        }
    }

    pub fn request_model(&self) -> Option<String> {
        match self.attributes.get(GEN_AI_REQUEST_MODEL) {
            Some(Value::String(s)) => Some(s.clone()),
            _ => None,
        }
    }

    pub fn response_model(&self) -> Option<String> {
        match self.attributes.get(GEN_AI_RESPONSE_MODEL) {
            Some(Value::String(s)) => Some(s.clone()),
            _ => None,
        }
    }

    pub fn provider_name(&self) -> Option<String> {
        let name = if let Some(Value::String(provider)) = self.attributes.get(GEN_AI_SYSTEM) {
            // Traceloop's auto-instrumentation sends the provider name as "Langchain" and the actual provider
            // name as an attribute `association_properties.ls_provider`.
            if provider == "Langchain" {
                let ls_provider = self
                    .attributes
                    .get(format!("{ASSOCIATION_PROPERTIES_PREFIX}.ls_provider").as_str())
                    .and_then(|s| serde_json::from_value(s.clone()).ok());
                if let Some(ls_provider) = ls_provider {
                    ls_provider
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
        if let Some(span_type) = self.attributes.get(SPAN_TYPE) {
            serde_json::from_value::<SpanType>(span_type.clone()).unwrap_or_default()
        } else {
            // quick hack until we figure how to set span type on auto-instrumentation
            if self.attributes.contains_key(GEN_AI_SYSTEM)
                || self
                    .attributes
                    .iter()
                    .any(|(k, _)| k.starts_with("gen_ai.") || k.starts_with("llm."))
            {
                SpanType::LLM
            } else {
                SpanType::DEFAULT
            }
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
        match self.attributes.get(SPAN_PATH) {
            Some(Value::Array(arr)) => Some(arr.iter().map(|v| json_value_to_string(v)).collect()),
            Some(Value::String(s)) => Some(vec![s.clone()]),
            _ => None,
        }
    }

    pub fn flat_path(&self) -> Option<String> {
        self.path().map(|path| path.join("."))
    }

    pub fn ids_path(&self) -> Option<Vec<String>> {
        let attributes_ids_path = match self.attributes.get(SPAN_IDS_PATH) {
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
        self.attributes
            .insert(GEN_AI_INPUT_TOKENS.to_string(), json!(usage.input_tokens));
        self.attributes
            .insert(GEN_AI_OUTPUT_TOKENS.to_string(), json!(usage.output_tokens));
        self.attributes
            .insert(GEN_AI_TOTAL_COST.to_string(), json!(usage.total_cost));
        self.attributes
            .insert(GEN_AI_INPUT_COST.to_string(), json!(usage.input_cost));
        self.attributes
            .insert(GEN_AI_OUTPUT_COST.to_string(), json!(usage.output_cost));

        if let Some(request_model) = &usage.request_model {
            self.attributes
                .insert(GEN_AI_REQUEST_MODEL.to_string(), json!(request_model));
        }
        if let Some(response_model) = &usage.response_model {
            self.attributes
                .insert(GEN_AI_RESPONSE_MODEL.to_string(), json!(response_model));
        }
        if let Some(provider_name) = &usage.provider_name {
            self.attributes
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
        if let Some(serde_json::Value::Array(path)) = self.attributes.get(SPAN_PATH) {
            if path.len() > 0
                && !matches!(path.last().unwrap(), serde_json::Value::String(s) if s == span_name)
            {
                let mut new_path = path.clone();
                new_path.push(serde_json::Value::String(span_name.to_string()));
                self.attributes
                    .insert(SPAN_PATH.to_string(), Value::Array(new_path));
            }
        } else {
            self.attributes.insert(
                SPAN_PATH.to_string(),
                Value::Array(vec![serde_json::Value::String(span_name.to_string())]),
            );
        }
    }

    pub fn update_path(&mut self) {
        self.attributes.insert(
            SPAN_IDS_PATH.to_string(),
            Value::Array(
                self.ids_path()
                    .unwrap_or_default()
                    .into_iter()
                    .map(serde_json::Value::String)
                    .collect(),
            ),
        );
        self.attributes.insert(
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

    pub fn labels(&self) -> Vec<String> {
        let attr_tags = self
            .attributes
            .get(&format!("{ASSOCIATION_PROPERTIES_PREFIX}.tags"));
        let attr_labels = self
            .attributes
            .get(&format!("{ASSOCIATION_PROPERTIES_PREFIX}.labels"));
        match attr_tags.or(attr_labels) {
            Some(Value::Array(arr)) => arr.iter().map(|v| json_value_to_string(v)).collect(),
            _ => Vec::new(),
        }
    }

    pub fn metadata(&self) -> Option<HashMap<String, String>> {
        let mut metadata = self.get_flattened_association_properties("metadata");
        let ai_sdk_metadata = self.get_flattened_properties("ai", "telemetry.metadata");
        metadata.extend(ai_sdk_metadata);
        if metadata.is_empty() {
            None
        } else {
            Some(
                metadata
                    .into_iter()
                    .map(|(k, v)| (k, json_value_to_string(&v)))
                    .collect(),
            )
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
        for (key, value) in self.attributes.iter() {
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
        self.attributes
            .get(TRACING_LEVEL_ATTRIBUTE_NAME)
            .and_then(|s| serde_json::from_value(s.clone()).ok())
    }

    pub fn has_browser_session(&self) -> Option<bool> {
        self.attributes
            .get(HAS_BROWSER_SESSION_ATTRIBUTE_NAME)
            .and_then(|s| serde_json::from_value(s.clone()).ok())
    }
}

impl Span {
    pub fn get_attributes(&self) -> SpanAttributes {
        let attributes =
            serde_json::from_value::<HashMap<String, Value>>(self.attributes.clone()).unwrap();

        SpanAttributes::new(attributes)
    }

    pub fn set_attributes(&mut self, attributes: &SpanAttributes) {
        self.attributes = serde_json::to_value(&attributes.attributes).unwrap();
    }

    pub fn should_save(&self) -> bool {
        self.get_attributes().tracing_level() != Some(TracingLevel::Off)
            && !skip_span_name(&self.name)
    }

    /// Create a span from an OpenTelemetry span.
    ///
    /// This is called on the producer side of the MQ, i.e. at the OTel ingester
    /// side, so it must be lightweight.
    pub fn from_otel_span(otel_span: OtelSpan) -> Self {
        let trace_id = Uuid::from_slice(&otel_span.trace_id).unwrap();

        let span_id = span_id_to_uuid(&otel_span.span_id);

        let parent_span_id = if otel_span.parent_span_id.is_empty() {
            None
        } else {
            Some(span_id_to_uuid(&otel_span.parent_span_id))
        };

        let attributes = otel_span
            .attributes
            .into_iter()
            .map(|k| (k.key, convert_any_value_to_json_value(k.value)))
            .collect::<serde_json::Map<String, serde_json::Value>>();

        let mut span = Span {
            span_id,
            trace_id,
            parent_span_id,
            name: otel_span.name,
            attributes: serde_json::Value::Object(attributes.clone()),
            start_time: Utc.timestamp_nanos(otel_span.start_time_unix_nano as i64),
            end_time: Utc.timestamp_nanos(otel_span.end_time_unix_nano as i64),
            ..Default::default()
        };

        // Only set span type and handle basic attribute overrides - keep this lightweight
        span.span_type = span.get_attributes().span_type();

        // Spans with this attribute are wrapped in a NonRecordingSpan that, and we only
        // do that when we add a new span to a trace as a root span.
        if let Some(Value::Bool(true)) = attributes.get(OVERRIDE_PARENT_SPAN_ATTRIBUTE_NAME) {
            span.parent_span_id = None;
        }

        span
    }

    /// Parse and enrich span attributes for input/output extraction.
    /// This is called on the consumer side where we can afford heavier processing.
    pub fn parse_and_enrich_attributes(&mut self) {
        // Get the raw attributes map for parsing
        let mut attributes = if let serde_json::Value::Object(ref attrs) = self.attributes {
            attrs.clone()
        } else {
            return;
        };

        if self.span_type == SpanType::LLM {
            if attributes.get("gen_ai.prompt.0.content").is_some() {
                let input_messages =
                    input_chat_messages_from_prompt_content(&attributes, "gen_ai.prompt");

                self.input = Some(json!(input_messages));
                self.output = output_from_completion_content(&attributes);
            } else if let Some(stringified_value) = attributes
                .get("ai.prompt.messages")
                .and_then(|v| v.as_str())
            {
                if let Ok(prompt_messages_val) = serde_json::from_str::<Value>(stringified_value) {
                    if let Ok(input_messages) = input_chat_messages_from_json(&prompt_messages_val)
                    {
                        self.input = Some(json!(input_messages));
                    }
                }

                if let Some(output) = try_parse_ai_sdk_output(&attributes) {
                    self.output = Some(output);
                }
            }
        }

        // try parsing LiteLLM inner span for well-known providers
        if self.name == "raw_gen_ai_request" {
            self.input = self
                .input
                .take()
                .or(attributes.get("llm.openai.messages").cloned())
                .or(attributes.get("llm.anthropic.messages").cloned());

            self.output = self
                .output
                .take()
                .or(attributes.get("llm.openai.choices").cloned())
                .or(attributes.get("llm.anthropic.content").cloned());
        }

        // Vercel AI SDK wraps "raw" LLM spans in an additional `ai.generateText` span.
        // Which is not really an LLM span, but it has the prompt in its attributes.
        // Set the input to the prompt and the output to the response.
        if let Some(serde_json::Value::String(s)) = attributes.get("ai.prompt") {
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
            self.output = self.output.take().or(try_parse_ai_sdk_output(&attributes));
            // Rename AI SDK spans to what's set by telemetry.functionId
            if let Some(Value::String(s)) = attributes.get("operation.name") {
                if s.starts_with(&format!("{} ", self.name)) {
                    let new_name = s
                        .strip_prefix(&format!("{} ", self.name))
                        .unwrap_or(&self.name)
                        .to_string();
                    rename_last_span_in_path(&mut attributes, &self.name, &new_name);
                    self.name = new_name;
                }
            }
        }

        // Traceloop hard-codes these attributes to LangChain auto-instrumented spans.
        // Take their values if input/output are not already set.
        self.input = self
            .input
            .take()
            .or(attributes.get("traceloop.entity.input").cloned());
        self.output = self
            .output
            .take()
            .or(attributes.get("traceloop.entity.output").cloned());

        // Ignore inputs for Traceloop Langchain RunnableSequence spans
        if self.name.starts_with("RunnableSequence")
            && attributes
                .get("traceloop.entity.name")
                .map(|s| json_value_to_string(s) == "RunnableSequence")
                .unwrap_or(false)
        {
            self.input = None;
        }

        // If an LLM span is sent manually, we prefer `lmnr.span.input` and `lmnr.span.output`
        // attributes over gen_ai/vercel/LiteLLM attributes.
        // Therefore this block is outside and after the LLM span type check.
        if let Some(serde_json::Value::String(s)) = attributes.get(INPUT_ATTRIBUTE_NAME) {
            let input =
                serde_json::from_str::<Value>(s).unwrap_or(serde_json::Value::String(s.clone()));
            if self.span_type == SpanType::LLM {
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
        if let Some(serde_json::Value::String(s)) = attributes.get(OUTPUT_ATTRIBUTE_NAME) {
            // TODO: try parse output as ChatMessage with tool calls
            self.output = Some(
                serde_json::from_str::<Value>(s).unwrap_or(serde_json::Value::String(s.clone())),
            );
        }

        if let Some(TracingLevel::MetaOnly) = self.get_attributes().tracing_level() {
            self.input = None;
            self.output = None;
        }
        self.attributes = serde_json::Value::Object(
            attributes
                .into_iter()
                .filter_map(|(k, v)| {
                    if should_keep_attribute(&k) {
                        let converted_val = convert_attribute(&k, v);
                        Some((k, converted_val))
                    } else {
                        None
                    }
                })
                .collect(),
        );
    }

    pub async fn store_payloads(&mut self, project_id: &Uuid, storage: Arc<Storage>) -> Result<()> {
        let payload_size_threshold = env::var("MAX_DB_SPAN_PAYLOAD_BYTES")
            .ok()
            .and_then(|s: String| s.parse::<usize>().ok())
            .unwrap_or(DEFAULT_PAYLOAD_SIZE_THRESHOLD);
        if let Some(input) = self.input.clone() {
            let span_input = serde_json::from_value::<Vec<ChatMessage>>(input);
            if let Ok(span_input) = span_input {
                let mut new_messages = Vec::new();
                for mut message in span_input {
                    if let ChatMessageContent::ContentPartList(parts) = message.content {
                        let mut new_parts = Vec::new();
                        for part in parts {
                            let stored_part =
                                match part.store_media(project_id, storage.clone()).await {
                                    Ok(stored_part) => stored_part,
                                    Err(e) => {
                                        log::error!("Error storing media: {e}");
                                        part
                                    }
                                };
                            new_parts.push(stored_part);
                        }
                        message.content = ChatMessageContent::ContentPartList(new_parts);
                    }
                    new_messages.push(message);
                }
                self.input = Some(serde_json::to_value(new_messages).unwrap());
            } else {
                let mut data = Vec::new();
                serde_json::to_writer(&mut data, &self.input)?;
                if data.len() > payload_size_threshold {
                    let key = crate::storage::create_key(project_id, &None);
                    let url = storage.store(data.clone(), &key).await?;
                    self.input_url = Some(url);
                    self.input = Some(serde_json::Value::String(
                        String::from_utf8_lossy(&data).chars().take(100).collect(),
                    ));
                }
            }
        }
        if let Some(output) = self.output.clone() {
            let output_str = serde_json::to_string(&output).unwrap_or_default();
            if output_str.len() > payload_size_threshold {
                let key = crate::storage::create_key(project_id, &None);
                let mut data = Vec::new();
                serde_json::to_writer(&mut data, &output)?;
                let url = storage.store(data, &key).await?;
                self.output_url = Some(url);
                self.output = Some(serde_json::Value::String(
                    output_str.chars().take(100).collect(),
                ));
            }
        }
        Ok(())
    }
}

fn should_keep_attribute(attribute: &str) -> bool {
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

fn input_chat_messages_from_prompt_content(
    attributes: &serde_json::Map<String, serde_json::Value>,
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
            attributes.get(&format!("{prefix}.{i}.content"))
        {
            s.clone()
        } else {
            "".to_string()
        };

        let role = if let Some(serde_json::Value::String(s)) =
            attributes.get(&format!("{prefix}.{i}.role"))
        {
            s.clone()
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
                                text: content.clone(),
                            }));
                        }
                        for tool_call in tool_calls {
                            parts.push(ChatMessageContentPart::ToolCall(tool_call));
                        }
                        ChatMessageContent::ContentPartList(parts)
                    } else {
                        ChatMessageContent::Text(content.clone())
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
                    Err(_) => ChatMessageContent::Text(json_value_to_string(otel_content)),
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

fn convert_attribute(key: &str, value: serde_json::Value) -> serde_json::Value {
    if key == "ai.prompt.tools" {
        if let Some(tools) = value.as_array() {
            serde_json::Value::Array(
                tools
                    .into_iter()
                    .map(|tool| match tool {
                        serde_json::Value::String(s) => {
                            serde_json::from_str::<HashMap<String, serde_json::Value>>(s)
                                .map(|m| serde_json::to_value(m).unwrap())
                                .unwrap_or(tool.clone())
                        }
                        _ => tool.clone(),
                    })
                    .collect(),
            )
        } else {
            value
        }
    } else {
        value
    }
}

fn output_from_completion_content(
    attributes: &serde_json::Map<String, serde_json::Value>,
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
            output_message_from_completion_content(attributes, &format!("gen_ai.completion.{i}"))
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

fn output_message_from_completion_content(
    attributes: &serde_json::Map<String, serde_json::Value>,
    prefix: &str,
) -> Option<ChatMessage> {
    let msg_content = attributes.get(format!("{prefix}.content").as_str());
    let msg_role = attributes
        .get(format!("{prefix}.role").as_str())
        .map(|v| json_value_to_string(v))
        .unwrap_or("assistant".to_string());

    let tool_calls = parse_tool_calls(attributes, prefix);

    if tool_calls.is_empty() {
        if let Some(Value::String(s)) = msg_content {
            Some(ChatMessage {
                role: msg_role,
                content: ChatMessageContent::Text(s.clone()),
                tool_call_id: None,
            })
        } else {
            None
        }
    } else {
        let mut out_vec = if let Some(Value::String(s)) = msg_content {
            if s.is_empty() {
                vec![]
            } else {
                let text_block = ChatMessageContentPart::Text(ChatMessageText { text: s.clone() });
                vec![text_block]
            }
        } else {
            vec![]
        };
        out_vec.extend(
            tool_calls
                .into_iter()
                .map(|tool_call| ChatMessageContentPart::ToolCall(tool_call)),
        );
        Some(ChatMessage {
            role: msg_role,
            content: ChatMessageContent::ContentPartList(out_vec),
            tool_call_id: None,
        })
    }
}

fn parse_tool_calls(
    attributes: &serde_json::Map<String, serde_json::Value>,
    prefix: &str,
) -> Vec<ChatMessageToolCall> {
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
                let parsed = serde_json::from_str::<HashMap<String, Value>>(s);
                if let Ok(parsed) = parsed {
                    serde_json::to_value(parsed).ok()
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

fn try_parse_ai_sdk_output(
    attributes: &serde_json::Map<String, serde_json::Value>,
) -> Option<serde_json::Value> {
    let mut messages = Vec::new();
    // let mut out_vals: Vec<serde_json::Value> = Vec::new();
    if let Some(serde_json::Value::String(s)) = attributes.get("ai.response.text") {
        messages.push(ChatMessage {
            role: "assistant".to_string(),
            content: ChatMessageContent::Text(s.clone()),
            tool_call_id: None,
        });
    } else if let Some(serde_json::Value::String(s)) = attributes.get("ai.response.object") {
        let content = serde_json::from_str::<serde_json::Value>(s)
            .unwrap_or(serde_json::Value::String(s.clone()));
        messages.push(ChatMessage {
            role: "assistant".to_string(),
            content: ChatMessageContent::Text(json_value_to_string(&content)),
            tool_call_id: None,
        });
    } else if let Some(serde_json::Value::String(s)) = attributes.get("ai.response.toolCalls") {
        if let Ok(tool_call_values) =
            serde_json::from_str::<Vec<HashMap<String, serde_json::Value>>>(s)
        {
            let tool_calls = parse_ai_sdk_tool_calls(tool_call_values)
                .iter()
                .map(|tool_call| ChatMessageContentPart::ToolCall(tool_call.clone()))
                .collect::<Vec<_>>();
            messages.push(ChatMessage {
                role: "assistant".to_string(),
                content: ChatMessageContent::ContentPartList(tool_calls),
                tool_call_id: None,
            });
        }
    }

    if messages.is_empty() {
        None
    } else {
        Some(serde_json::Value::Array(
            messages
                .into_iter()
                .map(|message| serde_json::to_value(message).unwrap())
                .collect(),
        ))
    }
}

fn parse_ai_sdk_tool_calls(
    tool_calls: Vec<HashMap<String, serde_json::Value>>,
) -> Vec<ChatMessageToolCall> {
    tool_calls
        .iter()
        .filter_map(|tool_call| {
            tool_call.get("toolName").map(|tool_name| {
                let args_value = tool_call.get("args").cloned().unwrap_or_default();
                let args = if let serde_json::Value::String(s) = &args_value {
                    serde_json::from_str::<HashMap<String, serde_json::Value>>(s).ok()
                } else {
                    serde_json::from_value::<HashMap<String, serde_json::Value>>(args_value).ok()
                };
                ChatMessageToolCall {
                    name: json_value_to_string(tool_name),
                    id: tool_call.get("toolCallId").map(json_value_to_string),
                    arguments: args.map(|args| serde_json::to_value(args).unwrap()),
                }
            })
        })
        .collect::<Vec<_>>()
}

fn rename_last_span_in_path(attributes: &mut Map<String, Value>, from: &str, to: &str) {
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
