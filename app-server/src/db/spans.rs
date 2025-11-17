use std::str::FromStr;

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::traces::spans::SpanAttributes;

#[derive(sqlx::Type, Deserialize, Serialize, PartialEq, Clone, Debug, Default)]
#[sqlx(type_name = "span_type")]
pub enum SpanType {
    #[default]
    DEFAULT,
    LLM,
    PIPELINE,
    EXECUTOR,
    EVALUATOR,
    #[allow(non_camel_case_types)]
    HUMAN_EVALUATOR,
    EVALUATION,
    TOOL,
}

impl std::fmt::Display for SpanType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SpanType::DEFAULT => write!(f, "DEFAULT"),
            SpanType::LLM => write!(f, "LLM"),
            SpanType::PIPELINE => write!(f, "PIPELINE"),
            SpanType::EXECUTOR => write!(f, "EXECUTOR"),
            SpanType::EVALUATOR => write!(f, "EVALUATOR"),
            SpanType::HUMAN_EVALUATOR => write!(f, "HUMAN_EVALUATOR"),
            SpanType::EVALUATION => write!(f, "EVALUATION"),
            SpanType::TOOL => write!(f, "TOOL"),
        }
    }
}

impl FromStr for SpanType {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_uppercase().trim() {
            "DEFAULT" | "SPAN" => Ok(SpanType::DEFAULT),
            "LLM" => Ok(SpanType::LLM),
            "PIPELINE" => Ok(SpanType::PIPELINE),
            "EXECUTOR" => Ok(SpanType::EXECUTOR),
            "EVALUATOR" => Ok(SpanType::EVALUATOR),
            "HUMAN_EVALUATOR" => Ok(SpanType::HUMAN_EVALUATOR),
            "EVALUATION" => Ok(SpanType::EVALUATION),
            "TOOL" => Ok(SpanType::TOOL),
            _ => Err(anyhow::anyhow!("Invalid span type: {}", s)),
        }
    }
}

#[derive(Deserialize, Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Span {
    pub span_id: Uuid,
    pub project_id: Uuid,
    pub trace_id: Uuid,
    pub parent_span_id: Option<Uuid>,
    pub name: String,
    pub attributes: SpanAttributes,
    pub input: Option<Value>,
    pub output: Option<Value>,
    pub span_type: SpanType,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub events: Option<Value>,
    pub status: Option<String>,
    pub tags: Option<Value>,
    pub input_url: Option<String>,
    pub output_url: Option<String>,
}

