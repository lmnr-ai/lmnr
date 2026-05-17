//! Walk a JSON document, render its string leaves into a single natural-text
//! string for the model to process, then route detected PII spans back to the
//! originating leaves and serialize the redacted tree.
//!
//! Why this exists: the OpenAI privacy-filter is a token-classification NER
//! model trained on natural text. Feeding it raw JSON syntax (escaped quotes,
//! braces, separators) destroys its accuracy. By extracting just the string
//! values and rendering them as `key: value\n\n...` lines, we present the
//! model with text that resembles its training distribution.
//!
//! Key design points:
//! - Object keys are NEVER redacted (always structural).
//! - `skip_keys` lets callers drop structural-metadata string values
//!   (e.g. `tool_use_id`, `role`) from redaction.
//! - String leaves whose content is itself valid JSON are recursively walked
//!   (capped at `MAX_RECURSION_DEPTH` to prevent pathological nesting).
//! - The mapping back to original leaves is offset-based: rendered text spans
//!   that fall in non-leaf regions (key prefixes, separators) are silently
//!   discarded; spans straddling two leaves get split per leaf.

use std::collections::HashSet;

use anyhow::{Context, Result, anyhow};
use serde_json::Value;

use crate::engine::Span;

/// Hard cap on how deep we recurse into stringified-JSON leaves. Realistic
/// payloads bottom out at 1-2 levels; the cap is to make pathological nested
/// inputs noisy rather than infinite-loop.
pub const MAX_RECURSION_DEPTH: usize = 8;

/// Separator inserted between rendered leaves. Double newline matches the
/// paragraph-break pattern the model has seen in training data, and is
/// unlikely to be continued as a single entity by the BIOES decoder.
const LEAF_SEPARATOR: &str = "\n\n";

/// Default `skip_keys` if the caller omits the field. Tuned for common LLM
/// agent payload shapes (Anthropic, OpenAI, LangChain tool results).
pub const DEFAULT_SKIP_KEYS: &[&str] = &[
    "type",
    "role",
    "id",
    "tool_use_id",
    "tool_call_id",
    "name",
    "model",
    "stop_reason",
    "stop_sequence",
    "cache_control",
    "action_key",
    "$summary",
    "stash_id",
];

/// Reference to one string leaf within the (possibly mutated) JSON tree.
#[derive(Debug, Clone)]
pub struct LeafRef {
    /// RFC 6901 JSON Pointer to this leaf within the walked tree.
    /// After walking, stringified-JSON wrappers have been replaced by their
    /// parsed Value, so this pointer can resolve through them.
    pub pointer: String,
    /// The leaf's original string value (pre-redaction, decoded).
    pub original: String,
    /// Byte offset of this leaf's value in the rendered text.
    /// Inclusive lower bound. Excludes any leading `key: ` prefix.
    pub value_start: usize,
    /// Byte offset (exclusive) of the leaf's value end in the rendered text.
    pub value_end: usize,
}

/// Marker for a pointer in the tree where we replaced a stringified-JSON
/// leaf with its parsed Value. After redaction we re-serialize at these
/// pointers, deepest first.
#[derive(Debug, Clone)]
struct StringifiedMarker {
    pointer: String,
    /// Depth = number of `/` in pointer. Used to sort deepest-first for
    /// re-serialization (so inner stringified JSONs re-serialize before
    /// their containing outer ones).
    depth: usize,
}

#[derive(Debug)]
pub struct WalkedJson {
    /// The parsed tree. Stringified-JSON leaves have been replaced in-place
    /// with their parsed Value; we re-stringify them on output.
    tree: Value,
    /// One entry per redaction-eligible string leaf, in render order.
    pub leaves: Vec<LeafRef>,
    /// All string values rendered into one `key: value\n\nkey: value\n\n...`
    /// document, ready to feed to the model.
    pub rendered: String,
    /// Pointers in `tree` that were originally stringified JSON and need
    /// re-stringification at serialize-out time.
    stringified_markers: Vec<StringifiedMarker>,
}

