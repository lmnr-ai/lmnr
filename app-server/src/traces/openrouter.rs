//! OpenRouter Broadcast ingestion.
//!
//! Its "OpenTelemetry Collector" destination posts OTLP spans whose vocabulary
//! overlaps the GenAI conventions only for model/usage attributes:
//!
//! - `gen_ai.prompt` — JSON string, `{"messages": [<OpenAI chat messages>]}`
//! - `gen_ai.completion` — JSON string, `{"completion", "reasoning", "toolCalls"}`
//! - `span.input` / `span.output` — duplicates of the two above
//! - `span.type` — `generation` for the model call, `span` for its children
//! - `trace.metadata.openrouter.*` — emitter marker

use std::collections::HashMap;

use indexmap::IndexMap;
use serde_json::{Value, json};

use crate::{
    traces::{
        span_attributes::{
            GEN_AI_COMPLETION, GEN_AI_PROMPT, OPENROUTER_METADATA_PREFIX, OPENROUTER_SPAN_INPUT,
            OPENROUTER_SPAN_OUTPUT, OPENROUTER_SPAN_TYPE,
        },
        spans::{self, SpanAttributes},
        utils::serialize_indexmap,
    },
    utils::json_value_to_string,
};

const GENERATION_SPAN_TYPE: &str = "generation";

/// Matched on the vendor prefix, not on `trace.metadata.openrouter.source`:
/// `source` is only on the generation span, children carry other keys.
pub fn is_openrouter_span(attributes: &SpanAttributes) -> bool {
    attributes
        .raw_attributes
        .keys()
        .any(|key| key.starts_with(OPENROUTER_METADATA_PREFIX))
}

/// The `provider attempt N: <provider>` children, which carry
/// `gen_ai.operation.name = "chat"` with no model or usage of their own and
/// would otherwise be typed LLM.
pub fn is_non_generation_span(attributes: &SpanAttributes) -> bool {
    matches!(
        attributes.string_attr(OPENROUTER_SPAN_TYPE),
        Some(kind) if kind != GENERATION_SPAN_TYPE
    ) && is_openrouter_span(attributes)
}

pub fn take_input(attributes: &mut HashMap<String, Value>) -> Option<Value> {
    take_payload(
        attributes,
        &[GEN_AI_PROMPT, OPENROUTER_SPAN_INPUT],
        parse_prompt,
    )
}

pub fn take_output(attributes: &mut HashMap<String, Value>) -> Option<Value> {
    take_payload(
        attributes,
        &[GEN_AI_COMPLETION, OPENROUTER_SPAN_OUTPUT],
        parse_completion,
    )
}

/// Both copies are removed rather than read, or the conversation lands in the
/// ClickHouse attributes blob twice. An unrecognised payload is put back —
/// better a raw attribute than a dropped one.
fn take_payload(
    attributes: &mut HashMap<String, Value>,
    keys: &[&str],
    parse: impl Fn(&Value) -> Option<Value>,
) -> Option<Value> {
    let mut parsed = None;
    for key in keys {
        let Some(raw) = attributes.remove(*key) else {
            continue;
        };
        match parse(&raw) {
            Some(value) => parsed = parsed.or(Some(value)),
            None => {
                attributes.insert((*key).to_string(), raw);
            }
        }
    }
    parsed
}

/// Verbatim pass-through: the messages are already OpenAI chat format, and
/// `ChatMessage` conversion would drop assistant `tool_calls`. `None` unless the
/// value really holds a message array, so OpenLIT's plain-string `gen_ai.prompt`
/// is left alone.
fn parse_prompt(value: &Value) -> Option<Value> {
    let parsed = spans::parse_genai_messages_attribute(value);
    let messages = match parsed {
        Value::Object(mut map) => map.remove("messages")?,
        // Some collectors unwrap the envelope before forwarding.
        array @ Value::Array(_) => array,
        _ => return None,
    };
    match &messages {
        Value::Array(arr) if !arr.is_empty() => Some(messages),
        _ => None,
    }
}

