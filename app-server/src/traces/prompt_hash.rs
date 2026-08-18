//! Prompt-hash helpers shared between always-OSS code paths and the signals
//! feature. Both `structural_skeleton_hash` (used by span search hashing and
//! per-LLM-span prompt fingerprinting) and `extract_system_message` (used by
//! `compute_prompt_hash` in `traces/utils.rs`) live here so they remain
//! compiled regardless of the `signals` cargo feature.

use regex::Regex;
use serde_json::Value;
use sha3::{Digest, Sha3_256};
use std::borrow::Cow;
use std::sync::LazyLock;

static XML_TAG_NAME_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"<(\w+)[\s/>]").unwrap());

// Matches the Claude Code billing header, e.g.
// `x-anthropic-billing-header: cc_version=2.1.104.8ec; cc_entrypoint=sdk-ts; cch=00000;`
static CLAUDE_CODE_BILLING_HEADER_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"x-anthropic-billing-header:(?:\s*[A-Za-z_][A-Za-z0-9_]*=[^\s;]*;)+").unwrap()
});

pub fn strip_claude_code_billing_header(text: &str) -> Cow<'_, str> {
    CLAUDE_CODE_BILLING_HEADER_REGEX.replace_all(text, "")
}

/// The two hashes derived from one system prompt. Callers that only need the
/// skeleton use [`structural_skeleton_hash`].
pub struct PromptHashes {
    /// First sentence + sorted XML tag names.
    pub skeleton: String,
    /// First sentence only. Blind to which scaffolding tags the prompt
    /// carries, so adding/removing one doesn't fork a cache key.
    pub first_sentence: String,
}

/// Both hashes of a system prompt in one pass. Volatile client/SDK version
/// headers (e.g. Claude Code's `x-anthropic-billing-header`) are stripped
/// first so both are stable across SDK versions.
pub fn prompt_hashes(text: &str) -> PromptHashes {
    let text = strip_claude_code_billing_header(text);
    let first_sentence = normalized_first_sentence(text.as_ref());
    let tag_names = sorted_tag_names(text.as_ref());
    PromptHashes {
        skeleton: hash8(&format!("{}|{}", first_sentence, tag_names.join(","))),
        first_sentence: hash8(&first_sentence),
    }
}

/// Hash a system prompt by its structural skeleton: first sentence + sorted XML tag names.
/// Resistant to dynamic content inside tags (config values, user context, tool lists)
/// while preserving the stable identity of the prompt template.
pub fn structural_skeleton_hash(text: &str) -> String {
    prompt_hashes(text).skeleton
}

fn hash8(skeleton: &str) -> String {
    let digest = Sha3_256::digest(skeleton.as_bytes());
    format!("{:x}", digest)[..8].to_string()
}

/// Whitespace-collapsed, lowercased first sentence. The cut is taken on the
/// original text — normalizing first would destroy the newline boundaries.
/// Boundary = first newline, or '.' followed by whitespace / end-of-text,
/// after 20+ chars; periods inside words ("3.5", "gpt-4.1") don't count.
fn normalized_first_sentence(text: &str) -> String {
    let bytes = text.as_bytes();
    let boundary = text.char_indices().find(|(i, c)| {
        if *i < 20 {
            return false;
        }
        if *c == '\n' {
            return true;
        }
        if *c == '.' {
            let next_byte_idx = *i + 1;
            if next_byte_idx >= bytes.len() {
                return true;
            }
            let next = bytes[next_byte_idx];
            return next == b' ' || next == b'\n' || next == b'\t' || next == b'\r';
        }
        false
    });

    let raw_first_sentence = boundary.map(|(i, _)| &text[..i]).unwrap_or_else(|| {
        let end = text
            .char_indices()
            .nth(200)
            .map(|(i, _)| i)
            .unwrap_or(text.len());
        &text[..end]
    });

    raw_first_sentence
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

/// Unique XML/HTML tag names, lowercased to match the normalized first sentence.
fn sorted_tag_names(text: &str) -> Vec<String> {
    let mut tag_names: Vec<String> = XML_TAG_NAME_RE
        .captures_iter(text)
        .map(|cap| cap.get(1).unwrap().as_str().to_lowercase())
        .collect();
    tag_names.sort();
    tag_names.dedup();
    tag_names
}

/// Extract the text of a single `role: "system"` message across the content
/// shapes we ingest. Returns `None` if the message is not a system message or
/// carries no extractable text. Shared by [`extract_system_message`] (array
/// scan) and per-message callers that already hold a single message.
pub fn extract_system_text(msg: &Value) -> Option<String> {
    if msg.get("role").and_then(|r| r.as_str()) != Some("system") {
        return None;
    }
    let content_val = msg.get("content");
    let sys_text = content_val
        // "content": "plain string" (OpenAI format)
        .and_then(|c| c.as_str().map(|s| s.to_string()))
        // "content": [{"text": "...", "type": "text"}, ...] (Anthropic format)
        .or_else(|| {
            content_val
                .and_then(|c| c.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|block| block.get("text").and_then(|t| t.as_str()))
                        .collect::<Vec<_>>()
                        .join(" ")
                })
                .filter(|s| !s.is_empty())
        })
        // "parts" shapes — we only inspect the first part (multi-part system
        // prompts are rare and not worth the complexity here):
        //   - Gemini:     {"text": "..."}
        //   - OTel GenAI: {"type": "text", "content": "..."}
        //     (emitted by pydantic_ai; see https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/)
        .or_else(|| {
            msg.get("parts")
                .and_then(|p| p.as_array())
                .and_then(|arr| arr.first())
                .and_then(|first| first.get("text").or_else(|| first.get("content")))
                .and_then(|t| t.as_str())
                .map(|s| s.to_string())
        })
        .unwrap_or_default();
    (!sys_text.is_empty()).then_some(sys_text)
}

