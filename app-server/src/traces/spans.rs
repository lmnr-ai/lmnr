use std::collections::HashMap;

use chrono::{TimeZone, Utc};
use regex::Regex;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{
    db::{
        spans::{Span, SpanType},
        trace::{CurrentTraceAndSpan, TraceType, DEFAULT_VERSION},
        utils::{convert_any_value_to_json_value, span_id_to_uuid},
    },
    language_model::{ChatMessage, ChatMessageContent, InstrumentationChatMessageContentPart},
    opentelemetry::opentelemetry_proto_trace_v1::Span as OtelSpan,
    pipeline::{nodes::Message, trace::MetaLog},
};

use super::span_attributes::{
    ASSOCIATION_PROPERTIES_PREFIX, GEN_AI_COMPLETION_TOKENS, GEN_AI_INPUT_COST,
    GEN_AI_INPUT_TOKENS, GEN_AI_OUTPUT_COST, GEN_AI_OUTPUT_TOKENS, GEN_AI_PROMPT_TOKENS,
    GEN_AI_REQUEST_MODEL, GEN_AI_RESPONSE_MODEL, GEN_AI_SYSTEM, GEN_AI_TOTAL_COST,
    GEN_AI_TOTAL_TOKENS, LLM_NODE_RENDERED_PROMPT, SPAN_PATH, SPAN_TYPE,
};

