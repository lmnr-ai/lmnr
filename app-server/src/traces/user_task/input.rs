//! Turning a raw LLM-span input into the prepared extraction input:
//! last-turn user-part collection, signpost join/split, order-insensitive
//! canonicalization, and the combined [`UserTaskInput`].

use serde_json::Value;

use super::fingerprint::fingerprint_user_message;
use super::messages::{
    Role, collect_message_parts, find_messages_array, is_task_anchor_message, normalize_role,
    parts_from_body,
};

/// Separator inserted between user-message parts before the regex is
/// generated AND applied. Deliberately number-free so part order/count
/// doesn't fork regexes for the same shape.
pub const PART_SEPARATOR: &str = "\n\n== lmnr_part_separator ==\n\n";
/// Core signpost token — split on this (whitespace-insensitive at the
/// boundaries) when re-joining the extracted text.
const PART_SEPARATOR_CORE: &str = "== lmnr_part_separator ==";
/// Boundary between the system-prompt section and the user parts,
/// present only when the span input carries system content. Everything
/// above it is scaffolding by construction: `split_signposts_and_rejoin`
/// drops the boundary AND anything before it, so a permissive capture
/// (e.g. passthrough) can never leak system text into stored metadata.
pub const SYSTEM_SEPARATOR: &str = "\n\n== lmnr_end_of_system_prompt ==\n\n";
const SYSTEM_SEPARATOR_CORE: &str = "== lmnr_end_of_system_prompt ==";
/// Separator used when re-joining the extracted parts for storage.
pub const USER_FACING_SEPARATOR: &str = "\n\n";

/// Hard cap on the number of characters fed to the regex engine and the
/// regex-generation LLM call — keeps pathological inputs bounded.
const REGEX_INPUT_CAP_CHARS: usize = 200_000;

// ---------------------------------------------------------------------------
// Last-turn extraction
// ---------------------------------------------------------------------------

/// Collect the text parts of the last TURN's user messages: every
/// `role: user` message after the latest assistant message, or — when
/// the input carries no assistant message — every user message in it.
///
/// Anchoring on the whole turn rather than the single last user message
/// matters: a turn can span several user messages (tool results
/// interleaved, multi-part injections) and any of them may carry the
/// task.
pub fn extract_last_turn_user_parts(input: &Value) -> Option<Vec<String>> {
    let messages = find_messages_array(input)?;
    let last_assistant = messages
        .iter()
        .rposition(|m| normalize_role(m) == Role::Assistant);
    let start = last_assistant.map(|i| i + 1).unwrap_or(0);
    let parts: Vec<String> = messages[start..]
        .iter()
        .filter(|m| is_task_anchor_message(m))
        .flat_map(collect_message_parts)
        .filter(|p| !p.trim().is_empty())
        .collect();
    if parts.is_empty() { None } else { Some(parts) }
}

/// Concatenated system text: `role: system`/`developer` messages from
/// the messages array plus top-level system carriers (`system` for
/// Anthropic, `system_instruction`/`systemInstruction` for Gemini).
/// Bodies are either a string or a list of text blocks; both flatten
/// through the same permissive part parsing as user messages (non-text
/// blocks drop out) and join with a plain `\n\n` — system content is
/// additive safety only (the rare task-in-system-prompt is usually
/// delimited, e.g. XML tags, so a regex catches it without per-part
/// signposts), not worth forking regexes over.
pub fn extract_system_text(input: &Value) -> Option<String> {
    let mut parts: Vec<String> = Vec::new();
    if let Value::Object(map) = input {
        for key in ["system", "system_instruction", "systemInstruction"] {
            if let Some(body) = map.get(key) {
                match body {
                    // Gemini's system_instruction is message-shaped
                    // ({parts: [...]}), not a bare body.
                    Value::Object(obj)
                        if obj.contains_key("parts") || obj.contains_key("content") =>
                    {
                        parts.extend(collect_message_parts(body))
                    }
                    _ => parts.extend(parts_from_body(body)),
                }
            }
        }
    }
    if let Some(messages) = find_messages_array(input) {
        parts.extend(
            messages
                .iter()
                .filter(|m| normalize_role(m) == Role::System)
                .flat_map(collect_message_parts),
        );
    }
    let non_empty: Vec<&str> = parts
        .iter()
        .map(|p| p.trim())
        .filter(|p| !p.is_empty())
        .collect();
    if non_empty.is_empty() {
        None
    } else {
        Some(non_empty.join("\n\n"))
    }
}