impl Span {
    pub fn should_record_to_clickhouse(&self) -> bool {
        // This function is intented to filter out "signal" spans from record to clickhouse
        // One of the signal spans is the span that carries the attribute to indicate whether
        // the trace has a browser session or not and is named "cdp_use.session".
        !self
            .attributes
            .has_browser_session_attribute()
            .unwrap_or(false)
            && self.name == "cdp_use.session"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::collections::HashMap;

    #[test]
    fn test_prepare_span_db_values_openai() {
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

        let span = Span {
            span_id: Uuid::new_v4(),
            project_id: Uuid::new_v4(),
            trace_id: Uuid::new_v4(),
            parent_span_id: None,
            name: "openai.chat".to_string(),
            attributes: SpanAttributes::new(attributes),
            start_time: Utc::now(),
            end_time: Utc::now(),
            span_type: SpanType::LLM,
            input: Some(json!("test input")),
            output: Some(json!("test output")),
            events: None,
            status: None,
            tags: None,
            input_url: None,
            output_url: None,
        };

        let span_attributes = span.attributes.to_value();

        // Check that the attributes_value is properly structured
        assert!(span_attributes.is_object());
        let attrs = span_attributes.as_object().unwrap();

        // Verify that gen_ai.prompt/completion content and role attributes are REMOVED
        assert!(!attrs.contains_key("gen_ai.prompt.0.role"));
        assert!(!attrs.contains_key("gen_ai.prompt.0.content"));
        assert!(!attrs.contains_key("gen_ai.prompt.1.role"));
        assert!(!attrs.contains_key("gen_ai.prompt.2.role"));
        assert!(!attrs.contains_key("gen_ai.prompt.2.content"));
        assert!(!attrs.contains_key("gen_ai.completion.0.role"));

        // Verify that tool call attributes are PRESERVED
        assert_eq!(
            attrs.get("gen_ai.prompt.1.tool_calls.0.name"),
            Some(&json!("get_weather"))
        );
        assert_eq!(
            attrs.get("gen_ai.prompt.1.tool_calls.0.id"),
            Some(&json!("call_1"))
        );
        assert_eq!(
            attrs.get("gen_ai.prompt.1.tool_calls.0.arguments"),
            Some(&json!("{\"location\": \"San Francisco, CA\"}"))
        );
        assert_eq!(
            attrs.get("gen_ai.completion.0.tool_calls.0.name"),
            Some(&json!("get_time"))
        );
        assert_eq!(
            attrs.get("gen_ai.completion.0.tool_calls.0.id"),
            Some(&json!("call_vqQRzJX8Csv19WyJucQnOUJH"))
        );
        assert_eq!(
            attrs.get("gen_ai.completion.0.tool_calls.0.arguments"),
            Some(&json!("{\"location\":\"San Francisco, CA\"}"))
        );

        // Verify that other attributes are PRESERVED
        assert_eq!(attrs.get("gen_ai.system"), Some(&json!("OpenAI")));
        assert_eq!(
            attrs.get("gen_ai.request.model"),
            Some(&json!("gpt-4.1-nano"))
        );
        assert_eq!(
            attrs.get("gen_ai.response.model"),
            Some(&json!("gpt-4.1-nano-2025-04-14"))
        );
        assert_eq!(
            attrs.get("gen_ai.completion.0.finish_reason"),
            Some(&json!("tool_calls"))
        );
        assert_eq!(attrs.get("gen_ai.usage.prompt_tokens"), Some(&json!(173)));
        assert_eq!(
            attrs.get("gen_ai.usage.completion_tokens"),
            Some(&json!(17))
        );
        assert_eq!(
            attrs.get("gen_ai.prompt.2.tool_call_id"),
            Some(&json!("call_1"))
        );
    }

    #[test]
    fn test_prepare_span_db_values_langchain() {
        // Create a span with LangChain-style attributes with conversation history and tool calls
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
            // Traceloop entity attributes that should be filtered out
            ("traceloop.entity.input".to_string(), json!("some input")),
            ("traceloop.entity.output".to_string(), json!("some output")),
            ("traceloop.entity.path".to_string(), json!("some path")),
        ]);

        let span = Span {
            span_id: Uuid::new_v4(),
            project_id: Uuid::new_v4(),
            trace_id: Uuid::new_v4(),
            parent_span_id: Some(Uuid::new_v4()),
            name: "ChatOpenAI.chat".to_string(),
            attributes: SpanAttributes::new(attributes),
            start_time: Utc::now(),
            end_time: Utc::now(),
            span_type: SpanType::LLM,
            input: Some(json!("test input")),
            output: Some(json!("test output")),
            events: None,
            status: None,
            tags: None,
            input_url: None,
            output_url: None,
        };

        let span_attributes = span.attributes.to_value();

        // Check that the attributes_value is properly structured
        assert!(span_attributes.is_object());
        let attrs = span_attributes.as_object().unwrap();

        // Verify that gen_ai.prompt/completion content and role attributes are REMOVED
        assert!(!attrs.contains_key("gen_ai.prompt.0.role"));
        assert!(!attrs.contains_key("gen_ai.prompt.0.content"));
        assert!(!attrs.contains_key("gen_ai.prompt.1.role"));
        assert!(!attrs.contains_key("gen_ai.prompt.2.role"));
        assert!(!attrs.contains_key("gen_ai.prompt.2.content"));
        assert!(!attrs.contains_key("gen_ai.completion.0.role"));
        assert!(!attrs.contains_key("gen_ai.completion.0.content"));

