//! Permissive parsing of LLM-span input messages: role normalization,
//! message-array discovery across provider shapes, and text-part
//! collection.

use serde_json::Value;

// ---------------------------------------------------------------------------
// Message roles
// ---------------------------------------------------------------------------

/// Normalized message role, folding provider aliases together.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    User,
    Assistant,
    Tool,
    System,
    /// No role / unrecognized (e.g. an OpenAI Responses `function_call`
    /// item, which is roleless).
    Other,
}

/// Map a message's `role` onto [`Role`], folding provider aliases:
/// `human`→User, `ai`/`model`→Assistant, `developer`→System.
pub fn normalize_role(msg: &Value) -> Role {
    match msg.get("role").and_then(Value::as_str) {
        None => Role::Other,
        Some(s) => match s.to_lowercase().as_str() {
            "user" | "human" => Role::User,
            "assistant" | "ai" | "model" => Role::Assistant,
            "system" | "developer" => Role::System,
            "tool" => Role::Tool,
            _ => Role::Other,
        },
    }
}

// ---------------------------------------------------------------------------
// Message-array discovery & part collection
// ---------------------------------------------------------------------------

pub(super) fn find_messages_array(input: &Value) -> Option<&Vec<Value>> {
    match input {
        Value::Array(arr) => Some(arr),
        Value::Object(map) => {
            // `messages` covers OpenAI/Anthropic SDK wrappers, `contents`
            // covers Gemini, `input` covers a few normalisers that wrap
            // an inner array. First match wins.
            for key in ["messages", "contents", "input"] {
                if let Some(Value::Array(arr)) = map.get(key) {
                    return Some(arr);
                }
            }
            None
        }
        _ => None,
    }
}

pub(super) fn collect_message_parts(msg: &Value) -> Vec<String> {
    // GenAI uses `parts:`; everyone else uses `content:`. A few payloads
    // carry both — prefer `content` since it's the OpenAI/Anthropic
    // canonical field.
    let Some(body) = msg.get("content").or_else(|| msg.get("parts")) else {
        return Vec::new();
    };
    parts_from_body(body)
}

fn parts_from_body(body: &Value) -> Vec<String> {
    match body {
        Value::String(s) => vec![s.clone()],
        Value::Array(arr) => arr
            .iter()
            .filter_map(render_part)
            .filter(|s| !s.is_empty())
            .collect(),
        Value::Object(_) => render_part(body).into_iter().collect(),
        _ => Vec::new(),
    }
}

fn render_part(part: &Value) -> Option<String> {
    match part {
        Value::String(s) => Some(s.clone()),
        Value::Object(obj) => {
            // Text-part conventions in the wild:
            //   - `{type: "text", text: "..."}`               OpenAI / Anthropic
            //   - `{type: "text", content: "..."}`            OTel GenAI semconv
            //   - `{type: "input_text"|"output_text", text}`  OpenAI Responses
            //
            // Treat parts with no `type` as text (defensive — lets a
            // `{text: "..."}` or `{content: "..."}` part still match).
            let kind = obj.get("type").and_then(Value::as_str);
            match kind {
                None | Some("text") => obj
                    .get("text")
                    .or(obj.get("content"))
                    .and_then(Value::as_str)
                    .map(String::from),
                Some("input_text") | Some("output_text") => {
                    obj.get("text").and_then(Value::as_str).map(String::from)
                }
                _ => None,
            }
        }
        _ => None,
    }
}

/// The message extraction anchors on: a user turn carrying at least one
/// non-empty text part.
pub(super) fn is_task_anchor_message(msg: &Value) -> bool {
    normalize_role(msg) == Role::User
        && collect_message_parts(msg)
            .iter()
            .any(|p| !p.trim().is_empty())
}

// ---------------------------------------------------------------------------
// Output-side helpers
// ---------------------------------------------------------------------------

/// Does this message carry tool calls? Covers OpenAI (`tool_calls` array
/// on the message), Anthropic (`tool_use` content parts), OTel GenAI
/// semconv / LangChain (`tool_call` parts), and OpenAI Responses
/// (`function_call` parts).
pub(super) fn has_tool_calls(message: &Value) -> bool {
    if let Some(Value::Array(calls)) = message.get("tool_calls")
        && !calls.is_empty()
    {
        return true;
    }
    if let Some(Value::Array(parts)) = message.get("content").or_else(|| message.get("parts")) {
        return parts.iter().any(|p| {
            matches!(
                p.get("type").and_then(Value::as_str),
                Some("tool_use" | "tool_call" | "function_call")
            )
        });
    }
    false
}

