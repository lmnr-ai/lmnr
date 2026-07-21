#![cfg_attr(not(feature = "signals"), allow(dead_code))]

//! Conversions between the internal Gemini-shaped `ProviderRequest`/`ProviderResponse`
//! types and the OpenAI Responses API (`/v1/responses`) wire format.
//!
//! The Responses API models a conversation as a flat `input` array of typed
//! items: `{role, content}` message items, `function_call` items (assistant tool
//! calls), and `function_call_output` items (tool results) keyed by `call_id`.
//! The system prompt rides the top-level `instructions` field. Reasoning models
//! accept `reasoning.effort` alongside function tools here (unlike Chat
//! Completions), and report thinking tokens under
//! `usage.output_tokens_details.reasoning_tokens`.

use crate::llm::models::{
    ProviderCandidate, ProviderContent, ProviderFinishReason, ProviderFunctionCall, ProviderPart,
    ProviderRequest, ProviderResponse, ProviderUsageMetadata,
};
use crate::llm::openai::OpenAIError;
use crate::llm::openai::conversions::thinking_level_to_effort;
use serde_json::{Value, json};

/// Build the OpenAI Responses request body from a `ProviderRequest`.
pub fn provider_request_to_responses_body(model: &str, request: &ProviderRequest) -> Value {
    let mut input: Vec<Value> = Vec::new();
    for content in &request.contents {
        append_content_as_items(content, &mut input);
    }

    let mut body = json!({
        "model": model,
        "input": input,
    });

    if let Some(sys) = request.system_instruction.as_ref() {
        let text = concat_text_parts(sys);
        if !text.is_empty() {
            body["instructions"] = Value::String(text);
        }
    }

    if let Some(tools) = request.tools.as_ref() {
        let tool_array: Vec<Value> = tools
            .iter()
            .flat_map(|t| &t.function_declarations)
            .map(|f| {
                json!({
                    "type": "function",
                    "name": f.name,
                    "description": f.description,
                    "parameters": f.parameters,
                })
            })
            .collect();
        if !tool_array.is_empty() {
            body["tools"] = Value::Array(tool_array);
        }
    }

    if let Some(gc) = request.generation_config.as_ref() {
        // Same rationale as Chat Completions: don't forward sampling params.
        if let Some(m) = gc.max_output_tokens {
            body["max_output_tokens"] = json!(m);
        }
        // Responses accepts reasoning + function tools together, so forward the
        // effort unconditionally (the Chat Completions no-tools guard doesn't apply).
        if let Some(effort) = gc
            .thinking_config
            .as_ref()
            .and_then(|tc| tc.thinking_level.as_ref())
            .and_then(thinking_level_to_effort)
        {
            // `summary: "auto"` requests a reasoning summary (richest available)
            // so summary text is returned alongside the answer.
            body["reasoning"] = json!({ "effort": effort, "summary": "auto" });
        }
    }

    body
}

/// Same as [`provider_request_to_responses_body`] but flags the request for SSE
/// streaming. Usage rides the terminal `response.completed` event, so no
/// `stream_options` toggle is needed.
pub fn provider_request_to_responses_stream_body(model: &str, request: &ProviderRequest) -> Value {
    let mut body = provider_request_to_responses_body(model, request);
    body["stream"] = json!(true);
    body
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

/// Expand one internal `ProviderContent` into one (or more) Responses input items:
/// a `{role, content}` message for text, `function_call` items for tool calls,
/// and `function_call_output` items for tool results.
fn append_content_as_items(content: &ProviderContent, out: &mut Vec<Value>) {
    let raw_role = content.role.as_deref().unwrap_or("user");
    let role = match raw_role {
        "assistant" | "model" => "assistant",
        "system" => "system",
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
            let call_id = fr.id.unwrap_or_default();
            let output_str = serde_json::to_string(&fr.response).unwrap_or_default();
            tool_results.push(json!({
                "type": "function_call_output",
                "call_id": call_id,
                "output": output_str,
            }));
            continue;
        }
        if let Some(fc) = part.function_call {
            let call_id = fc.id.unwrap_or_default();
            let args = fc.args.unwrap_or(Value::Object(Default::default()));
            let arguments_str = serde_json::to_string(&args).unwrap_or("{}".to_string());
            tool_calls.push(json!({
                "type": "function_call",
                "call_id": call_id,
                "name": fc.name,
                "arguments": arguments_str,
            }));
            continue;
        }
        if let Some(t) = part.text {
            text_buf.push_str(&t);
        }
    }

    if !text_buf.is_empty() {
        out.push(json!({
            "role": role,
            "content": text_buf,
        }));
    }
    out.extend(tool_calls);
    out.extend(tool_results);
}