/// The messages array inside an LLM span's input, across the shapes we ingest.
///
/// A bare array is the common case, but plenty of instrumentations record the
/// provider's whole request body instead: `messages` covers the OpenAI /
/// Anthropic SDK wrappers, `contents` covers Gemini, and `input` covers
/// normalisers that nest an inner array. First match wins.
///
/// Anything that reads roles out of a span's input has to go through here —
/// matching only on the bare array silently ignores every wrapped span, and
/// the failure is invisible because "no messages" and "no system message" are
/// the same `None`.
pub fn find_messages_array(input: &Value) -> Option<&Vec<Value>> {
    match input {
        Value::Array(arr) => Some(arr),
        Value::Object(map) => {
            ["messages", "contents", "input"]
                .iter()
                .find_map(|key| match map.get(*key) {
                    Some(Value::Array(arr)) => Some(arr),
                    _ => None,
                })
        }
        _ => None,
    }
}

/// Extract the system message from an LLM span's input.
/// Returns `(system_text, remaining_messages)` if a `role: "system"` message is
/// found. The remaining messages are always a bare array, even when the input
/// was a wrapper object.
pub fn extract_system_message(parsed: &Value) -> Option<(String, Value)> {
    let messages = find_messages_array(parsed)?;
    let sys_idx = messages.iter().position(|m| {
        m.get("role")
            .and_then(|r| r.as_str())
            .is_some_and(|r| r == "system")
    })?;
    let sys_text = extract_system_text(&messages[sys_idx])?;
    let remaining: Vec<Value> = messages
        .iter()
        .enumerate()
        .filter(|(i, _)| *i != sys_idx)
        .map(|(_, m)| m.clone())
        .collect();
    Some((sys_text, Value::Array(remaining)))
}

#[cfg(test)]
mod tests {
    use super::*;

    // ===================================================================
    // structural_skeleton_hash
    // ===================================================================

    #[test]
    fn test_hash_stability() {
        let hash1 = structural_skeleton_hash("You are a helpful assistant.");
        let hash2 = structural_skeleton_hash("You are a helpful assistant.");
        assert_eq!(hash1, hash2);
        assert_eq!(hash1.len(), 8);
    }