// ---------------------------------------------------------------------------
// Signpost join / split
// ---------------------------------------------------------------------------

/// Join parts with the signpost separator. This exact text is what the
/// regex is generated from and applied to — never conflate it with the
/// user-facing joined form.
pub fn join_parts_signposted(parts: &[String]) -> Option<String> {
    let non_empty: Vec<&str> = parts
        .iter()
        .map(|p| p.trim())
        .filter(|p| !p.is_empty())
        .collect();
    if non_empty.is_empty() {
        return None;
    }
    Some(non_empty.join(PART_SEPARATOR))
}

/// Split extracted text on the signpost token and re-join with the
/// plain user-facing separator. Signposts must never leak into stored
/// metadata.
pub fn split_signposts_and_rejoin(extracted: &str) -> String {
    // A capture spanning the system boundary dragged system-prompt text
    // along (e.g. a passthrough regex) — everything up to and including
    // the boundary is scaffolding, so drop it, not just the token. A
    // capture taken entirely from inside the system prompt (the rare
    // task-in-system-prompt case) contains no boundary and is kept as is.
    let extracted = match extracted.rfind(SYSTEM_SEPARATOR_CORE) {
        Some(pos) => &extracted[pos + SYSTEM_SEPARATOR_CORE.len()..],
        None => extracted,
    };
    extracted
        .split(PART_SEPARATOR_CORE)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(USER_FACING_SEPARATOR)
}

// ---------------------------------------------------------------------------
// Fingerprinting (order-insensitive across parts)
// ---------------------------------------------------------------------------

/// Order-insensitive user naive signature: fingerprint each part,
/// sort, join. Multi-part messages arrive with unknown part order, so
/// two permutations of the same parts must share one regex cache entry.
pub fn fingerprint_user_parts(parts: &[String]) -> String {
    let mut fps: Vec<String> = parts.iter().map(|p| fingerprint_user_message(p)).collect();
    fps.sort();
    fps.join("|")
}

/// Sort parts into a canonical order: by structural fingerprint, then
/// by content. Because the regex cache key is order-insensitive
/// (sorted fingerprints) while the regex itself is layout-sensitive
/// (leading vs trailing scaffolding), the text the regex is generated
/// from and applied to must be order-insensitive too. Without this, a
/// regex generated from one arrival order can match a permuted order
/// with an EMPTY capture (`NoUserRequest`, not `NoMatch`), mis-marking
/// the trace `lmnr_user_task_not_found` and sliding the stale cache
/// entry's TTL instead of evicting it.
pub fn canonicalize_user_parts(parts: Vec<String>) -> Vec<String> {
    let mut keyed: Vec<(String, String)> = parts
        .into_iter()
        .map(|p| (fingerprint_user_message(&p), p))
        .collect();
    keyed.sort();
    keyed.into_iter().map(|(_, p)| p).collect()
}

fn truncate_to_chars(mut text: String, cap: usize) -> String {
    if let Some((byte_pos, _)) = text.char_indices().nth(cap) {
        text.truncate(byte_pos);
    }
    text
}

fn truncate_for_regex(text: String) -> String {
    truncate_to_chars(text, REGEX_INPUT_CAP_CHARS)
}

// ---------------------------------------------------------------------------
// Prepared input
// ---------------------------------------------------------------------------