/// Parse `input` as JSON, walk it, render all string leaves into one
/// natural-text document with key prefixes.
///
/// Returns a `WalkedJson` carrying everything needed to (a) feed the model,
/// (b) route detected spans back to leaves, (c) emit redacted output.
pub fn walk_and_render(input: &str, skip_keys: &HashSet<String>) -> Result<WalkedJson> {
    let mut tree: Value = serde_json::from_str(input)
        .with_context(|| "input is not valid JSON; the Redact RPC requires stringified JSON")?;
    let mut leaves = Vec::new();
    let mut rendered = String::new();
    let mut stringified_markers = Vec::new();
    walk(
        &mut tree,
        String::new(),
        None,
        0,
        skip_keys,
        &mut leaves,
        &mut rendered,
        &mut stringified_markers,
    );
    // Trim trailing separator for cleanliness — doesn't affect mapping since
    // value_end offsets are already correct, and the model treats trailing
    // whitespace as a no-op.
    if rendered.ends_with(LEAF_SEPARATOR) {
        rendered.truncate(rendered.len() - LEAF_SEPARATOR.len());
    }
    Ok(WalkedJson {
        tree,
        leaves,
        rendered,
        stringified_markers,
    })
}

/// Recursive walk over `value`. Mutates `value` in place for stringified-JSON
/// expansion. Appends rendered text + leaf refs as it goes.
fn walk(
    value: &mut Value,
    pointer: String,
    parent_key: Option<&str>,
    depth: usize,
    skip_keys: &HashSet<String>,
    leaves: &mut Vec<LeafRef>,
    rendered: &mut String,
    markers: &mut Vec<StringifiedMarker>,
) {
    match value {
        Value::Object(map) => {
            for (k, v) in map.iter_mut() {
                if skip_keys.contains(k) {
                    continue;
                }
                let child_pointer = format!("{}/{}", pointer, escape_pointer_token(k));
                walk(
                    v,
                    child_pointer,
                    Some(k.as_str()),
                    depth,
                    skip_keys,
                    leaves,
                    rendered,
                    markers,
                );
            }
        }
        Value::Array(arr) => {
            for (i, v) in arr.iter_mut().enumerate() {
                let child_pointer = format!("{}/{}", pointer, i);
                // Array elements inherit the parent's key for rendering
                // context (e.g. `messages: hello` for each `messages[i]`).
                walk(
                    v,
                    child_pointer,
                    parent_key,
                    depth,
                    skip_keys,
                    leaves,
                    rendered,
                    markers,
                );
            }
        }
        Value::String(s) => {
            // Recurse into stringified JSON (objects/arrays only — scalars
            // would just be re-rendered without gain and risk treating
            // "1234" as a number leaf rather than a redactable string).
            if depth < MAX_RECURSION_DEPTH {
                if let Ok(parsed) = serde_json::from_str::<Value>(s) {
                    if parsed.is_object() || parsed.is_array() {
                        *value = parsed;
                        markers.push(StringifiedMarker {
                            pointer: pointer.clone(),
                            depth: pointer.matches('/').count(),
                        });
                        // Re-dispatch on the now-replaced value.
                        walk(
                            value,
                            pointer,
                            parent_key,
                            depth + 1,
                            skip_keys,
                            leaves,
                            rendered,
                            markers,
                        );
                        return;
                    }
                }
            }
            if s.is_empty() {
                return;
            }
            // Render key prefix (skipped if there's no parent key, e.g. root
            // is a bare string or root-level array element).
            if let Some(k) = parent_key {
                rendered.push_str(k);
                rendered.push_str(": ");
            }
            let value_start = rendered.len();
            rendered.push_str(s);
            let value_end = rendered.len();
            leaves.push(LeafRef {
                pointer,
                original: s.clone(),
                value_start,
                value_end,
            });
            rendered.push_str(LEAF_SEPARATOR);
        }
        // Numbers, booleans, nulls: structurally meaningful, no string
        // content to redact. Walked over silently.
        _ => {}
    }
}

/// Escape `/` and `~` per RFC 6901 so the produced JSON Pointer survives
/// `Value::pointer_mut`.
fn escape_pointer_token(s: &str) -> String {
    s.replace('~', "~0").replace('/', "~1")
}