/// Parse an OpenAI Responses API response JSON into a `ProviderResponse`.
pub fn parse_openai_responses_response(value: Value) -> Result<ProviderResponse, OpenAIError> {
    // A `failed` status is a provider-side failure, not a valid empty response —
    // surface the `error` payload instead of returning empty content.
    if value.get("status").and_then(|s| s.as_str()) == Some("failed") {
        return Err(responses_failed_error(&value));
    }

    let output = value
        .get("output")
        .and_then(|o| o.as_array())
        .cloned()
        .unwrap_or_default();

    let mut parts: Vec<ProviderPart> = Vec::new();

    for item in output {
        let item_type = item.get("type").and_then(|t| t.as_str()).unwrap_or("");
        match item_type {
            "message" => {
                if let Some(text) = extract_message_text(&item) {
                    if !text.is_empty() {
                        parts.push(ProviderPart {
                            text: Some(text),
                            ..Default::default()
                        });
                    }
                }
            }
            "reasoning" => {
                let summary = extract_reasoning_summary(&item);
                if !summary.is_empty() {
                    parts.push(ProviderPart {
                        text: Some(summary),
                        thought: Some(true),
                        ..Default::default()
                    });
                }
            }
            "function_call" => {
                let id = item
                    .get("call_id")
                    .or_else(|| item.get("id"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let name = item
                    .get("name")
                    .and_then(|n| n.as_str())
                    .unwrap_or("")
                    .to_string();
                let args = item
                    .get("arguments")
                    .and_then(|a| a.as_str())
                    .and_then(|s| serde_json::from_str::<Value>(s).ok())
                    .or_else(|| item.get("arguments").cloned());
                parts.push(ProviderPart {
                    function_call: Some(ProviderFunctionCall { id, name, args }),
                    ..Default::default()
                });
            }
            _ => {}
        }
    }

    let finish_reason = map_responses_status(&value);

    let candidate = ProviderCandidate {
        content: Some(ProviderContent {
            role: Some("model".to_string()),
            parts: Some(parts),
        }),
        finish_reason,
    };

    let usage = value
        .get("usage")
        .filter(|u| !u.is_null())
        .map(parse_responses_usage);
    let model_version = value
        .get("model")
        .and_then(|m| m.as_str())
        .map(|s| s.to_string());

    Ok(ProviderResponse {
        candidates: Some(vec![candidate]),
        usage_metadata: usage,
        model_version,
    })
}

/// Concatenate `output_text` pieces from a Responses `message` item's content array.
fn extract_message_text(item: &Value) -> Option<String> {
    let content = item.get("content")?;
    if let Some(text) = content.as_str() {
        return Some(text.to_string());
    }
    let arr = content.as_array()?;
    let mut out = String::new();
    for piece in arr {
        let piece_type = piece.get("type").and_then(|t| t.as_str()).unwrap_or("");
        // `output_text` is the assistant's text; `refusal` carries a decline message.
        if piece_type == "output_text" || piece_type == "refusal" {
            if let Some(t) = piece
                .get("text")
                .or_else(|| piece.get("refusal"))
                .and_then(|x| x.as_str())
            {
                out.push_str(t);
            }
        }
    }
    Some(out)
}

/// Extract reasoning text from a Responses `reasoning` item. OpenAI o-series
/// return a human summary under `summary[].summary_text`; some providers return
/// the raw reasoning under `content[].reasoning_text`.
/// Read both so thinking surfaces regardless of provider.
fn extract_reasoning_summary(item: &Value) -> String {
    let mut out = String::new();
    for field in ["summary", "content"] {
        let Some(arr) = item.get(field).and_then(|s| s.as_array()) else {
            continue;
        };
        for piece in arr {
            if let Some(t) = piece.get("text").and_then(|x| x.as_str()) {
                out.push_str(t);
            }
        }
    }
    out
}

/// Build an error from a `status: "failed"` Responses payload. The status code
/// is chosen so the shared `OpenAIError::ApiError` → `ProviderError` mapping
/// derives sensible retry semantics: `rate_limit_exceeded` → 429 (retryable,
/// resource-exhausted), `server_error` → 500 (retryable), anything else → 400
/// (non-retryable — retrying a model/content failure won't help).
fn responses_failed_error(value: &Value) -> OpenAIError {
    let error = value.get("error");
    let message = error
        .and_then(|e| e.get("message"))
        .and_then(|m| m.as_str())
        .or_else(|| error.and_then(|e| e.as_str()))
        .unwrap_or("Responses API returned status \"failed\"")
        .to_string();
    let status_code = match error.and_then(|e| e.get("code")).and_then(|c| c.as_str()) {
        Some("rate_limit_exceeded") => 429,
        Some("server_error") => 500,
        _ => 400,
    };
    OpenAIError::ApiError {
        status_code,
        message,
    }
}

fn map_responses_status(value: &Value) -> Option<ProviderFinishReason> {
    let status = value.get("status").and_then(|s| s.as_str())?;
    Some(match status {
        "completed" => ProviderFinishReason::Stop,
        "incomplete" => {
            let reason = value
                .get("incomplete_details")
                .and_then(|d| d.get("reason"))
                .and_then(|r| r.as_str())
                .unwrap_or("");
            match reason {
                "max_output_tokens" => ProviderFinishReason::MaxTokens,
                "content_filter" => ProviderFinishReason::Safety,
                other => ProviderFinishReason::Other(other.to_string()),
            }
        }
        other => ProviderFinishReason::Other(other.to_string()),
    })
}

fn parse_responses_usage(usage: &Value) -> ProviderUsageMetadata {
    let input_tokens = usage
        .get("input_tokens")
        .and_then(|v| v.as_i64())
        .map(|v| v as i32);
    // `output_tokens` already includes reasoning tokens per the API convention.
    let output_tokens = usage
        .get("output_tokens")
        .and_then(|v| v.as_i64())
        .map(|v| v as i32);
    let total_tokens = usage
        .get("total_tokens")
        .and_then(|v| v.as_i64())
        .map(|v| v as i32);
    let cached_tokens = usage
        .get("input_tokens_details")
        .and_then(|d| d.get("cached_tokens"))
        .and_then(|v| v.as_i64())
        .map(|v| v as i32);
    let reasoning_tokens = usage
        .get("output_tokens_details")
        .and_then(|d| d.get("reasoning_tokens"))
        .and_then(|v| v.as_i64())
        .map(|v| v as i32);

    ProviderUsageMetadata {
        prompt_token_count: input_tokens,
        candidates_token_count: output_tokens,
        total_token_count: total_tokens,
        cache_read_input_tokens: cached_tokens,
        cache_creation_input_tokens: None,
        reasoning_token_count: reasoning_tokens,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::llm::models::{
        ProviderContent, ProviderFunctionCall, ProviderFunctionDeclaration,
        ProviderFunctionResponse, ProviderGenerationConfig, ProviderPart, ProviderRequest,
        ProviderThinkingConfig, ProviderThinkingLevel, ProviderTool,
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

    fn request(contents: Vec<ProviderContent>) -> ProviderRequest {
        ProviderRequest {
            contents,
            system_instruction: None,
            tools: None,
            generation_config: None,
            service_tier: None,
            provider: None,
            model_size: None,
        }
    }

    #[test]
    fn system_goes_to_instructions_and_user_to_input() {
        let mut req = request(vec![user("Hello")]);
        req.system_instruction = Some(ProviderContent {
            role: None,
            parts: Some(vec![text_part("Be terse")]),
        });
        let body = provider_request_to_responses_body("gpt-5", &req);
        assert_eq!(body["instructions"], "Be terse");
        let input = body["input"].as_array().unwrap();
        assert_eq!(input.len(), 1);
        assert_eq!(input[0]["role"], "user");
        assert_eq!(input[0]["content"], "Hello");
        assert_eq!(body["model"], "gpt-5");
    }

    #[test]
    fn tool_call_and_result_become_flat_items() {
        let req = request(vec![
            user("Find weather"),
            assistant_with_tool_call(Some("call_1"), "get_weather", json!({"city": "SF"})),
            tool_response(Some("call_1"), "get_weather", json!({"temp": 60})),
            user("Thanks"),
        ]);
        let body = provider_request_to_responses_body("gpt-5", &req);
        let input = body["input"].as_array().unwrap();
        assert_eq!(input.len(), 4);
        assert_eq!(input[0]["content"], "Find weather");
        assert_eq!(input[1]["type"], "function_call");
        assert_eq!(input[1]["call_id"], "call_1");
        assert_eq!(input[1]["name"], "get_weather");
        assert_eq!(input[1]["arguments"], "{\"city\":\"SF\"}");
        assert_eq!(input[2]["type"], "function_call_output");
        assert_eq!(input[2]["call_id"], "call_1");
        assert_eq!(input[2]["output"], "{\"temp\":60}");
        assert_eq!(input[3]["content"], "Thanks");
    }

    #[test]
    fn tools_are_flat_and_reasoning_forwarded_with_tools() {
        let mut req = request(vec![user("hi")]);
        req.tools = Some(vec![ProviderTool {
            function_declarations: vec![ProviderFunctionDeclaration {
                name: "lookup".to_string(),
                description: "find a thing".to_string(),
                parameters: json!({"type": "object", "properties": {}}),
            }],
        }]);
        req.generation_config = Some(ProviderGenerationConfig {
            max_output_tokens: Some(100),
            thinking_config: Some(ProviderThinkingConfig {
                include_thoughts: Some(true),
                thinking_level: Some(ProviderThinkingLevel::High),
            }),
            ..Default::default()
        });
        let body = provider_request_to_responses_body("gpt-5", &req);
        let tools = body["tools"].as_array().unwrap();
        assert_eq!(tools[0]["type"], "function");
        assert_eq!(tools[0]["name"], "lookup");
        assert_eq!(tools[0]["parameters"]["type"], "object");
        // Responses allows reasoning + tools together.
        assert_eq!(body["reasoning"]["effort"], "high");
        assert_eq!(body["reasoning"]["summary"], "auto");
        assert_eq!(body["max_output_tokens"], 100);
        assert!(body.get("temperature").is_none());
    }

    #[test]
    fn parses_text_response_with_reasoning_usage() {
        let value = json!({
            "model": "gpt-5-2026",
            "status": "completed",
            "output": [
                {"type": "reasoning", "summary": [{"type": "summary_text", "text": "thinking"}]},
                {"type": "message", "role": "assistant", "content": [
                    {"type": "output_text", "text": "hello there"}
                ]}
            ],
            "usage": {
                "input_tokens": 10,
                "input_tokens_details": {"cached_tokens": 4},
                "output_tokens": 20,
                "output_tokens_details": {"reasoning_tokens": 12},
                "total_tokens": 30
            }
        });
        let resp = parse_openai_responses_response(value).unwrap();
        let cand = &resp.candidates.as_ref().unwrap()[0];
        assert_eq!(cand.finish_reason, Some(ProviderFinishReason::Stop));
        let parts = cand.content.as_ref().unwrap().parts.as_ref().unwrap();
        assert!(
            parts
                .iter()
                .any(|p| p.thought == Some(true) && p.text.as_deref() == Some("thinking"))
        );
        assert!(
            parts
                .iter()
                .any(|p| p.text.as_deref() == Some("hello there"))
        );
        let usage = resp.usage_metadata.unwrap();
        assert_eq!(usage.prompt_token_count, Some(10));
        assert_eq!(usage.candidates_token_count, Some(20));
        assert_eq!(usage.total_token_count, Some(30));
        assert_eq!(usage.cache_read_input_tokens, Some(4));
        assert_eq!(usage.reasoning_token_count, Some(12));
        assert_eq!(resp.model_version.as_deref(), Some("gpt-5-2026"));
    }

    #[test]
    fn parses_reasoning_from_content_reasoning_text() {
        // Providers like GLM on Fireworks return raw reasoning under
        // `content[].reasoning_text`, not the OpenAI-style `summary`.
        let value = json!({
            "model": "glm-4.6",
            "status": "completed",
            "output": [
                {"type": "reasoning", "summary": [], "content": [
                    {"type": "reasoning_text", "text": "let me think"}
                ]},
                {"type": "message", "role": "assistant", "content": [
                    {"type": "output_text", "text": "answer"}
                ]}
            ]
        });
        let resp = parse_openai_responses_response(value).unwrap();
        let cand = &resp.candidates.as_ref().unwrap()[0];
        let parts = cand.content.as_ref().unwrap().parts.as_ref().unwrap();
        assert!(
            parts
                .iter()
                .any(|p| p.thought == Some(true) && p.text.as_deref() == Some("let me think"))
        );
        assert!(parts.iter().any(|p| p.text.as_deref() == Some("answer")));
    }

    #[test]
    fn parses_function_call_response() {
        let value = json!({
            "model": "gpt-5",
            "status": "completed",
            "output": [
                {
                    "type": "function_call",
                    "id": "fc_1",
                    "call_id": "call_abc",
                    "name": "get_weather",
                    "arguments": "{\"city\": \"SF\"}"
                }
            ],
            "usage": {"input_tokens": 1, "output_tokens": 2, "total_tokens": 3}
        });
        let resp = parse_openai_responses_response(value).unwrap();
        let cand = &resp.candidates.as_ref().unwrap()[0];
        assert_eq!(cand.finish_reason, Some(ProviderFinishReason::Stop));
        let parts = cand.content.as_ref().unwrap().parts.as_ref().unwrap();
        let fc = parts[0].function_call.as_ref().unwrap();
        assert_eq!(fc.id.as_deref(), Some("call_abc"));
        assert_eq!(fc.name, "get_weather");
        assert_eq!(fc.args.as_ref().unwrap()["city"], "SF");
    }

    #[test]
    fn failed_status_returns_error_with_message() {
        let value = json!({
            "model": "gpt-5",
            "status": "failed",
            "error": {"code": "server_error", "message": "the model failed"},
            "output": []
        });
        let err = parse_openai_responses_response(value).unwrap_err();
        match err {
            OpenAIError::ApiError {
                status_code,
                message,
            } => {
                assert_eq!(status_code, 500);
                assert_eq!(message, "the model failed");
            }
            other => panic!("expected ApiError, got {other:?}"),
        }
    }

    #[test]
    fn incomplete_max_output_tokens_maps_to_max_tokens() {
        let value = json!({
            "model": "gpt-5",
            "status": "incomplete",
            "incomplete_details": {"reason": "max_output_tokens"},
            "output": []
        });
        let resp = parse_openai_responses_response(value).unwrap();
        let cand = &resp.candidates.as_ref().unwrap()[0];
        assert_eq!(cand.finish_reason, Some(ProviderFinishReason::MaxTokens));
    }
}
