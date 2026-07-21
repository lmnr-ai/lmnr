//! Turning a raw LLM-span input into the prepared extraction input:
//! last-user-block collection, signpost join/split, order-insensitive
//! canonicalization, and the combined [`UserTaskInput`].

use serde_json::Value;

use super::fingerprint::fingerprint_user_message;
use super::messages::{
    Role, collect_message_parts, find_messages_array, is_task_anchor_message, normalize_role,
};

/// Separator inserted between user-message parts before the regex is
/// generated AND applied. Deliberately number-free so part order/count
/// doesn't fork regexes for the same shape.
pub const PART_SEPARATOR: &str = "\n\n== lmnr_part_separator ==\n\n";
/// Core signpost token — split on this (whitespace-insensitive at the
/// boundaries) when re-joining the extracted text.
const PART_SEPARATOR_CORE: &str = "== lmnr_part_separator ==";
/// Separator used when re-joining the extracted parts for storage.
pub const USER_FACING_SEPARATOR: &str = "\n\n";

/// Hard cap on the number of characters fed to the regex engine and the
/// regex-generation LLM call — keeps pathological inputs bounded.
const REGEX_INPUT_CAP_CHARS: usize = 200_000;

/// Fingerprint prefix for user blocks preceded by assistant/model history.
/// First prompts of a conversation usually have a different shape than
/// follow-ups, and the tag-based fingerprint alone doesn't always capture
/// that — forking the cache key on history over-generates regexes for
/// better extraction quality. "History" is anchor-relative: an assistant
/// message BEFORE the extracted user block, never one after it — the
/// original task at index 0 of a long agentic conversation fingerprints
/// identically from every span of that trace.
pub const HAS_HISTORY_FINGERPRINT_PREFIX: &str = "has_history|";

// ---------------------------------------------------------------------------
// Last-user-block extraction
// ---------------------------------------------------------------------------