/// Apply detected spans back to the walked tree, re-stringify all originally
/// stringified-JSON wrappers, and emit the final JSON string.
pub fn apply_spans_and_serialize(
    walked: WalkedJson,
    spans: Vec<Span>,
    placeholder_fmt: &str,
) -> Result<String> {
    let WalkedJson {
        mut tree,
        leaves,
        rendered: _,
        mut stringified_markers,
    } = walked;

    // Route spans → per-leaf (local_start, local_end, label) lists.
    let mut per_leaf: Vec<Vec<(usize, usize, String)>> = vec![Vec::new(); leaves.len()];
    for span in spans {
        // A span CAN straddle adjacent leaves if the model decoder ran an
        // entity across our `\n\n` separator. Clip the span to every leaf
        // it overlaps; the result is either a single in-leaf range or two
        // partial ranges in adjacent leaves. Same-label adjacent ranges
        // get merged by `redact_text`'s in-leaf logic later.
        for (i, leaf) in leaves.iter().enumerate() {
            let overlap_start = span.start.max(leaf.value_start);
            let overlap_end = span.end.min(leaf.value_end);
            if overlap_start < overlap_end {
                per_leaf[i].push((
                    overlap_start - leaf.value_start,
                    overlap_end - leaf.value_start,
                    span.label.clone(),
                ));
            }
        }
    }

    // Apply redactions per leaf and write back via JSON Pointer mutation.
    for (leaf, local_spans) in leaves.into_iter().zip(per_leaf.into_iter()) {
        if local_spans.is_empty() {
            continue;
        }
        let redacted = redact_string(&leaf.original, local_spans, placeholder_fmt);
        let slot = tree
            .pointer_mut(&leaf.pointer)
            .ok_or_else(|| anyhow!("leaf pointer {} no longer valid in tree", leaf.pointer))?;
        *slot = Value::String(redacted);
    }

    // Re-stringify in deepest-first order so that inner stringified JSONs are
    // serialized before their containing outer ones (otherwise outer
    // serialization would freeze the not-yet-restringified inner subtree).
    stringified_markers.sort_by(|a, b| b.depth.cmp(&a.depth));
    for marker in stringified_markers {
        let slot = tree.pointer_mut(&marker.pointer).ok_or_else(|| {
            anyhow!(
                "stringified-JSON marker {} no longer valid in tree",
                marker.pointer
            )
        })?;
        let serialized = serde_json::to_string(slot)
            .with_context(|| format!("re-serializing inner JSON at {}", marker.pointer))?;
        *slot = Value::String(serialized);
    }

    serde_json::to_string(&tree).with_context(|| "serializing final redacted tree")
}

/// Apply `(local_start, local_end, label)` redactions to `text`. Adjacent or
/// overlapping same-label ranges are merged so a single entity that arrived
/// as multiple partial spans (e.g. from chunk-boundary fragmentation)
/// collapses into one placeholder.
fn redact_string(text: &str, mut spans: Vec<(usize, usize, String)>, fmt: &str) -> String {
    if spans.is_empty() {
        return text.to_string();
    }
    spans.sort_by_key(|(s, _, _)| *s);
    let mut merged: Vec<(usize, usize, String)> = Vec::with_capacity(spans.len());
    for (s, e, lbl) in spans {
        match merged.last_mut() {
            Some(prev) if prev.1 >= s && prev.2 == lbl => {
                if e > prev.1 {
                    prev.1 = e;
                }
            }
            _ => merged.push((s, e, lbl)),
        }
    }
    let bytes = text.as_bytes();
    let mut out = String::with_capacity(text.len());
    let mut cursor = 0;
    for (s, e, lbl) in merged {
        if s < cursor || s > bytes.len() || e > bytes.len() {
            continue;
        }
        if !text.is_char_boundary(s) || !text.is_char_boundary(e) {
            continue;
        }
        out.push_str(&text[cursor..s]);
        out.push_str(&fmt.replace("{LABEL}", &lbl.to_uppercase()));
        cursor = e;
    }
    if cursor < bytes.len() {
        out.push_str(&text[cursor..]);
    }
    out
}

