//! Turning a raw LLM-span input into the prepared extraction input:
//! last-turn user-part collection, signpost join/split, order-insensitive
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

<<<<<<< Updated upstream
/// Fingerprint prefix for last turns preceded by assistant/model history.
/// First prompts of a conversation usually have a different shape than
/// follow-ups, and the tag-based fingerprint alone doesn't always capture
/// that — forking the cache key on history over-generates regexes for
/// better extraction quality.
pub const HAS_HISTORY_FINGERPRINT_PREFIX: &str = "has_history|";

/// The winner-lock `user_sig` for a fingerprint: the history prefix
/// stripped. The prefix forks the REGEX cache key only — for lock
/// arbitration, turn 1 (`plain`) and turn 2 (`has_history|plain`) of a
/// conversation are the SAME agent, and equal-depth override requires an
/// exact sig match, so keeping the prefix would block every follow-up
/// turn from overriding the first prompt's lock and freeze
/// `lmnr_user_task` on it for the lock TTL.
pub fn lock_user_sig(fingerprint: &str) -> &str {
    fingerprint
        .strip_prefix(HAS_HISTORY_FINGERPRINT_PREFIX)
        .unwrap_or(fingerprint)
}

=======
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
    /// Order-insensitive user naive signature (part of the regex cache
    /// key), prefixed with [`HAS_HISTORY_FINGERPRINT_PREFIX`] when the
    /// last turn follows assistant/model history.
=======
    /// Order-insensitive user naive signature (part of the regex cache key).
>>>>>>> Stashed changes
    pub fingerprint: String,
}

pub fn prepare_user_task_input(input: &Value) -> Option<UserTaskInput> {
    let parts = canonicalize_user_parts(extract_last_turn_user_parts(input)?);
    let user_text = join_parts_signposted(&parts)?;
<<<<<<< Updated upstream
    let mut fingerprint = fingerprint_user_parts(&parts);
    // The last turn's parts come after the LAST assistant message, so any
    // assistant/model message in the input is prior history.
    if has_prior_assistant(input) {
        fingerprint = format!("{HAS_HISTORY_FINGERPRINT_PREFIX}{fingerprint}");
    }
    Some(UserTaskInput {
        signposted_text: truncate_for_regex(user_text),
        fingerprint,
    })
}

fn has_prior_assistant(input: &Value) -> bool {
    find_messages_array(input).is_some_and(|messages| {
        messages
            .iter()
            .any(|m| normalize_role(m) == Role::Assistant)
=======
    Some(UserTaskInput {
        signposted_text: truncate_for_regex(user_text),
        fingerprint: fingerprint_user_parts(&parts),
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
        assert_eq!(prepared.fingerprint, "has_history|context,/context|plain");
=======
        assert_eq!(prepared.fingerprint, "context,/context|plain");
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
        assert_eq!(prepared.fingerprint, "has_history|plain");
    }

    #[test]
    fn prepare_forks_fingerprint_on_history() {
        // Same last-turn shape, but a first prompt and a follow-up must
        // not share a regex cache entry.
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
    fn lock_user_sig_strips_history_prefix() {
        // First-turn and follow-up fingerprints of the same conversation
        // must map to one lock sig, or equal-depth override (exact sig
        // match required) would freeze `lmnr_user_task` on the first
        // prompt for the whole lock TTL.
        assert_eq!(lock_user_sig("plain"), "plain");
        assert_eq!(lock_user_sig("has_history|plain"), "plain");
        assert_eq!(
            lock_user_sig("has_history|context,/context|plain"),
            "context,/context|plain"
        );
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
=======
        assert_eq!(prepared.fingerprint, "plain");
>>>>>>> Stashed changes
    }
}
