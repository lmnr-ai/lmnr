#![cfg_attr(not(feature = "signals"), allow(dead_code))]

//! Conversions between the internal Gemini-shaped `ProviderRequest`/`ProviderResponse`
//! types and OpenAI Chat Completions wire format.
//!
//! The internal types model tool calls/results as parts (`function_call` /
//! `function_response`) under whatever role's content array they appear in.
//! OpenAI splits them across two separate messages: the assistant message
//! carrying `tool_calls[]`, and a subsequent `role: "tool"` message keyed by
//! `tool_call_id` for each tool result. The request converter unpacks the
//! internal shape into the OpenAI shape, and the response parser does the
//! inverse.

use super::OpenAIError;
use crate::llm::models::{
    ProviderCandidate, ProviderContent, ProviderFinishReason, ProviderFunctionCall, ProviderPart,
    ProviderRequest, ProviderResponse, ProviderThinkingLevel, ProviderUsageMetadata,
};
use serde_json::{Value, json};

/// Build the OpenAI Chat Completions request body from a `ProviderRequest`.
pub fn provider_request_to_openai_body(
    model: &str,
    request: &ProviderRequest,
    is_openai_direct: bool,
) -> Value {
    let mut messages: Vec<Value> = Vec::new();

    if let Some(sys) = request.system_instruction.as_ref() {
        let text = concat_text_parts(sys);
        if !text.is_empty() {
            messages.push(json!({
                "role": "system",
                "content": text,
            }));
        }
    }

    for content in &request.contents {
        append_content_as_messages(content, &mut messages);
    }

    let mut body = json!({
        "model": model,
        "messages": messages,
    });

    let mut has_tools = false;
    if let Some(tools) = request.tools.as_ref() {
        let tool_array: Vec<Value> = tools
            .iter()
            .flat_map(|t| &t.function_declarations)
            .map(|f| {
                json!({
                    "type": "function",
                    "function": {
                        "name": f.name,
                        "description": f.description,
                        "parameters": f.parameters,
                    },
                })
            })
            .collect();
        if !tool_array.is_empty() {
            body["tools"] = Value::Array(tool_array);
            has_tools = true;
        }
    }

    if let Some(gc) = request.generation_config.as_ref() {
        // We deliberately don't forward `temperature` / `top_p`. All
        // current call sites use the default (1.0), and several model
        // families fronted by OpenAI-compatible proxies (gpt-5 / o-series
        // / Claude 4+ with extended thinking) reject any explicit
        // non-default value with HTTP 400. Letting the upstream pick its
        // default keeps every model happy.
        if let Some(m) = gc.max_output_tokens {
            body["max_completion_tokens"] = json!(m);
        }

        // gpt-5 reasoning models reject `reasoning_effort` + function tools on
        // /v1/chat/completions (400, "use /v1/responses instead") — both direct
        // and via proxies that forward to OpenAI. Drop it when tools are present.
        // OpenAI-direct also 400s on some reasoning models without tools, so keep
        // suppressing there too.
        if !has_tools && !is_openai_direct {
            if let Some(tc) = gc.thinking_config.as_ref() {
                if let Some(level) = tc.thinking_level.as_ref() {
                    if let Some(effort) = thinking_level_to_effort(level) {
                        body["reasoning_effort"] = json!(effort);
                    }
                }
            }
        }
    }

    body
}

/// Same as [`provider_request_to_openai_body`] but flags the request for SSE streaming and asks
/// the upstream to emit a final usage-only chunk (`stream_options.include_usage`).
pub fn provider_request_to_openai_stream_body(
    model: &str,
    request: &ProviderRequest,
    is_openai_direct: bool,
) -> Value {
    let mut body = provider_request_to_openai_body(model, request, is_openai_direct);
    body["stream"] = json!(true);
    body["stream_options"] = json!({ "include_usage": true });
    body
}

fn thinking_level_to_effort(level: &ProviderThinkingLevel) -> Option<&'static str> {
    match level {
        ProviderThinkingLevel::ThinkingLevelUnspecified => None,
        ProviderThinkingLevel::Minimal => Some("minimal"),
        ProviderThinkingLevel::Low => Some("low"),
        ProviderThinkingLevel::Medium => Some("medium"),
        ProviderThinkingLevel::High => Some("high"),
    }
}