/// The two derived values every pipeline stage needs. Producer computes
/// once and threads both through the queue so the consumer applies the
/// regex to byte-identical text.
#[derive(Debug, Clone, PartialEq)]
pub struct UserTaskInput {
    /// The regex target: optional system section + boundary signpost,
    /// then the signpost-joined last-turn user parts. Truncated.
    pub signposted_text: String,
    /// Order-insensitive user naive signature (part of the regex cache key).
    pub fingerprint: String,
}

pub fn prepare_user_task_input(input: &Value) -> Option<UserTaskInput> {
    let parts = canonicalize_user_parts(extract_last_turn_user_parts(input)?);
    let user_text = join_parts_signposted(&parts)?;
    // System text rides along for additional safety (the task very
    // occasionally lives there) but stays OUT of the fingerprint — the
    // regex cache key already carries the system-prompt identity via
    // `prompt_hash`. The user text keeps budget priority: the cap trims
    // from the END, so an oversized system prompt in front would
    // otherwise truncate away the user turn (the actual regex target).
    let signposted = match extract_system_text(input) {
        Some(system) => {
            let budget = REGEX_INPUT_CAP_CHARS
                .saturating_sub(user_text.chars().count() + SYSTEM_SEPARATOR.len());
            if budget == 0 {
                user_text
            } else {
                let system = truncate_to_chars(system, budget);
                format!("{system}{SYSTEM_SEPARATOR}{user_text}")
            }
        }
        None => user_text,
    };
    Some(UserTaskInput {
        signposted_text: truncate_for_regex(signposted),
        fingerprint: fingerprint_user_parts(&parts),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // ---- extract_last_turn_user_parts ------------------------------------

    #[test]
    fn last_turn_takes_all_user_messages_after_latest_assistant() {
        let v = json!([
            {"role": "user", "content": "old task"},
            {"role": "assistant", "content": "done"},
            {"role": "user", "content": "part one"},
            {"role": "tool", "content": "tool result"},
            {"role": "user", "content": "part two"}
        ]);
        assert_eq!(
            extract_last_turn_user_parts(&v),
            Some(vec!["part one".to_string(), "part two".to_string()])
        );
    }

    #[test]
    fn last_turn_without_assistant_takes_all_user_messages() {
        let v = json!([
            {"role": "system", "content": "sys"},
            {"role": "user", "content": "first"},
            {"role": "user", "content": "second"}
        ]);
        assert_eq!(
            extract_last_turn_user_parts(&v),
            Some(vec!["first".to_string(), "second".to_string()])
        );
    }

    #[test]
    fn last_turn_none_when_no_user_after_last_assistant() {
        let v = json!([
            {"role": "user", "content": "task"},
            {"role": "assistant", "content": "answer"}
        ]);
        assert_eq!(extract_last_turn_user_parts(&v), None);
    }

    #[test]
    fn last_turn_flattens_multipart_messages() {
        let v = json!([
            {"role": "ai", "content": "prev"},
            {"role": "human", "content": [
                {"type": "text", "text": "<env>x</env>"},
                {"type": "text", "text": "real ask"}
            ]}
        ]);
        assert_eq!(
            extract_last_turn_user_parts(&v),
            Some(vec!["<env>x</env>".to_string(), "real ask".to_string()])
        );
    }

    #[test]
    fn last_turn_gemini_contents_shape() {
        let v = json!({
            "contents": [
                {"role": "model", "parts": [{"text": "prev"}]},
                {"role": "user", "parts": [{"text": "Hello"}, {"text": "world"}]}
            ]
        });
        assert_eq!(
            extract_last_turn_user_parts(&v),
            Some(vec!["Hello".to_string(), "world".to_string()])
        );
    }

    #[test]
    fn last_turn_none_for_non_message_input() {
        assert_eq!(extract_last_turn_user_parts(&json!({"foo": "bar"})), None);
        assert_eq!(extract_last_turn_user_parts(&json!("just a string")), None);
    }

    // ---- extract_system_text ----------------------------------------------

    #[test]
    fn system_text_from_messages_string_and_blocks() {
        // String body + text-block list, joined with a plain \n\n;
        // `developer` folds into System.
        let v = json!([
            {"role": "system", "content": "be terse"},
            {"role": "developer", "content": [
                {"type": "text", "text": "block one"},
                {"type": "text", "text": "block two"}
            ]},
            {"role": "user", "content": "task"}
        ]);
        assert_eq!(
            extract_system_text(&v),
            Some("be terse\n\nblock one\n\nblock two".to_string())
        );
    }

    #[test]
    fn system_text_from_top_level_carriers() {
        // Anthropic: top-level `system` (string or text blocks).
        let v = json!({
            "system": "top-level system",
            "messages": [{"role": "user", "content": "task"}]
        });
        assert_eq!(
            extract_system_text(&v),
            Some("top-level system".to_string())
        );

        // Gemini: message-shaped `system_instruction`.
        let v = json!({
            "system_instruction": {"parts": [{"text": "gemini sys"}]},
            "contents": [{"role": "user", "parts": [{"text": "task"}]}]
        });
        assert_eq!(extract_system_text(&v), Some("gemini sys".to_string()));
    }

    #[test]
    fn system_text_filters_non_text_blocks_and_empties() {
        let v = json!([
            {"role": "system", "content": [
                {"type": "text", "text": "keep me"},
                {"type": "image", "source": {"data": "…"}},
                {"type": "text", "text": "   "}
            ]},
            {"role": "user", "content": "task"}
        ]);
        assert_eq!(extract_system_text(&v), Some("keep me".to_string()));
    }

    #[test]
    fn system_text_none_when_absent() {
        let v = json!([{"role": "user", "content": "task"}]);
        assert_eq!(extract_system_text(&v), None);
    }

    // ---- signpost join / split -------------------------------------------

    #[test]
    fn signpost_join_and_rejoin_round_trip() {
        let parts = vec!["first part".to_string(), "second part".to_string()];
        let joined = join_parts_signposted(&parts).unwrap();
        assert_eq!(
            joined,
            "first part\n\n== lmnr_part_separator ==\n\nsecond part"
        );
        assert_eq!(
            split_signposts_and_rejoin(&joined),
            "first part\n\nsecond part"
        );
    }

    #[test]
    fn signpost_join_skips_empty_parts() {
        let parts = vec!["  ".to_string(), "task".to_string(), "".to_string()];
        assert_eq!(join_parts_signposted(&parts), Some("task".to_string()));
        assert_eq!(join_parts_signposted(&["  ".to_string()]), None);
    }

    #[test]
    fn rejoin_handles_partial_separator_whitespace() {
        // A regex capture may clip the separator's surrounding newlines;
        // splitting on the core token still cleans it up.
        let extracted = "kept one== lmnr_part_separator ==kept two";
        assert_eq!(
            split_signposts_and_rejoin(extracted),
            "kept one\n\nkept two"
        );
    }

    #[test]
    fn rejoin_drops_system_section_when_capture_spans_boundary() {
        // A passthrough capture drags the whole system section along —
        // everything up to the boundary is scaffolding and must go.
        let extracted = "sys prompt\n\n== lmnr_end_of_system_prompt ==\n\nreal task== lmnr_part_separator ==more";
        assert_eq!(split_signposts_and_rejoin(extracted), "real task\n\nmore");
    }

    #[test]
    fn rejoin_keeps_capture_without_boundary_untouched() {
        // A capture taken from inside the system prompt (rare
        // task-in-system-prompt case) carries no boundary — keep it.
        assert_eq!(
            split_signposts_and_rejoin("task found in system prompt"),
            "task found in system prompt"
        );
    }

    // ---- fingerprint_user_parts ------------------------------------------

    #[test]
    fn fingerprint_is_order_insensitive() {
        let a = vec!["<env>x</env>".to_string(), "do the thing".to_string()];
        let b = vec!["do the thing".to_string(), "<env>y</env>".to_string()];
        assert_eq!(fingerprint_user_parts(&a), fingerprint_user_parts(&b));
        assert_eq!(fingerprint_user_parts(&a), "env,/env|plain");
    }

    #[test]
    fn fingerprint_differs_for_different_shapes() {
        let a = vec!["<env>x</env>".to_string()];
        let b = vec!["plain text".to_string()];
        assert_ne!(fingerprint_user_parts(&a), fingerprint_user_parts(&b));
    }

    // ---- prepare_user_task_input -----------------------------------------

    #[test]
    fn prepare_builds_signposted_text_and_fingerprint() {
        let v = json!([
            {"role": "assistant", "content": "prev"},
            {"role": "user", "content": [
                {"type": "text", "text": "<context>c</context>"},
                {"type": "text", "text": "the task"}
            ]}
        ]);
        let prepared = prepare_user_task_input(&v).unwrap();
        assert_eq!(
            prepared.signposted_text,
            "<context>c</context>\n\n== lmnr_part_separator ==\n\nthe task"
        );
        assert_eq!(prepared.fingerprint, "context,/context|plain");
    }

    #[test]
    fn prepare_is_order_insensitive_across_part_permutations() {
        // Both derived values must be permutation-invariant: the cache
        // key (fingerprint) already is, so the regex target text has to
        // be too — a layout-sensitive regex generated from one arrival
        // order would otherwise capture empty on a permuted order and
        // mis-mark the trace as "no user request".
        let a = json!([
            {"role": "user", "content": [
                {"type": "text", "text": "<env>x</env>"},
                {"type": "text", "text": "do the thing"}
            ]}
        ]);
        let b = json!([
            {"role": "user", "content": [
                {"type": "text", "text": "do the thing"},
                {"type": "text", "text": "<env>x</env>"}
            ]}
        ]);
        let pa = prepare_user_task_input(&a).unwrap();
        let pb = prepare_user_task_input(&b).unwrap();
        assert_eq!(pa, pb);
        assert_eq!(
            pa.signposted_text,
            "<env>x</env>\n\n== lmnr_part_separator ==\n\ndo the thing"
        );
    }

    #[test]
    fn prepare_prepends_system_section_with_boundary() {
        let v = json!([
            {"role": "system", "content": "you are an agent"},
            {"role": "assistant", "content": "prev"},
            {"role": "user", "content": "the task"}
        ]);
        let prepared = prepare_user_task_input(&v).unwrap();
        assert_eq!(
            prepared.signposted_text,
            "you are an agent\n\n== lmnr_end_of_system_prompt ==\n\nthe task"
        );
        // System content must not fork the fingerprint — the regex cache
        // key carries system identity via `prompt_hash`.
        assert_eq!(prepared.fingerprint, "plain");
    }

    #[test]
    fn prepare_system_section_survives_rejoin_strip() {
        // End-to-end: a passthrough capture over the prepared text must
        // still store only the user side.
        let v = json!({
            "system": "sys scaffolding",
            "messages": [{"role": "user", "content": "do the thing"}]
        });
        let prepared = prepare_user_task_input(&v).unwrap();
        assert_eq!(
            split_signposts_and_rejoin(&prepared.signposted_text),
            "do the thing"
        );
    }

    #[test]
    fn prepare_truncates_system_before_user_text() {
        // The cap must trim the (leading) system section, never the user
        // turn that follows it.
        let v = json!([
            {"role": "system", "content": "s".repeat(300_000)},
            {"role": "user", "content": "the task"}
        ]);
        let prepared = prepare_user_task_input(&v).unwrap();
        assert!(
            prepared
                .signposted_text
                .ends_with("== lmnr_end_of_system_prompt ==\n\nthe task")
        );
        assert!(prepared.signposted_text.chars().count() <= 200_000 + 50);
    }
}