/// Collect the text parts of the LAST USER BLOCK: scan from the end,
/// skip messages until the first user message with non-empty rendered
/// text (the anchor), then extend backwards through the consecutive run
/// of such user messages. Returns the parts in original order plus the
/// anchor-relative history flag (any assistant/model message strictly
/// before the block's first message).
///
/// Two boundary rules with different roles:
///   - BEFORE the anchor is found, empty-rendered user messages (e.g.
///     tool_result-only) are skipped like any non-user message;
///   - AFTER the anchor, they TERMINATE the run — a tool_result carries
///     the user role but is a turn boundary, and merging through it
///     would glue a previous instruction onto the current one.
pub fn extract_last_user_block(input: &Value) -> Option<(Vec<String>, bool)> {
    let single = std::slice::from_ref(input);
    let messages: &[Value] = match find_messages_array(input) {
        Some(arr) => arr,
        None if input.is_object() => single,
        None => return None,
    };
    let anchor = messages.iter().rposition(is_task_anchor_message)?;
    let block_start = messages[..anchor]
        .iter()
        .rposition(|m| !is_task_anchor_message(m))
        .map(|i| i + 1)
        .unwrap_or(0);
    let parts: Vec<String> = messages[block_start..=anchor]
        .iter()
        .flat_map(collect_message_parts)
        .filter(|p| !p.trim().is_empty())
        .collect();
    if parts.is_empty() {
        return None;
    }
    let has_history = messages[..block_start]
        .iter()
        .any(|m| normalize_role(m) == Role::Assistant);
    Some((parts, has_history))
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
/// the trace's `lmnr_user_task` as `false` and sliding the stale cache
/// entry's TTL instead of evicting it.
pub fn canonicalize_user_parts(parts: Vec<String>) -> Vec<String> {
    let mut keyed: Vec<(String, String)> = parts
        .into_iter()
        .map(|p| (fingerprint_user_message(&p), p))
        .collect();
    keyed.sort();
    keyed.into_iter().map(|(_, p)| p).collect()
}

fn truncate_for_regex(mut text: String) -> String {
    if let Some((byte_pos, _)) = text.char_indices().nth(REGEX_INPUT_CAP_CHARS) {
        text.truncate(byte_pos);
    }
    text
}

// ---------------------------------------------------------------------------
// Prepared input
// ---------------------------------------------------------------------------

/// The two derived values every pipeline stage needs. Producer computes
/// once and threads both through the queue so the consumer applies the
/// regex to byte-identical text.
#[derive(Debug, Clone, PartialEq)]
pub struct UserTaskInput {
    /// The regex target: the signpost-joined last-turn user parts.
    /// Truncated.
    pub signposted_text: String,
    /// Order-insensitive user naive signature (part of the regex cache
    /// key), prefixed with [`HAS_HISTORY_FINGERPRINT_PREFIX`] when the
    /// user block follows assistant/model history.
    pub fingerprint: String,
}

pub fn prepare_user_task_input(input: &Value) -> Option<UserTaskInput> {
    let (parts, has_history) = extract_last_user_block(input)?;
    let parts = canonicalize_user_parts(parts);
    let user_text = join_parts_signposted(&parts)?;
    let mut fingerprint = fingerprint_user_parts(&parts);
    if has_history {
        fingerprint = format!("{HAS_HISTORY_FINGERPRINT_PREFIX}{fingerprint}");
    }
    Some(UserTaskInput {
        signposted_text: truncate_for_regex(user_text),
        fingerprint,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // ---- extract_last_user_block ------------------------------------------

    #[test]
    fn last_block_is_terminated_by_non_user_and_empty_user_messages() {
        // The tool message breaks the run — "part one" belongs to an
        // earlier turn and must NOT merge into the block.
        let v = json!([
            {"role": "user", "content": "old task"},
            {"role": "assistant", "content": "done"},
            {"role": "user", "content": "part one"},
            {"role": "tool", "content": "tool result"},
            {"role": "user", "content": "part two"}
        ]);
        assert_eq!(
            extract_last_user_block(&v),
            Some((vec!["part two".to_string()], true))
        );
        // An empty-rendered user message (tool_result-only) is a turn
        // boundary too, even though it carries the user role.
        let v = json!([
            {"role": "user", "content": "old task"},
            {"role": "assistant", "content": "calling"},
            {"role": "user", "content": [{"type": "tool_result", "content": "result"}]},
            {"role": "user", "content": "follow-up"}
        ]);
        assert_eq!(
            extract_last_user_block(&v),
            Some((vec!["follow-up".to_string()], true))
        );
    }

    #[test]
    fn last_block_merges_consecutive_user_messages() {
        let v = json!([
            {"role": "system", "content": "sys"},
            {"role": "user", "content": "first"},
            {"role": "user", "content": "second"}
        ]);
        assert_eq!(
            extract_last_user_block(&v),
            Some((vec!["first".to_string(), "second".to_string()], false))
        );
    }

    #[test]
    fn last_block_skips_trailing_non_user_messages_to_find_anchor() {
        // Mid-conversation spans re-find the original task even when the
        // input ends with assistant/tool turns (tool results render
        // empty, so the anchor lands on the original user message).
        let v = json!([
            {"role": "user", "content": "task"},
            {"role": "assistant", "content": "answer"}
        ]);
        assert_eq!(
            extract_last_user_block(&v),
            Some((vec!["task".to_string()], false))
        );
    }

    #[test]
    fn last_block_flattens_multipart_messages() {
        let v = json!([
            {"role": "ai", "content": "prev"},
            {"role": "human", "content": [
                {"type": "text", "text": "<env>x</env>"},
                {"type": "text", "text": "real ask"}
            ]}
        ]);
        assert_eq!(
            extract_last_user_block(&v),
            Some((
                vec!["<env>x</env>".to_string(), "real ask".to_string()],
                true
            ))
        );
    }

    #[test]
    fn last_block_gemini_contents_shape() {
        let v = json!({
            "contents": [
                {"role": "model", "parts": [{"text": "prev"}]},
                {"role": "user", "parts": [{"text": "Hello"}, {"text": "world"}]}
            ]
        });
        assert_eq!(
            extract_last_user_block(&v),
            Some((vec!["Hello".to_string(), "world".to_string()], true))
        );
    }

    #[test]
    fn last_block_none_for_non_message_input() {
        assert_eq!(extract_last_user_block(&json!({"foo": "bar"})), None);
        assert_eq!(extract_last_user_block(&json!("just a string")), None);
        // A bare single-message object is accepted.
        assert_eq!(
            extract_last_user_block(&json!({"role": "user", "content": "hi"})),
            Some((vec!["hi".to_string()], false))
        );
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
        assert_eq!(prepared.fingerprint, "has_history|context,/context|plain");
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
    fn prepare_ignores_system_messages() {
        let v = json!([
            {"role": "system", "content": "you are an agent"},
            {"role": "assistant", "content": "prev"},
            {"role": "user", "content": "the task"}
        ]);
        let prepared = prepare_user_task_input(&v).unwrap();
        assert_eq!(prepared.signposted_text, "the task");
        assert_eq!(prepared.fingerprint, "has_history|plain");
    }

    #[test]
    fn prepare_forks_fingerprint_on_history() {
        // Same block shape, but a first prompt and a follow-up must not
        // share a regex cache entry.
        let first = json!([
            {"role": "user", "content": "the task"}
        ]);
        let followup = json!([
            {"role": "user", "content": "old task"},
            {"role": "assistant", "content": "done"},
            {"role": "user", "content": "the task"}
        ]);
        let p_first = prepare_user_task_input(&first).unwrap();
        let p_followup = prepare_user_task_input(&followup).unwrap();
        assert_eq!(p_first.fingerprint, "plain");
        assert_eq!(p_followup.fingerprint, "has_history|plain");
        assert_eq!(p_first.signposted_text, p_followup.signposted_text);
    }

    #[test]
    fn history_is_anchor_relative_not_input_wide() {
        // A later main-loop span re-finds the original task (tool results
        // render empty); assistant messages AFTER the anchored block are
        // not history, so every span of the trace fingerprints the same.
        let turn_one = json!([
            {"role": "user", "content": "the task"}
        ]);
        let mid_loop = json!([
            {"role": "user", "content": "the task"},
            {"role": "assistant", "content": [
                {"type": "text", "text": "on it"},
                {"type": "tool_use", "id": "t1", "name": "run", "input": {}}
            ]},
            {"role": "user", "content": [{"type": "tool_result", "content": "ok"}]}
        ]);
        let p1 = prepare_user_task_input(&turn_one).unwrap();
        let p2 = prepare_user_task_input(&mid_loop).unwrap();
        assert_eq!(p1.fingerprint, "plain");
        assert_eq!(p2.fingerprint, "plain");
        assert_eq!(p1.signposted_text, p2.signposted_text);
    }

    #[test]
    fn prepare_detects_history_for_model_role() {
        // Gemini-style `model` role counts as assistant history.
        let v = json!({
            "contents": [
                {"role": "model", "parts": [{"text": "prev"}]},
                {"role": "user", "parts": [{"text": "the task"}]}
            ]
        });
        let prepared = prepare_user_task_input(&v).unwrap();
        assert_eq!(prepared.fingerprint, "has_history|plain");
    }
}