/// The latest assistant/model message with non-empty rendered text and no
/// tool calls — the agent's answer, as opposed to an intermediate turn
/// that hands off to a tool.
pub(super) fn last_assistant_text(output: &Value) -> Option<String> {
    let single = std::slice::from_ref(output);
    let messages: &[Value] = match find_messages_array(output) {
        Some(arr) => arr,
        // A bare `{role, content}` object is a single-message output.
        None if output.is_object() => single,
        None => return None,
    };
    messages.iter().rev().find_map(|msg| {
        if normalize_role(msg) != Role::Assistant || has_tool_calls(msg) {
            return None;
        }
        let text = collect_message_parts(msg).join("\n\n");
        (!text.trim().is_empty()).then_some(text)
    })
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn has_tool_calls_detects_openai_tool_calls_array() {
        let msg = json!({
            "role": "assistant",
            "content": null,
            "tool_calls": [{"id": "c1", "type": "function", "function": {"name": "f"}}],
        });
        assert!(has_tool_calls(&msg));
        // Empty array = no tool calls.
        let msg = json!({"role": "assistant", "content": "hi", "tool_calls": []});
        assert!(!has_tool_calls(&msg));
    }

    #[test]
    fn has_tool_calls_detects_anthropic_tool_use_parts() {
        let msg = json!({
            "role": "assistant",
            "content": [
                {"type": "text", "text": "let me check"},
                {"type": "tool_use", "id": "t1", "name": "search", "input": {}},
            ],
        });
        assert!(has_tool_calls(&msg));
        let msg = json!({
            "role": "assistant",
            "content": [{"type": "text", "text": "done"}],
        });
        assert!(!has_tool_calls(&msg));
    }

    #[test]
    fn has_tool_calls_detects_genai_and_responses_part_types() {
        // OTel GenAI semconv / LangChain: `tool_call` parts under `parts`.
        let msg = json!({
            "role": "assistant",
            "parts": [
                {"type": "text", "content": "let me check"},
                {"type": "tool_call", "id": "c1", "name": "get_weather", "arguments": {}},
            ],
        });
        assert!(has_tool_calls(&msg));
        // OpenAI Responses: `function_call` part types.
        let msg = json!({
            "role": "assistant",
            "content": [{"type": "function_call", "name": "f", "arguments": "{}"}],
        });
        assert!(has_tool_calls(&msg));
    }

    #[test]
    fn last_assistant_text_picks_latest_toolless_assistant_message() {
        let output = json!([
            {"role": "assistant", "content": "first answer"},
            {"role": "assistant", "content": [
                {"type": "text", "text": "calling"},
                {"type": "tool_use", "id": "t1", "name": "f", "input": {}},
            ]},
            {"role": "assistant", "content": "final answer"},
            {"role": "tool", "content": "tool result"},
        ]);
        assert_eq!(last_assistant_text(&output), Some("final answer".into()));
    }

    #[test]
    fn last_assistant_text_skips_tool_call_and_empty_messages() {
        let output = json!([
            {"role": "assistant", "content": "real answer"},
            {"role": "assistant", "content": "", },
            {"role": "assistant", "content": null, "tool_calls": [{"id": "c"}]},
        ]);
        assert_eq!(last_assistant_text(&output), Some("real answer".into()));
        // No qualifying message at all.
        let output = json!([
            {"role": "user", "content": "hi"},
            {"role": "assistant", "content": null, "tool_calls": [{"id": "c"}]},
        ]);
        assert_eq!(last_assistant_text(&output), None);
    }

    #[test]
    fn last_assistant_text_accepts_single_message_object_and_model_role() {
        let output = json!({"role": "model", "parts": [{"type": "text", "text": "gemini says"}]});
        assert_eq!(last_assistant_text(&output), Some("gemini says".into()));
        assert_eq!(last_assistant_text(&json!("bare string")), None);
    }
}