        // Verify that traceloop.entity attributes are REMOVED
        assert!(!attrs.contains_key("traceloop.entity.input"));
        assert!(!attrs.contains_key("traceloop.entity.output"));
        assert!(!attrs.contains_key("traceloop.entity.path"));

        // Verify that tool call attributes are PRESERVED
        assert_eq!(
            attrs.get("gen_ai.prompt.1.tool_calls.0.name"),
            Some(&json!("get_weather"))
        );
        assert_eq!(
            attrs.get("gen_ai.prompt.1.tool_calls.0.id"),
            Some(&json!("call_1"))
        );
        assert_eq!(
            attrs.get("gen_ai.prompt.1.tool_calls.0.arguments"),
            Some(&json!("{\"location\": \"San Francisco, CA\"}"))
        );
        assert_eq!(
            attrs.get("gen_ai.completion.0.tool_calls.0.name"),
            Some(&json!("get_time"))
        );
        assert_eq!(
            attrs.get("gen_ai.completion.0.tool_calls.0.id"),
            Some(&json!("call_TCZXJQAoVZoeGRcTwN6I7rh1"))
        );
        assert_eq!(
            attrs.get("gen_ai.completion.0.tool_calls.0.arguments"),
            Some(&json!("{\"location\": \"San Francisco, CA\"}"))
        );

        // Verify that LangChain-specific attributes are PRESERVED
        assert_eq!(attrs.get("gen_ai.system"), Some(&json!("Langchain")));
        assert_eq!(
            attrs.get("gen_ai.request.model"),
            Some(&json!("gpt-4.1-nano"))
        );
        assert_eq!(
            attrs.get("gen_ai.response.model"),
            Some(&json!("gpt-4.1-nano-2025-04-14"))
        );
        assert_eq!(
            attrs.get("gen_ai.response.id"),
            Some(&json!("chatcmpl-BpaSv7Z7XDi3F3egHJXBxKPJIVxqg"))
        );
        assert_eq!(
            attrs.get("gen_ai.completion.0.finish_reason"),
            Some(&json!("tool_calls"))
        );
        assert_eq!(attrs.get("gen_ai.usage.prompt_tokens"), Some(&json!(108)));
        assert_eq!(
            attrs.get("gen_ai.usage.completion_tokens"),
            Some(&json!(17))
        );
        assert_eq!(attrs.get("llm.usage.total_tokens"), Some(&json!(125)));
        assert_eq!(
            attrs.get("gen_ai.usage.cache_read_input_tokens"),
            Some(&json!(0))
        );
        assert_eq!(
            attrs.get("gen_ai.prompt.2.tool_call_id"),
            Some(&json!("call_1"))
        );

        // Verify LangChain association properties are PRESERVED
        assert_eq!(
            attrs.get("lmnr.association.properties.ls_provider"),
            Some(&json!("openai"))
        );
        assert_eq!(
            attrs.get("lmnr.association.properties.ls_model_name"),
            Some(&json!("gpt-4.1-nano"))
        );
        assert_eq!(
            attrs.get("lmnr.association.properties.ls_model_type"),
            Some(&json!("chat"))
        );
        assert_eq!(attrs.get("llm.request.type"), Some(&json!("chat")));

        // Verify function metadata is PRESERVED
        assert_eq!(
            attrs.get("llm.request.functions.0.name"),
            Some(&json!("get_weather"))
        );
        assert_eq!(
            attrs.get("llm.request.functions.1.name"),
            Some(&json!("get_time"))
        );
        assert_eq!(
            attrs.get("llm.request.functions.2.name"),
            Some(&json!("get_city_population"))
        );