fn concat_text_parts(content: &ProviderContent) -> String {
    let Some(parts) = content.parts.as_ref() else {
        return String::new();
    };
    let mut out = String::new();
    for part in parts {
        if part.thought == Some(true) {
            continue;
        }
        if let Some(t) = &part.text {
            out.push_str(t);
        }
    }
    out
}

/// Expand one internal `ProviderContent` into one (or more) OpenAI messages.
///
/// Assistant turns may contain a mix of text + `function_call` parts, and we
/// emit them as a single assistant message with both `content` and `tool_calls`.
/// Any `function_response` parts in the same content (regardless of role) are
/// flushed as separate `role: "tool"` messages keyed by `tool_call_id`.
fn append_content_as_messages(content: &ProviderContent, out: &mut Vec<Value>) {
    let raw_role = content.role.as_deref().unwrap_or("user");
    let role = match raw_role {
        "assistant" | "model" => "assistant",
        "system" => "system",
        // "user" or anything else (e.g. "tool" itself, "function") -> "user".
        // Tool results are detected from `function_response` parts below, not the role.
        _ => "user",
    };

    let parts = content.parts.as_ref().cloned().unwrap_or_default();

    let mut text_buf = String::new();
    let mut tool_calls: Vec<Value> = Vec::new();
    let mut tool_results: Vec<Value> = Vec::new();

    for part in parts {
        if part.thought == Some(true) {
            continue;
        }
        if let Some(fr) = part.function_response {
            let tool_call_id = fr.id.unwrap_or_default();
            let content_str =
                serde_json::to_string(&fr.response).unwrap_or_else(|_| "".to_string());
            tool_results.push(json!({
                "role": "tool",
                "tool_call_id": tool_call_id,
                "content": content_str,
            }));
            continue;
        }
        if let Some(fc) = part.function_call {
            let id = fc.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
            let args = fc.args.unwrap_or(Value::Object(Default::default()));
            let arguments_str = serde_json::to_string(&args).unwrap_or_else(|_| "{}".to_string());
            tool_calls.push(json!({
                "id": id,
                "type": "function",
                "function": {
                    "name": fc.name,
                    "arguments": arguments_str,
                },
            }));
            continue;
        }
        if let Some(t) = part.text {
            text_buf.push_str(&t);
        }
    }

    let has_text = !text_buf.is_empty();
    let has_tool_calls = !tool_calls.is_empty();

    if has_text || has_tool_calls {
        let mut msg = json!({"role": role});
        // OpenAI accepts `content: null` on assistant messages that only have
        // tool_calls. Otherwise send the accumulated text.
        msg["content"] = if has_text {
            Value::String(text_buf)
        } else {
            Value::Null
        };
        if has_tool_calls {
            msg["tool_calls"] = Value::Array(tool_calls);
        }
        out.push(msg);
    }

    out.extend(tool_results);
}

/// Parse an OpenAI Chat Completions response JSON into a `ProviderResponse`.
pub fn parse_openai_response(value: Value) -> Result<ProviderResponse, OpenAIError> {
    let choices = value
        .get("choices")
        .and_then(|c| c.as_array())
        .cloned()
        .unwrap_or_default();

    let mut candidates: Vec<ProviderCandidate> = Vec::new();
    for choice in choices {
        let finish_reason = choice
            .get("finish_reason")
            .and_then(|f| f.as_str())
            .map(map_finish_reason);

        let message = choice.get("message");
        let role = message
            .and_then(|m| m.get("role"))
            .and_then(|r| r.as_str())
            .map(|_| "model".to_string());

        let mut parts: Vec<ProviderPart> = Vec::new();

        if let Some(content_val) = message.and_then(|m| m.get("content")) {
            if let Some(text) = content_val.as_str() {
                if !text.is_empty() {
                    parts.push(ProviderPart {
                        text: Some(text.to_string()),
                        ..Default::default()
                    });
                }
            } else if let Some(arr) = content_val.as_array() {
                // OpenAI also supports `content: [{type: "text", text: "..."}, ...]`
                // when sending multimodal input; some upstream proxies echo it.
                let mut combined = String::new();
                for piece in arr {
                    if let Some(t) = piece
                        .get("text")
                        .and_then(|x| x.as_str())
                        .or_else(|| piece.as_str())
                    {
                        combined.push_str(t);
                    }
                }
                if !combined.is_empty() {
                    parts.push(ProviderPart {
                        text: Some(combined),
                        ..Default::default()
                    });
                }
            }
        }

        if let Some(tool_calls) = message
            .and_then(|m| m.get("tool_calls"))
            .and_then(|t| t.as_array())
        {
            for tc in tool_calls {
                let id = tc.get("id").and_then(|v| v.as_str()).map(|s| s.to_string());
                let func = tc.get("function");
                let name = func
                    .and_then(|f| f.get("name"))
                    .and_then(|n| n.as_str())
                    .unwrap_or("")
                    .to_string();
                let args = func
                    .and_then(|f| f.get("arguments"))
                    .and_then(|a| a.as_str())
                    .and_then(|s| serde_json::from_str::<Value>(s).ok())
                    .or_else(|| {
                        // Some gateways pre-parse `arguments` into an object.
                        func.and_then(|f| f.get("arguments")).cloned()
                    });
                parts.push(ProviderPart {
                    function_call: Some(ProviderFunctionCall { id, name, args }),
                    ..Default::default()
                });
            }
        }

        candidates.push(ProviderCandidate {
            content: Some(ProviderContent {
                role,
                parts: Some(parts),
            }),
            finish_reason,
        });
    }

    let usage = value.get("usage").map(parse_usage);
    let model_version = value
        .get("model")
        .and_then(|m| m.as_str())
        .map(|s| s.to_string());

    Ok(ProviderResponse {
        candidates: if candidates.is_empty() {
            None
        } else {
            Some(candidates)
        },
        usage_metadata: usage,
        model_version,
    })
}