const INPUT_ATTRIBUTE_NAME: &str = "lmnr.span.input";
const OUTPUT_ATTRIBUTE_NAME: &str = "lmnr.span.output";

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
            .get(format!("{ASSOCIATION_PROPERTIES_PREFIX}session_id").as_str())
        {
            Some(Value::String(s)) => Some(s.clone()),
            _ => None,
        }
    }

    pub fn user_id(&self) -> Option<String> {
        match self
            .attributes
            .get(format!("{ASSOCIATION_PROPERTIES_PREFIX}user_id").as_str())
        {
            Some(Value::String(s)) => Some(s.clone()),
            _ => None,
        }
    }

    pub fn trace_type(&self) -> Option<TraceType> {
        self.attributes
            .get(format!("{ASSOCIATION_PROPERTIES_PREFIX}trace_type").as_str())
            .and_then(|s| serde_json::from_value(s.clone()).ok())
    }

    pub fn input_tokens(&mut self) -> i64 {
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
        if let Some(Value::String(provider)) = self.attributes.get(GEN_AI_SYSTEM) {
            // Traceloop's auto-instrumentation sends the provider name as "Langchain" and the actual provider
            // name as an attribute `association_properties.ls_provider`.
            if provider == "Langchain" {
                let ls_provider = self
                    .attributes
                    .get(format!("{ASSOCIATION_PROPERTIES_PREFIX}ls_provider").as_str())
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
        }
    }

    pub fn span_type(&self) -> SpanType {
        if let Some(span_type) = self.attributes.get(SPAN_TYPE) {
            serde_json::from_value::<SpanType>(span_type.clone()).unwrap_or_default()
        } else {
            // quick hack until we figure how to set span type on auto-instrumentation
            if self.attributes.contains_key(GEN_AI_SYSTEM) {
                SpanType::LLM
            } else {
                SpanType::DEFAULT
            }
        }
    }

    pub fn path(&self) -> Option<String> {
        self.attributes
            .get(SPAN_PATH)
            .and_then(|p| p.as_str().map(|s| s.to_string()))
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
    /// modify autoinstrumented LLM spans to have correct exact span path.
    ///
    /// NOTE: It may not work very precisely for Langchain auto-instrumentation, since it contains
    /// nested spans within autoinstrumentation. Also, it may not work for autoinstrumented vector DB calls.
    pub fn extend_span_path(&mut self, span_name: &str) {
        if self.attributes.contains_key(GEN_AI_SYSTEM) {
            if let Some(serde_json::Value::String(path)) = self.attributes.get(SPAN_PATH) {
                let span_path = format!("{}.{}", path, span_name);
                self.attributes
                    .insert(SPAN_PATH.to_string(), Value::String(span_path));
            }
        }
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
            version: String::from(DEFAULT_VERSION),
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
        if span.span_type == SpanType::LLM && attributes.get("gen_ai.prompt.0.content").is_some() {
            let mut input_messages: Vec<ChatMessage> = vec![];

            let mut i = 0;
            while attributes
                .get(format!("gen_ai.prompt.{}.content", i).as_str())
                .is_some()
            {
                let content = if let Some(serde_json::Value::String(s)) =
                    attributes.get(format!("gen_ai.prompt.{}.content", i).as_str())
                {
                    s.clone()
                } else {
                    "".to_string()
                };

                let role = if let Some(serde_json::Value::String(s)) =
                    attributes.get(format!("gen_ai.prompt.{}.role", i).as_str())
                {
                    s.clone()
                } else {
                    "user".to_string()
                };

                input_messages.push(ChatMessage {
                    role,
                    content: serde_json::from_str::<Vec<InstrumentationChatMessageContentPart>>(
                        &content,
                    )
                    .map(|parts| {
                        ChatMessageContent::ContentPartList(
                            parts.into_iter().map(|part| part.into()).collect(),
                        )
                    })
                    .unwrap_or(ChatMessageContent::Text(content.clone())),
                });
                i += 1;
            }

            span.input = Some(json!(input_messages));
            span.output = if let Some(serde_json::Value::String(s)) =
                attributes.get("gen_ai.completion.0.content")
            {
                Some(serde_json::Value::String(s.clone()))
            } else {
                None
            };
        } else if span.span_type == SpanType::LLM && attributes.get("ai.prompt.message").is_some() {
            // handling the AI SDK auto-instrumentation
            if let Ok(input_messages) = serde_json::from_str::<Vec<ChatMessage>>(
                attributes
                    .get("ai.prompt.messages")
                    .unwrap()
                    .as_str()
                    .unwrap(),
            ) {
                span.input = Some(json!(input_messages));
            }

            if let Some(serde_json::Value::String(s)) = attributes.get("ai.response.object") {
                span.output = Some(serde_json::from_str::<Value>(s).unwrap());
            }
        } else {
            if let Some(serde_json::Value::String(s)) = attributes.get(INPUT_ATTRIBUTE_NAME) {
                span.input = Some(
                    serde_json::from_str::<Value>(s)
                        .unwrap_or(serde_json::Value::String(s.clone())),
                );
            }

            if let Some(serde_json::Value::String(s)) = attributes.get(OUTPUT_ATTRIBUTE_NAME) {
                span.output = Some(
                    serde_json::from_str::<Value>(s)
                        .unwrap_or(serde_json::Value::String(s.clone())),
                );
            }
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
            format!("{ASSOCIATION_PROPERTIES_PREFIX}trace_type",),
            json!(trace_type),
        );
        attributes.insert(SPAN_PATH.to_string(), json!(path));

        Self {
            span_id: Uuid::new_v4(),
            start_time: run_stats.start_time,
            end_time: run_stats.end_time,
            version: String::from(DEFAULT_VERSION),
            trace_id,
            parent_span_id,
            name: name.clone(),
            attributes: serde_json::json!(attributes),
            input: serde_json::to_value(inputs).ok(),
            output: serde_json::to_value(outputs).ok(),
            span_type: SpanType::PIPELINE,
            events: None,
            labels: None,
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
        parent_span_path: String,
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
                    format!("{}.{}", parent_span_path, message.node_name)
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
                    version: String::from(DEFAULT_VERSION),
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
                };
                Some(span)
            })
            .collect()
    }
}

fn span_attributes_from_meta_log(meta_log: Option<MetaLog>, span_path: String) -> Value {
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

    // remove gen_ai.prompt/completion attributes as they are stored in LLM span's input/output
    let pattern = Regex::new(r"gen_ai\.(prompt|completion)\.\d+\.(content|role)").unwrap();
    return !pattern.is_match(attribute);
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