        // Verify path and instrumentation metadata are PRESERVED
        assert_eq!(
            attrs.get("lmnr.span.path"),
            Some(&json!([
                "integration/0150_langchain_tool_calls_with_history",
                "ChatOpenAI.chat"
            ]))
        );
        assert_eq!(
            attrs.get("lmnr.span.ids_path"),
            Some(&json!([
                "00000000-0000-0000-f961-aebceb94f98a",
                "00000000-0000-0000-46eb-a5ee110c65db"
            ]))
        );
        assert_eq!(
            attrs.get("lmnr.span.instrumentation_source"),
            Some(&json!("python"))
        );
        assert_eq!(attrs.get("lmnr.span.sdk_version"), Some(&json!("0.6.16")));
        assert_eq!(
            attrs.get("lmnr.span.language_version"),
            Some(&json!("python@3.13"))
        );
    }

    #[test]
    fn test_prepare_span_db_values_ai_sdk() {
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
                json!(
                    "[{\"role\":\"system\",\"content\":\"You are a helpful assistant.\"},{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"What is the weather in SF?\"}]}]"
                ),
            ),
            (
                "ai.prompt.tools".to_string(),
                json!([
                    "{\"type\":\"function\",\"name\":\"get_weather\",\"description\":\"Get the weather in a given location\",\"parameters\":{\"type\":\"object\",\"properties\":{\"location\":{\"type\":\"string\",\"description\":\"The city and state, e.g. San Francisco, CA\"}},\"required\":[\"location\"],\"additionalProperties\":false,\"$schema\":\"http://json-schema.org/draft-07/schema#\"}}",
                    "{\"type\":\"function\",\"name\":\"get_time\",\"description\":\"Get the time in a given location\",\"parameters\":{\"type\":\"object\",\"properties\":{\"location\":{\"type\":\"string\",\"description\":\"The city and state, e.g. San Francisco, CA\"}},\"required\":[\"location\"],\"additionalProperties\":false,\"$schema\":\"http://json-schema.org/draft-07/schema#\"}}"
                ]),
            ),
            (
                "ai.prompt.toolChoice".to_string(),
                json!("{\"type\":\"auto\"}"),
            ),
            ("gen_ai.system".to_string(), json!("openai.chat")),
            ("gen_ai.request.model".to_string(), json!("gpt-4.1-nano")),
            (
                "lmnr.span.ids_path".to_string(),
                json!([
                    "00000000-0000-0000-f961-aebceb94f98a",
                    "00000000-0000-0000-46eb-a5ee110c65db"
                ]),
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
                json!(
                    "[{\"toolCallType\":\"function\",\"toolCallId\":\"call_akUJWoAUcWDcvNJzcZx3MzPg\",\"toolName\":\"get_weather\",\"args\":\"{\\\"location\\\":\\\"San Francisco, CA\\\"}\"}]"
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
            // AI SDK attributes that should be filtered out
            (
                "ai.prompt".to_string(),
                json!(
                    "{\"system\":\"You are a helpful assistant.\",\"messages\":[{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"What is the weather in SF?\"}]}]}"
                ),
            ),
            // Laminar internal attributes that should be filtered out
            ("lmnr.span.input".to_string(), json!("some input")),
            ("lmnr.span.output".to_string(), json!("some output")),
        ]);

        let span = Span {
            span_id: Uuid::new_v4(),
            project_id: Uuid::new_v4(),
            trace_id: Uuid::new_v4(),
            parent_span_id: Some(Uuid::new_v4()),
            name: "ai.generateText.doGenerate".to_string(),
            attributes: SpanAttributes::new(child_attributes),
            start_time: Utc::now(),
            end_time: Utc::now(),
            span_type: SpanType::LLM,
            input: Some(json!("test input")),
            output: Some(json!("test output")),
            events: None,
            status: None,
            tags: None,
            input_url: None,
            output_url: None,
        };

        let span_attributes = span.attributes.to_value();

        // Check that the attributes_value is properly structured
        assert!(span_attributes.is_object());
        let attrs = span_attributes.as_object().unwrap();

        // Verify that AI SDK attributes are REMOVED
        assert!(!attrs.contains_key("ai.prompt.messages"));
        assert!(!attrs.contains_key("ai.prompt"));

        // Verify that Laminar internal attributes are REMOVED
        assert!(!attrs.contains_key("lmnr.span.input"));
        assert!(!attrs.contains_key("lmnr.span.output"));

        // Verify that other AI SDK attributes are PRESERVED
        assert_eq!(
            attrs.get("operation.name"),
            Some(&json!("ai.generateText.doGenerate"))
        );
        assert_eq!(
            attrs.get("ai.operationId"),
            Some(&json!("ai.generateText.doGenerate"))
        );
        assert_eq!(attrs.get("ai.model.provider"), Some(&json!("openai.chat")));
        assert_eq!(attrs.get("ai.model.id"), Some(&json!("gpt-4.1-nano")));
        assert_eq!(attrs.get("ai.settings.maxRetries"), Some(&json!(2)));
        assert_eq!(attrs.get("ai.prompt.format"), Some(&json!("messages")));
        assert_eq!(
            attrs.get("ai.prompt.toolChoice"),
            Some(&json!("{\"type\":\"auto\"}"))
        );

        // Verify GenAI attributes are PRESERVED
        assert_eq!(attrs.get("gen_ai.system"), Some(&json!("openai.chat")));
        assert_eq!(
            attrs.get("gen_ai.request.model"),
            Some(&json!("gpt-4.1-nano"))
        );
        assert_eq!(
            attrs.get("gen_ai.response.finish_reasons"),
            Some(&json!(["tool-calls"]))
        );
        assert_eq!(
            attrs.get("gen_ai.response.id"),
            Some(&json!("chatcmpl-BpafAvtYoJBBUQpui72D8vHSt8CDp"))
        );
        assert_eq!(
            attrs.get("gen_ai.response.model"),
            Some(&json!("gpt-4.1-nano-2025-04-14"))
        );
        assert_eq!(attrs.get("gen_ai.usage.input_tokens"), Some(&json!(108)));
        assert_eq!(attrs.get("gen_ai.usage.output_tokens"), Some(&json!(17)));

        // Verify response attributes are PRESERVED
        assert_eq!(
            attrs.get("ai.response.finishReason"),
            Some(&json!("tool-calls"))
        );
        assert_eq!(
            attrs.get("ai.response.toolCalls"),
            Some(&json!(
                "[{\"toolCallType\":\"function\",\"toolCallId\":\"call_akUJWoAUcWDcvNJzcZx3MzPg\",\"toolName\":\"get_weather\",\"args\":\"{\\\"location\\\":\\\"San Francisco, CA\\\"}\"}]"
            ))
        );
        assert_eq!(
            attrs.get("ai.response.id"),
            Some(&json!("chatcmpl-BpafAvtYoJBBUQpui72D8vHSt8CDp"))
        );
        assert_eq!(
            attrs.get("ai.response.model"),
            Some(&json!("gpt-4.1-nano-2025-04-14"))
        );
        assert_eq!(
            attrs.get("ai.response.timestamp"),
            Some(&json!("2025-07-04T13:22:40.000Z"))
        );

        // Verify usage attributes are PRESERVED
        assert_eq!(attrs.get("ai.usage.promptTokens"), Some(&json!(108)));
        assert_eq!(attrs.get("ai.usage.completionTokens"), Some(&json!(17)));

        // Verify path and instrumentation metadata are PRESERVED
        assert_eq!(
            attrs.get("lmnr.span.path"),
            Some(&json!(["ai.generateText", "ai.generateText.doGenerate"]))
        );
        assert_eq!(
            attrs.get("lmnr.span.ids_path"),
            Some(&json!([
                "00000000-0000-0000-f961-aebceb94f98a",
                "00000000-0000-0000-46eb-a5ee110c65db"
            ]))
        );
        assert_eq!(
            attrs.get("lmnr.span.instrumentation_source"),
            Some(&json!("javascript"))
        );
        assert_eq!(attrs.get("lmnr.span.sdk_version"), Some(&json!("0.6.13")));
        assert_eq!(
            attrs.get("lmnr.span.language_version"),
            Some(&json!("node@23.3.0"))
        );
    }
}
