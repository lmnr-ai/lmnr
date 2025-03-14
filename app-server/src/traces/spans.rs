use std::{collections::HashMap, env, sync::Arc};

use anyhow::Result;
use chrono::{TimeZone, Utc};
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{
    db::{
        spans::{Span, SpanType},
        trace::{CurrentTraceAndSpan, TraceType},
        utils::{convert_any_value_to_json_value, span_id_to_uuid},
    },
    language_model::{
        ChatMessage, ChatMessageContent, ChatMessageContentPart,
        InstrumentationChatMessageContentPart,
    },
    opentelemetry::opentelemetry_proto_trace_v1::Span as OtelSpan,
    pipeline::{nodes::Message, trace::MetaLog},
    storage::{Storage, StorageTrait},
    traces::span_attributes::{GEN_AI_CACHE_READ_INPUT_TOKENS, GEN_AI_CACHE_WRITE_INPUT_TOKENS},
};

use super::{
    span_attributes::{
        ASSOCIATION_PROPERTIES_PREFIX, GEN_AI_COMPLETION_TOKENS, GEN_AI_INPUT_COST,
        GEN_AI_INPUT_TOKENS, GEN_AI_OUTPUT_COST, GEN_AI_OUTPUT_TOKENS, GEN_AI_PROMPT_TOKENS,
        GEN_AI_REQUEST_MODEL, GEN_AI_RESPONSE_MODEL, GEN_AI_SYSTEM, GEN_AI_TOTAL_COST,
        GEN_AI_TOTAL_TOKENS, LLM_NODE_RENDERED_PROMPT, SPAN_IDS_PATH, SPAN_PATH, SPAN_TYPE,
    },
    utils::{json_value_to_string, skip_span_name},
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
const DEFAULT_PAYLOAD_SIZE_THRESHOLD: usize = (7 / 2) * 128_000; // approx 448KB

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
        match self
            .attributes
            .get(format!("{ASSOCIATION_PROPERTIES_PREFIX}.session_id").as_str())
        {
            Some(Value::String(s)) => Some(s.clone()),
            _ => None,
        }
    }

    pub fn user_id(&self) -> Option<String> {
        match self
            .attributes
            .get(format!("{ASSOCIATION_PROPERTIES_PREFIX}.user_id").as_str())
        {
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

        if self.provider_name() == Some("anthropic".to_string()) {
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
                total_input_tokens - (cache_write_tokens + cache_read_tokens);
            let cache_write_tokens = cache_write_tokens;
            let cache_read_tokens = cache_read_tokens;

            InputTokens {
                regular_input_tokens,
                cache_write_tokens,
                cache_read_tokens,
            }
        } else {
            InputTokens {
                regular_input_tokens: total_input_tokens,
                cache_write_tokens: 0,
                cache_read_tokens: 0,
            }
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
        match self
            .attributes
            .get(format!("{ASSOCIATION_PROPERTIES_PREFIX}.labels").as_str())
        {
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
            attributes: serde_json::Value::Object(
                attributes
                    .clone()
                    .into_iter()
                    .filter_map(|(k, v)| {
                        if should_keep_attribute(k.as_str()) {
                            Some((k, v))
                        } else {
                            None
                        }
                    })
                    .collect(),
            ),
            start_time: Utc.timestamp_nanos(otel_span.start_time_unix_nano as i64),
            end_time: Utc.timestamp_nanos(otel_span.end_time_unix_nano as i64),
            ..Default::default()
        };

        span.span_type = span.get_attributes().span_type();

        // to handle Traceloop's prompt/completion messages
        if span.span_type == SpanType::LLM {
            if attributes.get("gen_ai.prompt.0.content").is_some() {
                let input_messages =
                    input_chat_messages_from_prompt_content(&attributes, "gen_ai.prompt");

                span.input = Some(json!(input_messages));
                span.output = output_from_completion_content(
                    &attributes,
                    "gen_ai.completion",
                    "tool_calls",
                    true,
                );
            } else if attributes.get("ai.prompt.messages").is_some() {
                // handling the Vercel's AI SDK auto-instrumentation
                if let Ok(input_messages) = serde_json::from_str::<Vec<ChatMessage>>(
                    attributes
                        .get("ai.prompt.messages")
                        .unwrap()
                        .as_str()
                        .unwrap(),
                ) {
                    span.input = Some(json!(input_messages));
                }

                if let Some(serde_json::Value::String(s)) = attributes.get("ai.response.text") {
                    span.output = Some(serde_json::Value::String(s.clone()));
                } else if let Some(serde_json::Value::String(s)) =
                    attributes.get("ai.response.object")
                {
                    span.output = Some(
                        serde_json::from_str::<Value>(s)
                            .unwrap_or(serde_json::Value::String(s.clone())),
                    );
                }
            } else if attributes
                .get("SpanAttributes.LLM_PROMPTS.0.content")
                .is_some()
            {
                // handling the LiteLLM auto-instrumentation
                let input_messages = input_chat_messages_from_prompt_content(
                    &attributes,
                    "SpanAttributes.LLM_PROMPTS",
                );
                span.input = Some(json!(input_messages));

                span.output = output_from_completion_content(
                    &attributes,
                    "SpanAttributes.LLM_COMPLETIONS",
                    "function_call",
                    false,
                );
            }
        }

        // Vercel AI SDK wraps "raw" LLM spans in an additional `ai.generateText` span.
        // Which is not really an LLM span, but it has the prompt in its attributes.
        // Set the input to the prompt and the output to the response.
        if let Some(serde_json::Value::String(s)) = attributes.get("ai.prompt") {
            span.input = Some(
                serde_json::from_str::<Value>(s).unwrap_or(serde_json::Value::String(s.clone())),
            );
        }
        if let Some(serde_json::Value::String(s)) = attributes.get("ai.response.text") {
            span.output = Some(
                serde_json::from_str::<Value>(s).unwrap_or(serde_json::Value::String(s.clone())),
            );
        } else if let Some(serde_json::Value::String(s)) = attributes.get("ai.response.object") {
            span.output = Some(
                serde_json::from_str::<Value>(s).unwrap_or(serde_json::Value::String(s.clone())),
            );
        }

        // Traceloop hard-codes these attributes to LangChain auto-instrumented spans.
        // Take their values if input/output are not already set.
        if let Some(input) = attributes.get("traceloop.entity.input") {
            if span.input.is_none() {
                span.input = Some(input.clone());
            }
        }
        if let Some(output) = attributes.get("traceloop.entity.output") {
            if span.output.is_none() {
                span.output = Some(output.clone());
            }
        }

        // If an LLM span is sent manually, we prefer `lmnr.span.input` and `lmnr.span.output`
        // attributes over gen_ai/vercel/LiteLLM attributes.
        // Therefore this block is outside and after the LLM span type check.
        if let Some(serde_json::Value::String(s)) = attributes.get(INPUT_ATTRIBUTE_NAME) {
            let input =
                serde_json::from_str::<Value>(s).unwrap_or(serde_json::Value::String(s.clone()));
            if span.span_type == SpanType::LLM {
                let input_messages = input_chat_messages_from_json(&input);
                if let Ok(input_messages) = input_messages {
                    span.input = Some(json!(input_messages));
                } else {
                    span.input = Some(input);
                }
            } else {
                span.input = Some(input);
            }
        }
        if let Some(serde_json::Value::String(s)) = attributes.get(OUTPUT_ATTRIBUTE_NAME) {
            // TODO: try parse output as ChatMessage with tool calls
            span.output = Some(
                serde_json::from_str::<Value>(s).unwrap_or(serde_json::Value::String(s.clone())),
            );
        }

        // Spans with this attribute are wrapped in a NonRecordingSpan that, and we only
        // do that when we add a new span to a trace as a root span.
        if let Some(Value::Bool(true)) = attributes.get(OVERRIDE_PARENT_SPAN_ATTRIBUTE_NAME) {
            span.parent_span_id = None;
        }

        if let Some(TracingLevel::MetaOnly) = span.get_attributes().tracing_level() {
            span.input = None;
            span.output = None;
        }

        span
    }

    pub fn create_parent_span_in_run_trace(
        current_trace_and_span: Option<CurrentTraceAndSpan>,
        run_stats: &crate::pipeline::trace::RunTraceStats,
        name: &String,
        messages: &HashMap<Uuid, Message>,
        trace_type: TraceType,
    ) -> Self {
        // First, process current active context (current_trace_and_span)
        // If there is both active trace and span, use them. Otherwise, create new trace id and None for parent span id.
        let trace_id = current_trace_and_span
            .as_ref()
            .map(|t| t.trace_id)
            .unwrap_or_else(Uuid::new_v4);
        let parent_span_id = current_trace_and_span.as_ref().map(|t| t.parent_span_id);
        let parent_span_path = current_trace_and_span.and_then(|t| t.parent_span_path);

        let mut inputs = HashMap::new();
        let mut outputs = HashMap::new();
        messages
            .values()
            .for_each(|msg| match msg.node_type.as_str() {
                "Input" => {
                    inputs.insert(msg.node_name.clone(), msg.value.clone());
                }
                "Output" => {
                    outputs.insert(msg.node_name.clone(), msg.value.clone());
                }
                _ => (),
            });

        let path = if let Some(parent_span_path) = parent_span_path {
            format!("{}.{}", parent_span_path, name)
        } else {
            name.clone()
        };
        let mut attributes = HashMap::new();
        attributes.insert(
            format!("{ASSOCIATION_PROPERTIES_PREFIX}.trace_type",),
            json!(trace_type),
        );
        attributes.insert(SPAN_PATH.to_string(), json!(path));

        Self {
            span_id: Uuid::new_v4(),
            start_time: run_stats.start_time,
            end_time: run_stats.end_time,
            trace_id,
            parent_span_id,
            name: name.clone(),
            attributes: serde_json::json!(attributes),
            input: serde_json::to_value(inputs).ok(),
            output: serde_json::to_value(outputs).ok(),
            span_type: SpanType::PIPELINE,
            events: None,
            labels: None,
            input_url: None,
            output_url: None,
        }
    }

    /// Create spans from messages.
    ///
    /// At this point, the whole pipeline run acts as a parent span.
    /// So trace id, parent span id, and parent span path are all not None.
    pub fn from_messages(
        messages: &HashMap<Uuid, Message>,
        trace_id: Uuid,
        parent_span_id: Uuid,
        parent_span_path: Vec<String>,
    ) -> Vec<Self> {
        messages
            .iter()
            .filter_map(|(msg_id, message)| {
                if !["LLM", "SemanticSearch"].contains(&message.node_type.as_str()) {
                    return None;
                }

                let span_path = if message.node_type == "LLM" {
                    // Span name is appended for LLM spans, on the consumer side of RabbitMQ,
                    // in SpanAttributes::extend_span_path to correctly write path for
                    // auto-instrumented LLM spans.
                    // Here, we have to mimic what client-side does with LLM spans,
                    // i.e. do not append span name.
                    parent_span_path.clone()
                } else {
                    let mut path = parent_span_path.clone();
                    path.push(message.node_name.clone());
                    path
                };

                let input_values = message
                    .input_message_ids
                    .iter()
                    .map(|input_id| {
                        let input_message = messages.get(input_id).unwrap();
                        (
                            input_message.node_name.clone(),
                            input_message.value.clone().into(),
                        )
                    })
                    .collect::<HashMap<String, Value>>();
                let span = Span {
                    span_id: *msg_id,
                    start_time: message.start_time,
                    end_time: message.end_time,
                    trace_id,
                    parent_span_id: Some(parent_span_id),
                    name: message.node_name.clone(),
                    attributes: span_attributes_from_meta_log(message.meta_log.clone(), span_path),
                    input: Some(serde_json::to_value(input_values).unwrap()),
                    output: Some(message.value.clone().into()),
                    span_type: match message.node_type.as_str() {
                        "LLM" => SpanType::LLM,
                        _ => SpanType::DEFAULT,
                    },
                    events: None,
                    labels: None,
                    input_url: None,
                    output_url: None,
                };
                Some(span)
            })
            .collect()
    }

    pub async fn store_payloads(&mut self, project_id: &Uuid, storage: Arc<Storage>) -> Result<()> {
        let payload_size_threshold = env::var("MAX_DB_SPAN_PAYLOAD_BYTES")
            .ok()
            .and_then(|s| s.parse::<usize>().ok())
            .unwrap_or(DEFAULT_PAYLOAD_SIZE_THRESHOLD);
        if let Some(input) = self.input.clone() {
            let span_input = serde_json::from_value::<Vec<ChatMessage>>(input);
            if let Ok(span_input) = span_input {
                let mut new_messages = Vec::new();
                for mut message in span_input {
                    if let ChatMessageContent::ContentPartList(parts) = message.content {
                        let mut new_parts = Vec::new();
                        for part in parts {
                            new_parts.push(part.store_media(project_id, storage.clone()).await?);
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

fn span_attributes_from_meta_log(meta_log: Option<MetaLog>, span_path: Vec<String>) -> Value {
    let mut attributes = HashMap::new();

    if let Some(MetaLog::LLM(llm_log)) = meta_log {
        attributes.insert(
            GEN_AI_INPUT_TOKENS.to_string(),
            json!(llm_log.input_token_count),
        );
        attributes.insert(
            GEN_AI_OUTPUT_TOKENS.to_string(),
            json!(llm_log.output_token_count),
        );
        attributes.insert(
            GEN_AI_TOTAL_TOKENS.to_string(),
            json!(llm_log.total_token_count),
        );
        attributes.insert(GEN_AI_RESPONSE_MODEL.to_string(), json!(llm_log.model));
        attributes.insert(GEN_AI_SYSTEM.to_string(), json!(llm_log.provider));
        attributes.insert(
            GEN_AI_TOTAL_COST.to_string(),
            json!(llm_log.approximate_cost),
        );
        attributes.insert(LLM_NODE_RENDERED_PROMPT.to_string(), json!(llm_log.prompt));
    }
    attributes.insert(SPAN_PATH.to_string(), json!(span_path));

    serde_json::to_value(attributes).unwrap()
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
    let pattern = Regex::new(r"gen_ai\.(prompt|completion)\.\d+\.(content|role)").unwrap();
    if pattern.is_match(attribute) {
        return false;
    }

    // LiteLLM
    // remove SpanAttributes.LLM_PROMPTS/COMPLETIONS attributes as they are stored in LLM span's input/output
    let pattern =
        Regex::new(r"SpanAttributes\.LLM_(PROMPTS|COMPLETIONS)\.\d+\.(content|role)").unwrap();
    if pattern.is_match(attribute) {
        return false;
    }

    // AI SDK
    // remove ai.prompt.messages as it is stored in LLM span's input
    if attribute == "ai.prompt.messages" {
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

    let mut i = 0;
    while attributes
        .get(format!("{prefix}.{i}.content").as_str())
        .is_some()
    {
        // TODO: handle case where content is not a string, e.g. LangChain tool messages
        let content = if let Some(serde_json::Value::String(s)) =
            attributes.get(format!("{prefix}.{i}.content").as_str())
        {
            s.clone()
        } else {
            "".to_string()
        };

        let role = if let Some(serde_json::Value::String(s)) =
            attributes.get(format!("{prefix}.{i}.role").as_str())
        {
            s.clone()
        } else {
            "user".to_string()
        };

        input_messages.push(ChatMessage {
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
                    ChatMessageContent::ContentPartList(parts)
                }
                Err(_) => ChatMessageContent::Text(content.clone()),
            },
        });
        i += 1;
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
                })
            })
            .collect()
    } else {
        Err(anyhow::anyhow!("Input is not a list"))
    }
}

#[derive(Serialize)]
struct ToolCall {
    name: String,
    id: Option<String>,
    arguments: Option<serde_json::Value>,
    #[serde(rename = "type")]
    content_block_type: String,
}

#[derive(Serialize)]
struct TextBlock {
    content: String,
    #[serde(rename = "type")]
    content_block_type: String,
}

fn tool_call_attribute(
    prefix: &str,
    tool_call_attribute_name: &str,
    use_index_in_tools: bool,
    index: usize,
    attribute: &str,
) -> String {
    if use_index_in_tools {
        format!("{prefix}.0.{tool_call_attribute_name}.{index}.{attribute}")
    } else {
        format!("{prefix}.0.{tool_call_attribute_name}.{attribute}")
    }
}

fn output_from_completion_content(
    attributes: &serde_json::Map<String, serde_json::Value>,
    prefix: &str,
    tool_call_attribute_name: &str,
    use_index_in_tools: bool,
) -> Option<serde_json::Value> {
    let text_msg = attributes.get(format!("{prefix}.0.content").as_str());

    let mut tool_calls = Vec::new();
    let mut i = 0;

    while let Some(serde_json::Value::String(tool_call_name)) = attributes.get(
        tool_call_attribute(
            prefix,
            tool_call_attribute_name,
            use_index_in_tools,
            i,
            "name",
        )
        .as_str(),
    ) {
        let tool_call_id = attributes
            .get(
                tool_call_attribute(
                    prefix,
                    tool_call_attribute_name,
                    use_index_in_tools,
                    i,
                    "id",
                )
                .as_str(),
            )
            .and_then(|id| id.as_str())
            .map(String::from);
        let tool_call_arguments_raw = attributes.get(
            tool_call_attribute(
                prefix,
                tool_call_attribute_name,
                use_index_in_tools,
                i,
                "arguments",
            )
            .as_str(),
        );
        let tool_call_arguments = match tool_call_arguments_raw {
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
        let tool_call = ToolCall {
            name: tool_call_name.clone(),
            id: tool_call_id,
            arguments: tool_call_arguments,
            content_block_type: "tool_call".to_string(),
        };
        tool_calls.push(serde_json::to_value(tool_call).unwrap());
        i += 1;
        if !use_index_in_tools {
            break;
        }
    }

    if tool_calls.is_empty() {
        if let Some(Value::String(s)) = text_msg {
            Some(serde_json::Value::String(s.clone()))
        } else {
            None
        }
    } else {
        let mut out_vec = if let Some(Value::String(s)) = text_msg {
            let text_block = TextBlock {
                content: s.clone(),
                content_block_type: "text".to_string(),
            };
            vec![serde_json::to_value(text_block).unwrap()]
        } else {
            vec![]
        };
        out_vec.extend(tool_calls);
        Some(Value::Array(out_vec))
    }
}