/// Emitted in the GenAI `{role, parts}` shape, not as a `ChatMessage`: the only
/// shape the frontend renders with a "Thinking" label, and
/// `ChatMessageContentPart` has no reasoning variant.
fn parse_completion(value: &Value) -> Option<Value> {
    let parsed = spans::parse_genai_messages_attribute(value);
    let completion = parsed.as_object()?;

    // The "send test trace" button posts a raw chat-completion object instead.
    if let Some(message) = completion
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
    {
        return Some(json!([message]));
    }

    let mut parts = Vec::new();
    // Reasoning first — it precedes the answer in the model's own output.
    if let Some(reasoning) = text_part_content(completion.get("reasoning")) {
        parts.push(json!({"type": "thinking", "content": reasoning}));
    }
    if let Some(content) = text_part_content(completion.get("completion")) {
        parts.push(json!({"type": "text", "content": content}));
    }
    parts.extend(
        completion
            .get("toolCalls")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(tool_call_part),
    );

    if parts.is_empty() {
        return None;
    }
    Some(json!([{"role": "assistant", "parts": parts}]))
}

/// Skips the `null` / `""` OpenRouter sends for fields the generation didn't use.
fn text_part_content(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::String(s) => Some(s.clone()).filter(|s| !s.is_empty()),
        Value::Null => None,
        // A structured value (e.g. multimodal content) still beats dropping it.
        other => Some(json_value_to_string(other)),
    }
}

/// Accepts both the OpenAI wire shape (`{id, function: {name, arguments}}`) and
/// the flat camelCase shape OpenRouter's own SDK types use.
fn tool_call_part(tool_call: &Value) -> Option<Value> {
    let tool_call = tool_call.as_object()?;
    let function = tool_call.get("function").and_then(Value::as_object);

    let name = function
        .and_then(|function| function.get("name"))
        .or(tool_call.get("name"))
        .or(tool_call.get("toolName"))
        .and_then(Value::as_str)?;
    let arguments = function
        .and_then(|function| function.get("arguments"))
        .or(tool_call.get("arguments"))
        .or(tool_call.get("args"));

    let mut part = json!({"type": "tool_call", "name": name});
    if let Some(id) = tool_call
        .get("id")
        .or(tool_call.get("toolCallId"))
        .and_then(Value::as_str)
    {
        part["id"] = json!(id);
    }
    if let Some(arguments) = arguments {
        part["arguments"] = parse_tool_call_arguments(arguments);
    }
    Some(part)
}

