//! Permissive parsing of LLM-span input messages: role normalization,
//! message-array discovery across provider shapes, and text-part
//! collection. The output side no longer parses message shapes at all
//! (LAM-1953 rework) — output extraction hashes the whole output array via
//! the existing dedup pipeline instead of rendering text, so this module is
//! input-only.

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

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn normalize_role_folds_provider_aliases() {
        assert_eq!(normalize_role(&json!({"role": "human"})), Role::User);
        assert_eq!(normalize_role(&json!({"role": "ai"})), Role::Assistant);
        assert_eq!(normalize_role(&json!({"role": "model"})), Role::Assistant);
        assert_eq!(normalize_role(&json!({"role": "developer"})), Role::System);
        assert_eq!(normalize_role(&json!({})), Role::Other);
    }

    #[test]
    fn is_task_anchor_message_requires_user_role_and_nonempty_text() {
        assert!(is_task_anchor_message(
            &json!({"role": "user", "content": "hi"})
        ));
        assert!(!is_task_anchor_message(
            &json!({"role": "user", "content": ""})
        ));
        assert!(!is_task_anchor_message(
            &json!({"role": "assistant", "content": "hi"})
        ));
    }
}