    #[test]
    fn test_hash_whitespace_normalization() {
        let hash1 = structural_skeleton_hash("You  are\n a   helpful\tassistant.");
        let hash2 = structural_skeleton_hash("You are a helpful assistant.");
        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_hash_case_normalization() {
        let hash1 = structural_skeleton_hash("You Are A Helpful Assistant.");
        let hash2 = structural_skeleton_hash("you are a helpful assistant.");
        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_structural_skeleton_hash_stable_across_dynamic_content() {
        let prompt_v1 = r#"You are an AI agent designed to automate browser tasks.
<agent_configuration>
Model: browser-use-llm
Proxy: enabled
Vision: enabled
</agent_configuration>
<rules>
Do not fabricate data.
</rules>"#;

        let prompt_v2 = r#"You are an AI agent designed to automate browser tasks.
<agent_configuration>
Model: gpt-4o
Proxy: disabled
Vision: disabled
</agent_configuration>
<rules>
Do not fabricate data.
</rules>"#;

        assert_eq!(
            structural_skeleton_hash(prompt_v1),
            structural_skeleton_hash(prompt_v2),
            "Same template with different config values should produce the same skeleton hash"
        );
    }

    #[test]
    fn test_structural_skeleton_hash_differs_for_different_agents() {
        let browser_agent = r#"You are an AI agent designed to automate browser tasks.
<agent_configuration>Model: x</agent_configuration>
<rules>Click things</rules>"#;

        let code_agent = r#"You are Claude Code, an AI coding assistant.
<instructions>Write code</instructions>
<tools>bash, read, write</tools>"#;

        assert_ne!(
            structural_skeleton_hash(browser_agent),
            structural_skeleton_hash(code_agent),
            "Different agents should produce different skeleton hashes"
        );
    }

    #[test]
    fn test_structural_skeleton_hash_no_tags() {
        let plain_v1 = "You are a helpful customer support agent. Answer questions politely. Use the knowledge base.";
        let plain_v2 =
            "You are a helpful customer support agent. Answer questions politely. Be concise.";

        assert_eq!(
            structural_skeleton_hash(plain_v1),
            structural_skeleton_hash(plain_v2),
            "Same first sentence with no tags should produce the same hash"
        );
    }

    #[test]
    fn test_structural_skeleton_hash_case_insensitive() {
        let lower = "You are an AI assistant.\n<rules>be helpful</rules>";
        let upper = "YOU ARE AN AI ASSISTANT.\n<RULES>BE HELPFUL</RULES>";

        assert_eq!(
            structural_skeleton_hash(lower),
            structural_skeleton_hash(upper),
        );
    }

    #[test]
    fn test_structural_skeleton_hash_newline_boundary() {
        let prompt_a = "You are a browser automation agent\n<config>Model: gpt-4</config>";
        let prompt_b = "You are a browser automation agent\n<config>Model: claude-3</config>";

        assert_eq!(
            structural_skeleton_hash(prompt_a),
            structural_skeleton_hash(prompt_b),
            "Newline should terminate first sentence before dynamic tag content"
        );
    }

    #[test]
    fn test_structural_skeleton_hash_period_boundary() {
        let v1 = "You are a helpful coding assistant. Today is Monday. User: Alice.";
        let v2 = "You are a helpful coding assistant. Today is Friday. User: Bob.";

        assert_eq!(
            structural_skeleton_hash(v1),
            structural_skeleton_hash(v2),
            "Only first sentence (up to first period) should matter"
        );
    }

    #[test]
    fn test_structural_skeleton_hash_whitespace_normalization() {
        let spaced = "You   are  an   AI   assistant.\n<rules>  help  </rules>";
        let compact = "You are an AI assistant.\n<rules>help</rules>";

        assert_eq!(
            structural_skeleton_hash(spaced),
            structural_skeleton_hash(compact),
            "Extra whitespace in first sentence should not affect hash"
        );
    }

    #[test]
    fn test_structural_skeleton_hash_short_prompt_fallback() {
        let short = "Be helpful.";
        let hash = structural_skeleton_hash(short);
        assert_eq!(hash.len(), 8, "Should still produce an 8-char hash");
    }

    #[test]
    fn test_structural_skeleton_hash_tag_order_irrelevant() {
        let order_a = "You are an AI agent for testing.\n<beta>x</beta>\n<alpha>y</alpha>";
        let order_b = "You are an AI agent for testing.\n<alpha>z</alpha>\n<beta>w</beta>";

        assert_eq!(
            structural_skeleton_hash(order_a),
            structural_skeleton_hash(order_b),
            "Tag order should not affect hash (tags are sorted)"
        );
    }

    #[test]
    fn test_structural_skeleton_hash_duplicate_tags() {
        let single = "You are an AI agent for testing.\n<rules>rule 1</rules>";
        let duped =
            "You are an AI agent for testing.\n<rules>rule 1</rules>\n<rules>rule 2</rules>";

        assert_eq!(
            structural_skeleton_hash(single),
            structural_skeleton_hash(duped),
            "Duplicate tag names should be deduped"
        );
    }

    #[test]
    fn test_structural_skeleton_hash_same_sentence_different_tags() {
        let with_rules = "You are an AI agent for testing.\n<rules>be safe</rules>";
        let with_tools = "You are an AI agent for testing.\n<tools>search, read</tools>";

        assert_ne!(
            structural_skeleton_hash(with_rules),
            structural_skeleton_hash(with_tools),
            "Same sentence but different tag names should produce different hashes"
        );
    }

    #[test]
    fn test_structural_skeleton_hash_period_inside_word_not_boundary() {
        let v1 = "You are running on gpt-4.1 with temperature 0.7 today. User: Alice.";
        let v2 = "You are running on gpt-4.1 with temperature 0.7 today. User: Bob.";

        assert_eq!(
            structural_skeleton_hash(v1),
            structural_skeleton_hash(v2),
            "Periods inside words should not be treated as sentence boundaries"
        );

        let v3 = "You are running on claude-3.5 with temperature 0.2 today. User: Alice.";
        assert_ne!(
            structural_skeleton_hash(v1),
            structural_skeleton_hash(v3),
            "Different first sentences should still produce different hashes"
        );
    }

    #[test]
    fn test_structural_skeleton_hash_self_closing_tags() {
        let normal = "You are an AI agent for testing.\n<config>stuff</config>";
        let self_closing = "You are an AI agent for testing.\n<config />";

        assert_eq!(
            structural_skeleton_hash(normal),
            structural_skeleton_hash(self_closing),
            "Self-closing tags should extract the same tag name"
        );
    }

    #[test]
    fn test_structural_skeleton_hash_ignores_claude_code_billing_header() {
        let with_header = "x-anthropic-billing-header: cc_version=2.1.112.186; cc_entrypoint=sdk-ts; You are a helpful assistant.";
        let without = "You are a helpful assistant.";
        assert_eq!(
            structural_skeleton_hash(with_header),
            structural_skeleton_hash(without)
        );
    }

    #[test]
    fn test_structural_skeleton_hash_ignores_full_billing_header_with_extra_pairs() {
        let with_header = "x-anthropic-billing-header: cc_version=2.1.104.8ec; cc_entrypoint=sdk-ts; cch=00000; You are a helpful assistant.";
        let without = "You are a helpful assistant.";
        assert_eq!(
            structural_skeleton_hash(with_header),
            structural_skeleton_hash(without)
        );
    }

    #[test]
    fn test_structural_skeleton_hash_stable_across_cc_versions() {
        let v1 = "x-anthropic-billing-header: cc_version=2.1.112.186; cc_entrypoint=sdk-ts; You are Claude Code.";
        let v2 = "x-anthropic-billing-header: cc_version=2.2.0.1; cc_entrypoint=cli; You are Claude Code.";
        assert_eq!(structural_skeleton_hash(v1), structural_skeleton_hash(v2));
    }

    #[test]
    fn test_structural_skeleton_hash_stable_without_billing_header() {
        let text = "You are a helpful assistant.\nAlways respond in JSON.";
        assert_eq!(
            structural_skeleton_hash(text),
            structural_skeleton_hash(text)
        );
    }

    // ===================================================================
    // prompt_hashes (first-sentence half)
    // ===================================================================

    #[test]
    fn test_first_sentence_hash_ignores_tag_permutations() {
        // The whole point of the split: reordering / adding / removing
        // scaffolding tags forks the skeleton but not the first sentence.
        let a = "You are an AI agent for testing.\n<alpha>x</alpha>";
        let b = "You are an AI agent for testing.\n<beta>y</beta><gamma>z</gamma>";
        assert_ne!(
            structural_skeleton_hash(a),
            structural_skeleton_hash(b),
            "skeleton must still distinguish differing tag sets"
        );
        assert_eq!(
            prompt_hashes(a).first_sentence,
            prompt_hashes(b).first_sentence
        );
    }

    #[test]
    fn test_first_sentence_hash_differs_for_different_agents() {
        let browser = "You are an AI agent designed to automate browser tasks.\n<rules>x</rules>";
        let coder = "You are Claude Code, an AI coding assistant.\n<rules>x</rules>";
        assert_ne!(
            prompt_hashes(browser).first_sentence,
            prompt_hashes(coder).first_sentence
        );
    }

    #[test]
    fn test_first_sentence_hash_strips_billing_header() {
        let with_header = "x-anthropic-billing-header: cc_version=2.1.112.186; cc_entrypoint=sdk-ts; You are a helpful assistant.";
        let without = "You are a helpful assistant.";
        assert_eq!(
            prompt_hashes(with_header).first_sentence,
            prompt_hashes(without).first_sentence
        );
        let newer_sdk = "x-anthropic-billing-header: cc_version=2.2.0.1; cc_entrypoint=cli; You are a helpful assistant.";
        assert_eq!(
            prompt_hashes(with_header).first_sentence,
            prompt_hashes(newer_sdk).first_sentence
        );
    }

    #[test]
    fn test_prompt_hashes_skeleton_matches_standalone_fn() {
        let text = "You are a helpful assistant.\n<rules>be nice</rules>";
        assert_eq!(prompt_hashes(text).skeleton, structural_skeleton_hash(text));
        assert_eq!(prompt_hashes(text).first_sentence.len(), 8);
    }

    // ===================================================================
    // extract_system_message
    // ===================================================================

    #[test]
    fn test_extract_system_message_openai_format() {
        let input = serde_json::json!([
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "Hello"}
        ]);
        let (sys_text, remaining) = extract_system_message(&input).unwrap();
        assert_eq!(sys_text, "You are a helpful assistant.");
        assert_eq!(remaining.as_array().unwrap().len(), 1);
        assert_eq!(remaining[0]["role"], "user");
    }

    #[test]
    fn test_extract_system_message_gemini_parts_format() {
        let input = serde_json::json!([
            {"role": "system", "parts": [{"text": "You are a safety-focused agent."}]},
            {"role": "user", "parts": [{"text": "Do something"}]}
        ]);
        let (sys_text, remaining) = extract_system_message(&input).unwrap();
        assert_eq!(sys_text, "You are a safety-focused agent.");
        assert_eq!(remaining.as_array().unwrap().len(), 1);
    }

    #[test]
    fn test_extract_system_message_otel_genai_parts_format() {
        // OTel GenAI semconv (pydantic_ai et al.) — text lives under `content`
        // with a `type: "text"` discriminator, not under `text`.
        let input = serde_json::json!([
            {"role": "system", "parts": [{"type": "text", "content": "You are a safety-focused agent."}]},
            {"role": "user",   "parts": [{"type": "text", "content": "Do something"}]}
        ]);
        let (sys_text, remaining) = extract_system_message(&input).unwrap();
        assert_eq!(sys_text, "You are a safety-focused agent.");
        assert_eq!(remaining.as_array().unwrap().len(), 1);
    }

    #[test]
    fn test_extract_system_message_none_when_absent() {
        let input = serde_json::json!([
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi"}
        ]);
        assert!(extract_system_message(&input).is_none());
    }

    #[test]
    fn test_extract_system_message_none_for_non_array() {
        let input = serde_json::json!({"role": "system", "content": "test"});
        assert!(extract_system_message(&input).is_none());
    }

    /// Instrumentations that record the provider's whole request body wrap the
    /// messages array. Matching only the bare array dropped every such span:
    /// no prompt hash, no agent hash, and therefore no version — silently,
    /// because "no messages" and "no system message" are the same `None`.
    #[test]
    fn test_extract_system_message_through_wrapper_objects() {
        for key in ["messages", "contents", "input"] {
            let input = serde_json::json!({
                key: [
                    {"role": "system", "content": "You are a helpful assistant."},
                    {"role": "user", "content": "Hello"}
                ]
            });
            let (sys_text, remaining) = extract_system_message(&input)
                .unwrap_or_else(|| panic!("wrapper key `{key}` should resolve"));
            assert_eq!(sys_text, "You are a helpful assistant.");
            // Remaining is always a bare array, never the wrapper.
            assert_eq!(remaining.as_array().unwrap().len(), 1);
            assert_eq!(remaining[0]["role"], "user");
        }
    }

    /// A wrapped span must hash identically to the same conversation sent bare,
    /// or the wrapper alone would fork the agent identity.
    #[test]
    fn test_wrapper_and_bare_input_agree_on_hashes() {
        let messages = serde_json::json!([
            {"role": "system", "content": "You are an AI agent for testing.\n<rules>x</rules>"},
            {"role": "user", "content": "Hello"}
        ]);
        let wrapped = serde_json::json!({"messages": messages.clone()});
        let (bare_text, _) = extract_system_message(&messages).unwrap();
        let (wrapped_text, _) = extract_system_message(&wrapped).unwrap();
        assert_eq!(bare_text, wrapped_text);
        assert_eq!(
            prompt_hashes(&bare_text).first_sentence,
            prompt_hashes(&wrapped_text).first_sentence
        );
    }

    #[test]
    fn test_find_messages_array_shapes() {
        use serde_json::json;
        assert_eq!(
            find_messages_array(&json!([{"role": "user"}])).map(Vec::len),
            Some(1)
        );
        assert_eq!(
            find_messages_array(&json!({"messages": [{"role": "user"}]})).map(Vec::len),
            Some(1)
        );
        // First match wins when several wrapper keys are present.
        assert_eq!(
            find_messages_array(&json!({"messages": [{"a": 1}], "contents": [{"b": 2}, {"c": 3}]}))
                .map(Vec::len),
            Some(1)
        );
        // A wrapper key whose value isn't an array doesn't count.
        assert!(find_messages_array(&json!({"messages": "nope"})).is_none());
        assert!(find_messages_array(&json!({"foo": "bar"})).is_none());
        assert!(find_messages_array(&json!("plain")).is_none());
    }
}