pub(super) fn map_finish_reason(s: &str) -> ProviderFinishReason {
    match s {
        "stop" | "tool_calls" | "function_call" => ProviderFinishReason::Stop,
        "length" => ProviderFinishReason::MaxTokens,
        "content_filter" => ProviderFinishReason::Safety,
        other => ProviderFinishReason::Other(other.to_string()),
    }
}

pub(super) fn parse_usage(usage: &Value) -> ProviderUsageMetadata {
    let prompt_tokens = usage
        .get("prompt_tokens")
        .and_then(|v| v.as_i64())
        .map(|v| v as i32);
    let completion_tokens = usage
        .get("completion_tokens")
        .and_then(|v| v.as_i64())
        .map(|v| v as i32);
    let total_tokens = usage
        .get("total_tokens")
        .and_then(|v| v.as_i64())
        .map(|v| v as i32);
    let cached_tokens = usage
        .get("prompt_tokens_details")
        .and_then(|d| d.get("cached_tokens"))
        .and_then(|v| v.as_i64())
        .map(|v| v as i32);

    ProviderUsageMetadata {
        prompt_token_count: prompt_tokens,
        candidates_token_count: completion_tokens,
        total_token_count: total_tokens,
        cache_read_input_tokens: cached_tokens,
        cache_creation_input_tokens: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::llm::models::{
        ProviderContent, ProviderFunctionDeclaration, ProviderFunctionResponse,
        ProviderGenerationConfig, ProviderPart, ProviderRequest, ProviderThinkingConfig,
        ProviderThinkingLevel, ProviderTool,
    };

    fn text_part(s: &str) -> ProviderPart {
        ProviderPart {
            text: Some(s.to_string()),
            ..Default::default()
        }
    }

    fn user(text: &str) -> ProviderContent {
        ProviderContent {
            role: Some("user".to_string()),
            parts: Some(vec![text_part(text)]),
        }
    }

    fn assistant_with_tool_call(id: Option<&str>, name: &str, args: Value) -> ProviderContent {
        ProviderContent {
            role: Some("model".to_string()),
            parts: Some(vec![ProviderPart {
                function_call: Some(ProviderFunctionCall {
                    id: id.map(|s| s.to_string()),
                    name: name.to_string(),
                    args: Some(args),
                }),
                ..Default::default()
            }]),
        }
    }

    fn tool_response(id: Option<&str>, name: &str, response: Value) -> ProviderContent {
        ProviderContent {
            role: Some("user".to_string()),
            parts: Some(vec![ProviderPart {
                function_response: Some(ProviderFunctionResponse {
                    id: id.map(|s| s.to_string()),
                    name: name.to_string(),
                    response,
                }),
                ..Default::default()
            }]),
        }
    }

    #[test]
    fn maps_system_and_user_messages() {
        let req = ProviderRequest {
            contents: vec![user("Hello")],
            system_instruction: Some(ProviderContent {
                role: None,
                parts: Some(vec![text_part("Be terse")]),
            }),
            tools: None,
            generation_config: None,
            provider: None,
            model_size: None,
        };
        let body = provider_request_to_openai_body("gpt-5-mini", &req, true);
        let messages = body["messages"].as_array().unwrap();
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0]["role"], "system");
        assert_eq!(messages[0]["content"], "Be terse");
        assert_eq!(messages[1]["role"], "user");
        assert_eq!(messages[1]["content"], "Hello");
        assert_eq!(body["model"], "gpt-5-mini");
    }

    #[test]
    fn multi_turn_with_tool_call_and_tool_result() {
        let req = ProviderRequest {
            contents: vec![
                user("Find weather"),
                assistant_with_tool_call(Some("call_1"), "get_weather", json!({"city": "SF"})),
                tool_response(Some("call_1"), "get_weather", json!({"temp": 60})),
                user("Thanks"),
            ],
            system_instruction: None,
            tools: None,
            generation_config: None,
            provider: None,
            model_size: None,
        };
        let body = provider_request_to_openai_body("gpt-5", &req, true);
        let messages = body["messages"].as_array().unwrap();
        assert_eq!(messages.len(), 4);
        assert_eq!(messages[0]["role"], "user");
        assert_eq!(messages[0]["content"], "Find weather");
        assert_eq!(messages[1]["role"], "assistant");
        assert!(messages[1]["content"].is_null());
        let tc = &messages[1]["tool_calls"][0];
        assert_eq!(tc["id"], "call_1");
        assert_eq!(tc["function"]["name"], "get_weather");
        assert_eq!(tc["function"]["arguments"], "{\"city\":\"SF\"}");
        assert_eq!(messages[2]["role"], "tool");
        assert_eq!(messages[2]["tool_call_id"], "call_1");
        assert_eq!(messages[2]["content"], "{\"temp\":60}");
        assert_eq!(messages[3]["role"], "user");
        assert_eq!(messages[3]["content"], "Thanks");
    }

    #[test]
    fn missing_tool_call_id_gets_uuid() {
        let req = ProviderRequest {
            contents: vec![assistant_with_tool_call(None, "f", json!({}))],
            system_instruction: None,
            tools: None,
            generation_config: None,
            provider: None,
            model_size: None,
        };
        let body = provider_request_to_openai_body("gpt-5", &req, true);
        let id = body["messages"][0]["tool_calls"][0]["id"].as_str().unwrap();
        // uuid v4 is 36 chars with 4 hyphens.
        assert_eq!(id.len(), 36);
        assert_eq!(id.chars().filter(|c| *c == '-').count(), 4);
    }

    #[test]
    fn tools_are_translated_to_chat_completions_shape() {
        let req = ProviderRequest {
            contents: vec![user("hi")],
            system_instruction: None,
            tools: Some(vec![ProviderTool {
                function_declarations: vec![ProviderFunctionDeclaration {
                    name: "lookup".to_string(),
                    description: "find a thing".to_string(),
                    parameters: json!({"type": "object", "properties": {}}),
                }],
            }]),
            generation_config: None,
            provider: None,
            model_size: None,
        };
        let body = provider_request_to_openai_body("gpt-5", &req, true);
        let tools = body["tools"].as_array().unwrap();
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0]["type"], "function");
        assert_eq!(tools[0]["function"]["name"], "lookup");
        assert_eq!(tools[0]["function"]["description"], "find a thing");
    }

    #[test]
    fn thinking_forwarded_only_for_non_openai_direct_and_sampling_params_dropped() {
        let make_req = || ProviderRequest {
            contents: vec![user("hi")],
            system_instruction: None,
            tools: None,
            generation_config: Some(ProviderGenerationConfig {
                temperature: Some(0.5),
                top_p: Some(0.5),
                max_output_tokens: Some(100),
                thinking_config: Some(ProviderThinkingConfig {
                    include_thoughts: Some(true),
                    thinking_level: Some(ProviderThinkingLevel::High),
                }),
                ..Default::default()
            }),
            provider: None,
            model_size: None,
        };

        // OpenAI direct: thinking dropped (it would otherwise 400 with tools).
        let direct = provider_request_to_openai_body("gpt-5", &make_req(), true);
        assert!(direct.get("reasoning_effort").is_none());

        // Proxy / OpenAI-compatible endpoint, no tools: thinking forwarded.
        let proxy = provider_request_to_openai_body("gpt-5", &make_req(), false);
        assert_eq!(proxy["reasoning_effort"], "high");

        assert_eq!(direct["max_completion_tokens"], 100);
        assert!(direct.get("max_tokens").is_none());
        // We never forward sampling params — see provider_request_to_openai_body.
        assert!(direct.get("temperature").is_none());
        assert!(direct.get("top_p").is_none());
    }

    #[test]
    fn reasoning_effort_dropped_when_tools_present_even_via_proxy() {
        let make_req = || ProviderRequest {
            contents: vec![user("hi")],
            system_instruction: None,
            tools: Some(vec![ProviderTool {
                function_declarations: vec![ProviderFunctionDeclaration {
                    name: "lookup".to_string(),
                    description: "find a thing".to_string(),
                    parameters: json!({"type": "object", "properties": {}}),
                }],
            }]),
            generation_config: Some(ProviderGenerationConfig {
                max_output_tokens: Some(100),
                thinking_config: Some(ProviderThinkingConfig {
                    include_thoughts: Some(true),
                    thinking_level: Some(ProviderThinkingLevel::High),
                }),
                ..Default::default()
            }),
            provider: None,
            model_size: None,
        };

        // Function tools + reasoning_effort 400s on gpt-5 chat/completions, both
        // direct and via proxies that forward to OpenAI (LAM-1771: Signals).
        let proxy = provider_request_to_openai_body("gpt-5", &make_req(), false);
        assert!(proxy.get("reasoning_effort").is_none());
        assert!(proxy.get("tools").is_some());

        let direct = provider_request_to_openai_body("gpt-5", &make_req(), true);
        assert!(direct.get("reasoning_effort").is_none());
    }

    #[test]
    fn parses_text_response() {
        let value = json!({
            "model": "gpt-5-mini",
            "choices": [{
                "message": {"role": "assistant", "content": "hello there"},
                "finish_reason": "stop"
            }],
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 5,
                "total_tokens": 15,
                "prompt_tokens_details": {"cached_tokens": 4}
            }
        });
        let resp = parse_openai_response(value).unwrap();
        let cand = &resp.candidates.as_ref().unwrap()[0];
        let parts = cand.content.as_ref().unwrap().parts.as_ref().unwrap();
        assert_eq!(parts[0].text.as_deref(), Some("hello there"));
        assert_eq!(cand.finish_reason, Some(ProviderFinishReason::Stop));
        let usage = resp.usage_metadata.unwrap();
        assert_eq!(usage.prompt_token_count, Some(10));
        assert_eq!(usage.candidates_token_count, Some(5));
        assert_eq!(usage.total_token_count, Some(15));
        assert_eq!(usage.cache_read_input_tokens, Some(4));
        assert_eq!(usage.cache_creation_input_tokens, None);
        assert_eq!(resp.model_version.as_deref(), Some("gpt-5-mini"));
    }

    #[test]
    fn parses_tool_call_response_with_finish_reason_tool_calls() {
        let value = json!({
            "model": "gpt-5",
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": null,
                    "tool_calls": [{
                        "id": "call_abc",
                        "type": "function",
                        "function": {
                            "name": "get_weather",
                            "arguments": "{\"city\": \"SF\"}"
                        }
                    }]
                },
                "finish_reason": "tool_calls"
            }],
            "usage": {"prompt_tokens": 1, "completion_tokens": 2, "total_tokens": 3}
        });
        let resp = parse_openai_response(value).unwrap();
        let cand = &resp.candidates.as_ref().unwrap()[0];
        assert_eq!(cand.finish_reason, Some(ProviderFinishReason::Stop));
        let parts = cand.content.as_ref().unwrap().parts.as_ref().unwrap();
        let fc = parts[0].function_call.as_ref().unwrap();
        assert_eq!(fc.id.as_deref(), Some("call_abc"));
        assert_eq!(fc.name, "get_weather");
        assert_eq!(fc.args.as_ref().unwrap()["city"], "SF");
    }

    #[test]
    fn maps_finish_reason_variants() {
        assert_eq!(map_finish_reason("stop"), ProviderFinishReason::Stop);
        assert_eq!(map_finish_reason("tool_calls"), ProviderFinishReason::Stop);
        assert_eq!(map_finish_reason("length"), ProviderFinishReason::MaxTokens);
        assert_eq!(
            map_finish_reason("content_filter"),
            ProviderFinishReason::Safety
        );
        assert_eq!(
            map_finish_reason("weird"),
            ProviderFinishReason::Other("weird".to_string())
        );
    }
}