/// Build a `HashSet` of the default skip keys plus any caller-supplied ones.
/// If the caller passes a non-empty list, it REPLACES the defaults; pass
/// `&[]` to use defaults.
pub fn build_skip_keys(caller_supplied: &[String]) -> HashSet<String> {
    if caller_supplied.is_empty() {
        DEFAULT_SKIP_KEYS.iter().map(|s| (*s).to_string()).collect()
    } else {
        caller_supplied.iter().cloned().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};

    fn skip_keys(keys: &[&str]) -> HashSet<String> {
        keys.iter().map(|s| s.to_string()).collect()
    }

    fn no_skip() -> HashSet<String> {
        HashSet::new()
    }

    // ---- walk_and_render ---------------------------------------------------

    #[test]
    fn errors_on_invalid_json() {
        let err = walk_and_render("not json at all", &no_skip()).unwrap_err();
        assert!(
            err.to_string().contains("not valid JSON"),
            "got: {err:#}"
        );
    }

    #[test]
    fn renders_simple_object_with_key_prefixes() {
        let w = walk_and_render(r#"{"name":"Robert","email":"r@example.com"}"#, &no_skip()).unwrap();
        // Keys appear inline; values are in order.
        assert!(w.rendered.contains("name: Robert"));
        assert!(w.rendered.contains("email: r@example.com"));
        // Two leaves, both Direct.
        assert_eq!(w.leaves.len(), 2);
        // Value offsets point at the value text only — NOT the key prefix.
        for leaf in &w.leaves {
            let slice = &w.rendered[leaf.value_start..leaf.value_end];
            assert_eq!(slice, leaf.original);
            // The character right before value_start should be a space (from
            // `"key: "`), proving the key prefix isn't included in the range.
            if leaf.value_start > 0 {
                assert_eq!(&w.rendered[leaf.value_start - 1..leaf.value_start], " ");
            }
        }
    }

    #[test]
    fn skip_keys_removes_those_values_from_leaves_and_rendered() {
        let w = walk_and_render(
            r#"{"role":"user","content":"hello","type":"text"}"#,
            &skip_keys(&["role", "type"]),
        )
        .unwrap();
        assert_eq!(w.leaves.len(), 1);
        assert_eq!(w.leaves[0].original, "hello");
        assert!(!w.rendered.contains("user"));
        assert!(!w.rendered.contains("text"));
        assert!(w.rendered.contains("content: hello"));
    }

    #[test]
    fn arrays_use_parent_key_for_each_element() {
        let w = walk_and_render(r#"{"messages":["hello","world"]}"#, &no_skip()).unwrap();
        assert_eq!(w.leaves.len(), 2);
        // Both array elements get the parent key for context.
        assert!(w.rendered.contains("messages: hello"));
        assert!(w.rendered.contains("messages: world"));
    }

    #[test]
    fn empty_strings_are_skipped() {
        let w = walk_and_render(r#"{"a":"","b":"real"}"#, &no_skip()).unwrap();
        assert_eq!(w.leaves.len(), 1);
        assert_eq!(w.leaves[0].original, "real");
    }

    #[test]
    fn numbers_and_bools_are_passed_through_silently() {
        let w = walk_and_render(
            r#"{"n":42,"b":true,"x":null,"s":"text"}"#,
            &no_skip(),
        )
        .unwrap();
        assert_eq!(w.leaves.len(), 1);
        assert_eq!(w.leaves[0].original, "text");
    }

    #[test]
    fn stringified_json_object_is_recursively_walked() {
        // The inner string is itself valid JSON — should be parsed and its
        // leaves rendered alongside the outer ones.
        let input = r#"{"outer":"{\"inner\":\"deep\"}"}"#;
        let w = walk_and_render(input, &no_skip()).unwrap();
        // Only the deep leaf surfaces as redactable; the outer string was
        // replaced with its parsed Value.
        assert_eq!(w.leaves.len(), 1);
        assert_eq!(w.leaves[0].original, "deep");
        assert!(w.rendered.contains("inner: deep"));
    }

    #[test]
    fn stringified_json_array_is_recursively_walked() {
        let input = r#"{"payload":"[\"a\",\"b\"]"}"#;
        let w = walk_and_render(input, &no_skip()).unwrap();
        assert_eq!(w.leaves.len(), 2);
        assert!(w.rendered.contains("payload: a"));
        assert!(w.rendered.contains("payload: b"));
    }

    #[test]
    fn deeply_nested_stringified_json_user_example() {
        // The exact shape the user pasted: Anthropic tool_result envelope
        // with a stringified-JSON tool output inside content[0].content[0].text.
        let input = r#"{"content":[{"cache_control":{"type":"ephemeral"},"content":[{"text":"{\n  \"action_key\": \"gmail-find-email\",\n  \"account_id\": \"apn_1KhW56n\",\n  \"exports\": {\n    \"$summary\": \"Successfully found 0 messages\"\n  },\n  \"ret\": [],\n  \"os\": [],\n  \"stash_id\": null\n}","type":"text"}],"tool_use_id":"toolu_bdrk_01K8cC6cBWwqNRgBFjSCz1dv","type":"tool_result"}],"role":"user"}"#;
        let w = walk_and_render(input, &build_skip_keys(&[])).unwrap();
        // With default skip_keys, `type`, `role`, `tool_use_id`, `cache_control`,
        // `action_key`, `$summary`, `stash_id` are dropped. `account_id` and
        // any natural-text values inside should remain.
        let rendered = &w.rendered;
        assert!(
            rendered.contains("account_id: apn_1KhW56n"),
            "missing account_id leaf; rendered: {rendered}"
        );
        // Default skip_keys should hide structural metadata.
        assert!(!rendered.contains("toolu_bdrk"), "tool_use_id leaked");
        assert!(!rendered.contains("ephemeral"), "cache_control leaked");
        assert!(
            !rendered.contains("Successfully found"),
            "$summary leaked under default skip_keys"
        );
    }

    #[test]
    fn stringified_scalar_is_not_recursed() {
        // "42" parses as a JSON number; we should NOT expand it. Same for
        // bare quoted strings. Only objects/arrays get expanded.
        let w = walk_and_render(r#"{"a":"42","b":"true"}"#, &no_skip()).unwrap();
        assert_eq!(w.leaves.len(), 2);
        assert_eq!(w.leaves[0].original, "42");
        assert_eq!(w.leaves[1].original, "true");
    }

    // ---- apply_spans_and_serialize -----------------------------------------

    #[test]
    fn no_spans_round_trips_to_equivalent_json() {
        let input = r#"{"a":"hello","b":[1,2,"three"]}"#;
        let w = walk_and_render(input, &no_skip()).unwrap();
        let out = apply_spans_and_serialize(w, Vec::new(), "[X]").unwrap();
        let parsed_in: Value = serde_json::from_str(input).unwrap();
        let parsed_out: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(parsed_in, parsed_out);
    }

    #[test]
    fn span_inside_one_leaf_is_applied_with_placeholder() {
        let input = r#"{"email":"alice@example.com"}"#;
        let w = walk_and_render(input, &no_skip()).unwrap();
        let leaf = &w.leaves[0].clone();
        // Build a span covering the full email value in rendered coords.
        let span = crate::engine::Span {
            start: leaf.value_start,
            end: leaf.value_end,
            label: "private_email".to_string(),
        };
        let out = apply_spans_and_serialize(w, vec![span], "[REDACTED_{LABEL}]").unwrap();
        let parsed: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(parsed, json!({"email": "[REDACTED_PRIVATE_EMAIL]"}));
    }

    #[test]
    fn span_in_key_prefix_is_ignored() {
        let input = r#"{"email":"alice@example.com"}"#;
        let w = walk_and_render(input, &no_skip()).unwrap();
        // First 5 chars of rendered are `email`. Span over that.
        let span = crate::engine::Span {
            start: 0,
            end: 5,
            label: "private_person".to_string(),
        };
        let out = apply_spans_and_serialize(w, vec![span], "[REDACTED]").unwrap();
        let parsed: Value = serde_json::from_str(&out).unwrap();
        // Nothing redacted — span fell entirely in the key prefix zone.
        assert_eq!(parsed, json!({"email": "alice@example.com"}));
    }

    #[test]
    fn span_straddling_two_leaves_is_split() {
        let input = r#"{"a":"john","b":"doe"}"#;
        let w = walk_and_render(input, &no_skip()).unwrap();
        // The two value ranges are non-contiguous (separated by "\n\nb: ").
        // A single span covering both, end-to-end, must produce per-leaf
        // partial redactions on BOTH leaves.
        let leaf_a = w.leaves[0].clone();
        let leaf_b = w.leaves[1].clone();
        let span = crate::engine::Span {
            start: leaf_a.value_start,
            end: leaf_b.value_end,
            label: "private_person".to_string(),
        };
        let out = apply_spans_and_serialize(w, vec![span], "[X]").unwrap();
        let parsed: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(parsed, json!({"a": "[X]", "b": "[X]"}));
    }

    #[test]
    fn redaction_inside_recursively_parsed_stringified_json() {
        // Inner JSON gets walked → leaf redacted → inner re-serialised →
        // outer serialised. Output should still have the inner content as
        // a STRINGIFIED JSON value at the outer position.
        let input = r#"{"wrapper":"{\"email\":\"a@b.com\"}"}"#;
        let w = walk_and_render(input, &no_skip()).unwrap();
        let leaf = w.leaves[0].clone();
        let span = crate::engine::Span {
            start: leaf.value_start,
            end: leaf.value_end,
            label: "private_email".to_string(),
        };
        let out = apply_spans_and_serialize(w, vec![span], "[X_{LABEL}]").unwrap();
        let parsed: Value = serde_json::from_str(&out).unwrap();
        // The outer `wrapper` is still a string (re-stringified inner JSON).
        let wrapper = parsed["wrapper"].as_str().expect("wrapper stays string");
        let inner: Value = serde_json::from_str(wrapper).expect("re-stringified valid JSON");
        assert_eq!(inner, json!({"email": "[X_PRIVATE_EMAIL]"}));
    }

    #[test]
    fn doubly_nested_stringified_json_re_serializes_inside_out() {
        // Two levels: outer.wrapper is a stringified object whose `inner` field
        // is itself a stringified object. Deepest leaf gets redacted.
        let inner_str = serde_json::to_string(&json!({"email": "a@b.com"})).unwrap();
        let middle = json!({"inner": inner_str});
        let middle_str = serde_json::to_string(&middle).unwrap();
        let outer = json!({"wrapper": middle_str});
        let input = serde_json::to_string(&outer).unwrap();

        let w = walk_and_render(&input, &no_skip()).unwrap();
        assert_eq!(w.leaves.len(), 1, "should bottom out at the email leaf");
        let leaf = w.leaves[0].clone();
        let span = crate::engine::Span {
            start: leaf.value_start,
            end: leaf.value_end,
            label: "private_email".to_string(),
        };
        let out = apply_spans_and_serialize(w, vec![span], "[X]").unwrap();
        let parsed: Value = serde_json::from_str(&out).unwrap();
        let middle_back: Value =
            serde_json::from_str(parsed["wrapper"].as_str().unwrap()).unwrap();
        let inner_back: Value =
            serde_json::from_str(middle_back["inner"].as_str().unwrap()).unwrap();
        assert_eq!(inner_back, json!({"email": "[X]"}));
    }

    #[test]
    fn object_keys_are_never_redacted() {
        // Even if a span happens to cover bytes that contain a key name
        // (it can't really, because keys aren't in value ranges), serialisation
        // never touches keys.
        let input = r#"{"john@example.com":"value"}"#;
        let w = walk_and_render(input, &no_skip()).unwrap();
        let leaf = w.leaves[0].clone();
        let span = crate::engine::Span {
            start: leaf.value_start,
            end: leaf.value_end,
            label: "private_email".to_string(),
        };
        let out = apply_spans_and_serialize(w, vec![span], "[X]").unwrap();
        let parsed: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(parsed, json!({"john@example.com": "[X]"}));
    }

    #[test]
    fn object_key_order_preserved() {
        let input = r#"{"z":"1","a":"2","m":"3"}"#;
        let w = walk_and_render(input, &no_skip()).unwrap();
        let out = apply_spans_and_serialize(w, Vec::new(), "[X]").unwrap();
        // With preserve_order feature, output should preserve z,a,m order.
        let keys: Vec<&str> = out
            .strip_prefix('{')
            .unwrap()
            .split(',')
            .map(|kv| kv.split(':').next().unwrap().trim_matches('"'))
            .collect();
        assert_eq!(keys, vec!["z", "a", "m"]);
    }

    // ---- skip_keys helper --------------------------------------------------

    #[test]
    fn build_skip_keys_uses_defaults_when_empty() {
        let s = build_skip_keys(&[]);
        assert!(s.contains("tool_use_id"));
        assert!(s.contains("role"));
        assert!(s.contains("type"));
    }

    #[test]
    fn build_skip_keys_caller_list_replaces_defaults() {
        let s = build_skip_keys(&["custom_field".to_string()]);
        assert!(s.contains("custom_field"));
        assert!(!s.contains("tool_use_id"));
    }
}