/// Arguments are a JSON string; `IndexMap` keeps their order across the parse.
fn parse_tool_call_arguments(arguments: &Value) -> Value {
    match arguments {
        Value::String(s) => serde_json::from_str::<IndexMap<String, Value>>(s)
            .ok()
            .and_then(serialize_indexmap)
            .unwrap_or(arguments.clone()),
        other => other.clone(),
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;

    #[test]
    fn detects_openrouter_spans() {
        // Children carry no `source`, only other keys under the same prefix.
        for key in [
            "trace.metadata.openrouter.source",
            "trace.metadata.openrouter.provider_name",
        ] {
            let attributes =
                SpanAttributes::new(HashMap::from([(key.to_string(), json!("openrouter"))]));
            assert!(is_openrouter_span(&attributes));
        }

        let other = SpanAttributes::new(HashMap::from([(
            "trace.metadata.environment".to_string(),
            json!("production"),
        )]));
        assert!(!is_openrouter_span(&other));

        assert!(!is_openrouter_span(&SpanAttributes::default()));
    }

    #[test]
    fn detects_provider_attempt_spans() {
        let provider_attempt = SpanAttributes::new(HashMap::from([
            (
                "trace.metadata.openrouter.provider_name".to_string(),
                json!("OpenAI"),
            ),
            (OPENROUTER_SPAN_TYPE.to_string(), json!("span")),
        ]));
        assert!(is_non_generation_span(&provider_attempt));

        let generation = SpanAttributes::new(HashMap::from([
            (
                "trace.metadata.openrouter.source".to_string(),
                json!("openrouter"),
            ),
            (OPENROUTER_SPAN_TYPE.to_string(), json!("generation")),
        ]));
        assert!(!is_non_generation_span(&generation));

        // `span.type` alone, from any other emitter, means nothing here.
        let unmarked = SpanAttributes::new(HashMap::from([(
            OPENROUTER_SPAN_TYPE.to_string(),
            json!("span"),
        )]));
        assert!(!is_non_generation_span(&unmarked));
    }

    #[test]
    fn parses_prompt_from_json_string() {
        let prompt = json!(
            r#"{"messages":[{"role":"system","content":"Be brief."},{"role":"user","content":"Hi"}]}"#
        );
        assert_eq!(
            parse_prompt(&prompt).unwrap(),
            json!([
                {"role": "system", "content": "Be brief."},
                {"role": "user", "content": "Hi"}
            ])
        );
    }

    #[test]
    fn parses_prompt_preserving_tool_calls() {
        let prompt = json!({"messages": [
            {"role": "user", "content": "weather?"},
            {
                "role": "assistant",
                "content": null,
                "tool_calls": [{
                    "id": "call_1",
                    "type": "function",
                    "function": {"name": "get_weather", "arguments": "{\"city\":\"Paris\"}"}
                }]
            },
            {"role": "tool", "tool_call_id": "call_1", "content": "18C"}
        ]});
        let parsed = parse_prompt(&prompt).unwrap();
        // Verbatim pass-through: the assistant tool call must survive.
        assert_eq!(parsed, prompt.get("messages").unwrap().clone());
    }

    #[test]
    fn ignores_non_message_prompts() {
        // OpenLIT sends a bare prompt string under the same key.
        assert!(parse_prompt(&json!("just a prompt")).is_none());
        assert!(parse_prompt(&json!({"messages": []})).is_none());
        assert!(parse_prompt(&json!({"prompt": "hi"})).is_none());
    }

    #[test]
    fn parses_completion_text_only() {
        let completion = json!(r#"{"completion":"Hello!","reasoning":null,"toolCalls":[]}"#);
        assert_eq!(
            parse_completion(&completion).unwrap(),
            json!([{"role": "assistant", "parts": [{"type": "text", "content": "Hello!"}]}])
        );
    }

    #[test]
    fn parses_completion_with_reasoning_and_tool_calls() {
        let completion = json!({
            "completion": "Checking the forecast.",
            "reasoning": "The user asked about weather.",
            "toolCalls": [{
                "id": "call_1",
                "type": "function",
                "function": {"name": "get_weather", "arguments": "{\"city\":\"Paris\"}"}
            }]
        });
        assert_eq!(
            parse_completion(&completion).unwrap(),
            json!([{
                "role": "assistant",
                "parts": [
                    {"type": "thinking", "content": "The user asked about weather."},
                    {"type": "text", "content": "Checking the forecast."},
                    {
                        "type": "tool_call",
                        "name": "get_weather",
                        "id": "call_1",
                        "arguments": {"city": "Paris"}
                    }
                ]
            }])
        );
    }

    #[test]
    fn parses_completion_with_flat_tool_calls() {
        let completion = json!({
            "completion": "",
            "toolCalls": [{"toolCallId": "call_2", "toolName": "search", "args": {"q": "lmnr"}}]
        });
        assert_eq!(
            parse_completion(&completion).unwrap(),
            json!([{
                "role": "assistant",
                "parts": [{
                    "type": "tool_call",
                    "name": "search",
                    "id": "call_2",
                    "arguments": {"q": "lmnr"}
                }]
            }])
        );
    }

    #[test]
    fn parses_completion_from_a_chat_completion_object() {
        // What the "send test trace" button posts.
        let completion = json!(
            r#"{"id":"chatcmpl-test123","object":"chat.completion","choices":[{"index":0,"message":{"role":"assistant","content":"The capital of France is Paris."},"finish_reason":"stop"}],"usage":{"prompt_tokens":50}}"#
        );
        assert_eq!(
            parse_completion(&completion).unwrap(),
            json!([{"role": "assistant", "content": "The capital of France is Paris."}])
        );
    }

    #[test]
    fn take_consumes_recognised_payloads_and_restores_the_rest() {
        let prompt = json!(r#"{"messages":[{"role":"user","content":"Hi"}]}"#);
        let mut attributes = HashMap::from([
            (GEN_AI_PROMPT.to_string(), prompt.clone()),
            // OpenRouter sends the same payload twice; both copies must go.
            (OPENROUTER_SPAN_INPUT.to_string(), prompt),
            (GEN_AI_COMPLETION.to_string(), json!("not an object")),
        ]);

        assert_eq!(
            take_input(&mut attributes).unwrap(),
            json!([{"role": "user", "content": "Hi"}])
        );
        assert!(!attributes.contains_key(GEN_AI_PROMPT));
        assert!(!attributes.contains_key(OPENROUTER_SPAN_INPUT));

        assert!(take_output(&mut attributes).is_none());
        // Unparseable payloads stay in the attributes instead of vanishing.
        assert_eq!(
            attributes.get(GEN_AI_COMPLETION),
            Some(&json!("not an object"))
        );
    }

    #[test]
    fn ignores_empty_completions() {
        assert!(
            parse_completion(&json!(
                r#"{"completion":"","reasoning":null,"toolCalls":[]}"#
            ))
            .is_none()
        );
        assert!(parse_completion(&json!("not an object")).is_none());
    }
}
