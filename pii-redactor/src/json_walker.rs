//! Walk a JSON document, render its string leaves into a single natural-text
//! string for the model to process, then route detected PII spans back to the
//! originating leaves and serialize the tree with the spans reported as byte
//! ranges of that output.
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
//! - The output is never rewritten here. It is the compact serialization of
//!   the tree plus masks (byte ranges into it); callers splice placeholders.

use std::collections::{HashMap, HashSet};
use std::fmt::Write as _;

use anyhow::{Context, Result};
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

/// One PII byte range. Used both for a leaf's local ranges (offsets into the
/// leaf's original string) and for the final output masks (offsets into the
/// serialized document). `label` is the model's base label (`private_email`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Mask {
    pub start: usize,
    pub end: usize,
    pub label: String,
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
    /// Pointers in `tree` that were originally stringified JSON and are
    /// re-stringified at serialize-out time.
    stringified_pointers: Vec<String>,
}

/// Parse `input` as JSON, walk it, render all string leaves into one
/// natural-text document with key prefixes.
///
/// Returns a `WalkedJson` carrying everything needed to (a) feed the model,
/// (b) route detected spans back to leaves, (c) emit the output with masks.
pub fn walk_and_render(input: &str, skip_keys: &HashSet<String>) -> Result<WalkedJson> {
    let mut tree: Value = serde_json::from_str(input)
        .with_context(|| "input is not valid JSON; the Redact RPC requires stringified JSON")?;
    let mut leaves = Vec::new();
    let mut rendered = String::new();
    let mut stringified_pointers = Vec::new();
    walk(
        &mut tree,
        String::new(),
        None,
        0,
        skip_keys,
        &mut leaves,
        &mut rendered,
        &mut stringified_pointers,
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
        stringified_pointers,
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
    stringified_pointers: &mut Vec<String>,
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
                    stringified_pointers,
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
                    stringified_pointers,
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
                        stringified_pointers.push(pointer.clone());
                        // Re-dispatch on the now-replaced value.
                        walk(
                            value,
                            pointer,
                            parent_key,
                            depth + 1,
                            skip_keys,
                            leaves,
                            rendered,
                            stringified_pointers,
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

/// Serialize the walked tree compactly — byte-identical to
/// `serde_json::to_string` of the same document — and report every detected
/// span as a byte range of that output. Masks come out sorted and
/// non-overlapping.
///
/// String leaves are escaped piecewise at range boundaries and the output
/// cursor recorded between pieces; JSON escaping is per-character, so the
/// pieces concatenate to exactly the whole-string escape. A stringified-JSON
/// leaf is serialized first (recursively, with its own masks) and then
/// written as a string leaf whose ranges are those inner masks, which carries
/// them through the outer escaping the same way.
pub fn serialize_with_masks(walked: WalkedJson, spans: Vec<Span>) -> (String, Vec<Mask>) {
    let WalkedJson {
        tree,
        leaves,
        rendered: _,
        stringified_pointers,
    } = walked;

    // A span CAN straddle adjacent leaves if the model decoder ran an
    // entity across our `\n\n` separator. Clip the span to every leaf it
    // overlaps; the result is either a single in-leaf range or partial
    // ranges in adjacent leaves.
    let mut per_leaf: Vec<Vec<Mask>> = vec![Vec::new(); leaves.len()];
    for span in spans {
        for (i, leaf) in leaves.iter().enumerate() {
            let overlap_start = span.start.max(leaf.value_start);
            let overlap_end = span.end.min(leaf.value_end);
            if overlap_start < overlap_end {
                per_leaf[i].push(Mask {
                    start: overlap_start - leaf.value_start,
                    end: overlap_end - leaf.value_start,
                    label: span.label.clone(),
                });
            }
        }
    }
    let mut leaf_ranges: HashMap<String, Vec<Mask>> = HashMap::new();
    for (leaf, ranges) in leaves.into_iter().zip(per_leaf) {
        if ranges.is_empty() {
            continue;
        }
        let normalized = normalize_ranges(&leaf.original, ranges);
        if !normalized.is_empty() {
            leaf_ranges.insert(leaf.pointer, normalized);
        }
    }
    let stringified: HashSet<String> = stringified_pointers.into_iter().collect();

    let mut writer = MaskWriter {
        out: String::new(),
        masks: Vec::new(),
        leaf_ranges: &leaf_ranges,
        stringified: &stringified,
    };
    writer.write_value(&tree, &mut String::new());
    (writer.out, writer.masks)
}

/// Sort, merge same-label adjacent/overlapping ranges (one entity that
/// arrived as several partial spans collapses into one mask), clip
/// different-label overlaps to the running cursor so the union stays covered
/// without double-masking, and drop ranges off char boundaries or past the
/// end of `text`.
fn normalize_ranges(text: &str, mut ranges: Vec<Mask>) -> Vec<Mask> {
    ranges.sort_by_key(|r| r.start);
    let mut merged: Vec<Mask> = Vec::with_capacity(ranges.len());
    for r in ranges {
        match merged.last_mut() {
            Some(prev) if prev.end >= r.start && prev.label == r.label => {
                if r.end > prev.end {
                    prev.end = r.end;
                }
            }
            _ => merged.push(r),
        }
    }
    let mut out = Vec::with_capacity(merged.len());
    let mut cursor = 0;
    for mut r in merged {
        // Fully behind the cursor: nothing left to cover. Otherwise clip the
        // start so the un-covered tail of an overlapping range is still masked.
        if r.end > text.len() || r.end <= cursor {
            continue;
        }
        r.start = cursor.max(r.start);
        if !text.is_char_boundary(r.start) || !text.is_char_boundary(r.end) {
            continue;
        }
        cursor = r.end;
        out.push(r);
    }
    out
}

struct MaskWriter<'a> {
    out: String,
    masks: Vec<Mask>,
    /// Leaf pointer → normalized ranges into the leaf's original string.
    leaf_ranges: &'a HashMap<String, Vec<Mask>>,
    stringified: &'a HashSet<String>,
}

impl MaskWriter<'_> {
    fn write_value(&mut self, value: &Value, pointer: &mut String) {
        if self.stringified.contains(pointer.as_str()) {
            let mut inner = MaskWriter {
                out: String::new(),
                masks: Vec::new(),
                leaf_ranges: self.leaf_ranges,
                stringified: self.stringified,
            };
            inner.write_plain(value, pointer);
            self.write_string(&inner.out, &inner.masks);
        } else {
            self.write_plain(value, pointer);
        }
    }

    fn write_plain(&mut self, value: &Value, pointer: &mut String) {
        match value {
            Value::String(s) => {
                let ranges = self
                    .leaf_ranges
                    .get(pointer.as_str())
                    .map(Vec::as_slice)
                    .unwrap_or(&[]);
                self.write_string(s, ranges);
            }
            Value::Object(map) => {
                self.out.push('{');
                for (i, (k, v)) in map.iter().enumerate() {
                    if i > 0 {
                        self.out.push(',');
                    }
                    self.write_string(k, &[]);
                    self.out.push(':');
                    let len = pointer.len();
                    pointer.push('/');
                    pointer.push_str(&escape_pointer_token(k));
                    self.write_value(v, pointer);
                    pointer.truncate(len);
                }
                self.out.push('}');
            }
            Value::Array(arr) => {
                self.out.push('[');
                for (i, v) in arr.iter().enumerate() {
                    if i > 0 {
                        self.out.push(',');
                    }
                    let len = pointer.len();
                    let _ = write!(pointer, "/{i}");
                    self.write_value(v, pointer);
                    pointer.truncate(len);
                }
                self.out.push(']');
            }
            scalar => self.out.push_str(
                &serde_json::to_string(scalar).expect("scalar JSON serialization is infallible"),
            ),
        }
    }

    /// `ranges`: sorted, non-overlapping byte ranges of `s` on char
    /// boundaries. Each becomes a mask over its escaped form in the output.
    fn write_string(&mut self, s: &str, ranges: &[Mask]) {
        self.out.push('"');
        let mut cursor = 0;
        for r in ranges {
            escape_into(&mut self.out, &s[cursor..r.start]);
            let start = self.out.len();
            escape_into(&mut self.out, &s[r.start..r.end]);
            self.masks.push(Mask {
                start,
                end: self.out.len(),
                label: r.label.clone(),
            });
            cursor = r.end;
        }
        escape_into(&mut self.out, &s[cursor..]);
        self.out.push('"');
    }
}

/// serde_json's string escaping without the surrounding quotes. Delegating
/// keeps the output byte-identical to `serde_json::to_string` by construction.
fn escape_into(out: &mut String, piece: &str) {
    let quoted = serde_json::to_string(piece).expect("str JSON serialization is infallible");
    out.push_str(&quoted[1..quoted.len() - 1]);
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

    fn span(start: usize, end: usize, label: &str) -> Span {
        Span {
            start,
            end,
            label: label.to_string(),
        }
    }

    /// Span covering leaf `i`'s whole value, in rendered coordinates.
    fn leaf_span(w: &WalkedJson, i: usize, label: &str) -> Span {
        span(w.leaves[i].value_start, w.leaves[i].value_end, label)
    }

    /// The reader-side splice, as app-server and the ClickHouse UDF do it.
    fn apply_masks(text: &str, masks: &[Mask]) -> String {
        let mut out = String::with_capacity(text.len());
        let mut cursor = 0;
        for m in masks {
            out.push_str(&text[cursor..m.start]);
            out.push_str(&format!("[REDACTED_{}]", m.label.to_uppercase()));
            cursor = m.end;
        }
        out.push_str(&text[cursor..]);
        out
    }

    /// What `serde_json::to_string` gives for the same document: the walked
    /// tree with every stringified wrapper re-stringified inside-out.
    fn reference_serialization(input: &str, skip: &HashSet<String>) -> String {
        let w = walk_and_render(input, skip).unwrap();
        let mut tree = w.tree.clone();
        let mut pointers = w.stringified_pointers.clone();
        pointers.sort_by_key(|p| std::cmp::Reverse(p.matches('/').count()));
        for p in pointers {
            let slot = tree.pointer_mut(&p).unwrap();
            *slot = Value::String(serde_json::to_string(slot).unwrap());
        }
        serde_json::to_string(&tree).unwrap()
    }

    fn redacted_json(input: &str, skip: &HashSet<String>, spans: Vec<Span>) -> Value {
        let w = walk_and_render(input, skip).unwrap();
        let (text, masks) = serialize_with_masks(w, spans);
        serde_json::from_str(&apply_masks(&text, &masks)).unwrap()
    }

    // ---- walk_and_render ---------------------------------------------------

    #[test]
    fn errors_on_invalid_json() {
        let err = walk_and_render("not json at all", &no_skip()).unwrap_err();
        assert!(err.to_string().contains("not valid JSON"), "got: {err:#}");
    }

    #[test]
    fn renders_simple_object_with_key_prefixes() {
        let w =
            walk_and_render(r#"{"name":"Robert","email":"r@example.com"}"#, &no_skip()).unwrap();
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
        let w = walk_and_render(r#"{"n":42,"b":true,"x":null,"s":"text"}"#, &no_skip()).unwrap();
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

    // ---- serialize_with_masks: output text ---------------------------------

    #[test]
    fn output_is_byte_identical_to_serde_json_with_or_without_spans() {
        let fixtures: &[(&str, HashSet<String>)] = &[
            (
                r#"{"a":"hello","b":[1,2,"three"],"c":{"d":null,"e":true,"f":1.5e10}}"#,
                no_skip(),
            ),
            (r#"{"z":"1","a":"2","m":"3"}"#, no_skip()),
            (r#"{"outer":"{\"inner\":\"deep\"}"}"#, no_skip()),
            (r#"{"payload":"[\"a\",\"b\"]"}"#, no_skip()),
            (
                r#"{"text":"tab\there \"quoted\" back\\slash\nnewline \u0001 ctrl"}"#,
                no_skip(),
            ),
            (r#"{"k~/ey":"v","名前":"Zoë Bäcker 🙂"}"#, no_skip()),
            (r#"[["x"],{"":""},"",[]]"#, no_skip()),
            (r#""just a string""#, no_skip()),
            (r#""{\"root\":\"stringified\"}""#, no_skip()),
            (
                r#"{"content":[{"cache_control":{"type":"ephemeral"},"content":[{"text":"{\n  \"action_key\": \"gmail-find-email\",\n  \"account_id\": \"apn_1KhW56n\"\n}","type":"text"}],"tool_use_id":"toolu_bdrk_01K8","type":"tool_result"}],"role":"user"}"#,
                build_skip_keys(&[]),
            ),
        ];
        for (input, skip) in fixtures {
            let expected = reference_serialization(input, skip);

            let w = walk_and_render(input, skip).unwrap();
            let (text, masks) = serialize_with_masks(w, Vec::new());
            assert_eq!(text, expected, "no spans: {input}");
            assert!(masks.is_empty());

            // Masking every leaf must not change a single output byte.
            let w = walk_and_render(input, skip).unwrap();
            let spans: Vec<Span> = (0..w.leaves.len())
                .map(|i| leaf_span(&w, i, "private_person"))
                .collect();
            let n_leaves = w.leaves.len();
            let (text, masks) = serialize_with_masks(w, spans);
            assert_eq!(text, expected, "all leaves masked: {input}");
            assert_eq!(masks.len(), n_leaves, "{input}");
        }
    }

    #[test]
    fn no_spans_round_trips_to_equivalent_json() {
        let input = r#"{"a":"hello","b":[1,2,"three"]}"#;
        let w = walk_and_render(input, &no_skip()).unwrap();
        let (out, masks) = serialize_with_masks(w, Vec::new());
        let parsed_in: Value = serde_json::from_str(input).unwrap();
        let parsed_out: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(parsed_in, parsed_out);
        assert!(masks.is_empty());
    }

    #[test]
    fn object_key_order_preserved() {
        let input = r#"{"z":"1","a":"2","m":"3"}"#;
        let w = walk_and_render(input, &no_skip()).unwrap();
        let (out, _) = serialize_with_masks(w, Vec::new());
        // With preserve_order feature, output should preserve z,a,m order.
        let keys: Vec<&str> = out
            .strip_prefix('{')
            .unwrap()
            .split(',')
            .map(|kv| kv.split(':').next().unwrap().trim_matches('"'))
            .collect();
        assert_eq!(keys, vec!["z", "a", "m"]);
    }

    // ---- serialize_with_masks: masks ----------------------------------------

    #[test]
    fn span_inside_one_leaf_becomes_a_mask_over_the_escaped_value() {
        let input = r#"{"email":"alice@example.com"}"#;
        let w = walk_and_render(input, &no_skip()).unwrap();
        let spans = vec![leaf_span(&w, 0, "private_email")];
        let (text, masks) = serialize_with_masks(w, spans);
        assert_eq!(
            masks,
            vec![Mask {
                start: 10,
                end: 27,
                label: "private_email".to_string()
            }]
        );
        assert_eq!(&text[10..27], "alice@example.com");
        assert_eq!(
            serde_json::from_str::<Value>(&apply_masks(&text, &masks)).unwrap(),
            json!({"email": "[REDACTED_PRIVATE_EMAIL]"})
        );
    }

    #[test]
    fn span_in_key_prefix_is_ignored() {
        // First 5 chars of rendered are `email`. Span over that.
        let input = r#"{"email":"alice@example.com"}"#;
        let w = walk_and_render(input, &no_skip()).unwrap();
        let (_, masks) = serialize_with_masks(w, vec![span(0, 5, "private_person")]);
        assert!(masks.is_empty());
        assert_eq!(
            redacted_json(input, &no_skip(), vec![span(0, 5, "private_person")]),
            json!({"email": "alice@example.com"})
        );
    }

    #[test]
    fn span_straddling_two_leaves_is_split() {
        // The two value ranges are non-contiguous (separated by "\n\nb: ").
        // A single span covering both, end-to-end, must produce per-leaf
        // partial masks on BOTH leaves.
        let input = r#"{"a":"john","b":"doe"}"#;
        let w = walk_and_render(input, &no_skip()).unwrap();
        let s = span(
            w.leaves[0].value_start,
            w.leaves[1].value_end,
            "private_person",
        );
        let (text, masks) = serialize_with_masks(w, vec![s]);
        assert_eq!(masks.len(), 2);
        assert_eq!(&text[masks[0].start..masks[0].end], "john");
        assert_eq!(&text[masks[1].start..masks[1].end], "doe");
        assert_eq!(
            serde_json::from_str::<Value>(&apply_masks(&text, &masks)).unwrap(),
            json!({"a": "[REDACTED_PRIVATE_PERSON]", "b": "[REDACTED_PRIVATE_PERSON]"})
        );
    }

    #[test]
    fn partial_span_inside_a_leaf_keeps_the_rest_of_the_value() {
        let input = r#"{"msg":"call Jane Doe today"}"#;
        let w = walk_and_render(input, &no_skip()).unwrap();
        let vs = w.leaves[0].value_start;
        let (text, masks) = serialize_with_masks(w, vec![span(vs + 5, vs + 13, "private_person")]);
        assert_eq!(&text[masks[0].start..masks[0].end], "Jane Doe");
        assert_eq!(
            apply_masks(&text, &masks),
            r#"{"msg":"call [REDACTED_PRIVATE_PERSON] today"}"#
        );
    }

    #[test]
    fn masks_cover_the_escaped_form_of_the_span() {
        // Quotes, backslashes and newlines inside an entity escape to more
        // bytes than the original; the mask must span the escaped bytes.
        let input = "{\"name\":\"Jo\\\"hn\\\\Doe\\nJr\"}";
        let w = walk_and_render(input, &no_skip()).unwrap();
        assert_eq!(w.leaves[0].original, "Jo\"hn\\Doe\nJr");
        let spans = vec![leaf_span(&w, 0, "private_person")];
        let (text, masks) = serialize_with_masks(w, spans);
        assert_eq!(&text[masks[0].start..masks[0].end], "Jo\\\"hn\\\\Doe\\nJr");
        assert_eq!(
            apply_masks(&text, &masks),
            r#"{"name":"[REDACTED_PRIVATE_PERSON]"}"#
        );
    }

    #[test]
    fn multi_byte_chars_around_a_span_boundary() {
        let input = r#"{"greeting":"Grüße von Zoë Bäcker aus Köln"}"#;
        let w = walk_and_render(input, &no_skip()).unwrap();
        let original = w.leaves[0].original.clone();
        let name_start = original.find("Zoë").unwrap();
        let name_end = name_start + "Zoë Bäcker".len();
        let vs = w.leaves[0].value_start;
        let (text, masks) = serialize_with_masks(
            w,
            vec![span(vs + name_start, vs + name_end, "private_person")],
        );
        assert_eq!(&text[masks[0].start..masks[0].end], "Zoë Bäcker");
        assert_eq!(
            apply_masks(&text, &masks),
            r#"{"greeting":"Grüße von [REDACTED_PRIVATE_PERSON] aus Köln"}"#
        );
    }

    #[test]
    fn span_off_a_char_boundary_is_dropped() {
        // A byte offset in the middle of `ë` can't be sliced; the leaf is
        // left unmasked rather than panicking.
        let input = r#"{"n":"Zoë"}"#;
        let w = walk_and_render(input, &no_skip()).unwrap();
        let vs = w.leaves[0].value_start;
        let (_, masks) = serialize_with_masks(w, vec![span(vs, vs + 3, "private_person")]);
        assert!(masks.is_empty());
    }

    #[test]
    fn redaction_inside_recursively_parsed_stringified_json() {
        // Inner JSON gets walked → leaf masked → inner serialized → outer
        // serialized. The mask must land on the escaped inner bytes inside
        // the outer string, so splicing keeps the outer value a valid
        // stringified JSON.
        let input = r#"{"wrapper":"{\"email\":\"a@b.com\"}"}"#;
        let w = walk_and_render(input, &no_skip()).unwrap();
        let spans = vec![leaf_span(&w, 0, "private_email")];
        let (text, masks) = serialize_with_masks(w, spans);
        assert_eq!(&text[masks[0].start..masks[0].end], "a@b.com");
        let parsed: Value = serde_json::from_str(&apply_masks(&text, &masks)).unwrap();
        let wrapper = parsed["wrapper"].as_str().expect("wrapper stays string");
        let inner: Value = serde_json::from_str(wrapper).expect("re-stringified valid JSON");
        assert_eq!(inner, json!({"email": "[REDACTED_PRIVATE_EMAIL]"}));
    }

    #[test]
    fn doubly_nested_stringified_json_translates_masks_through_both_escapes() {
        let inner_str =
            serde_json::to_string(&json!({"email": "a@b.com", "note": "q\"uote"})).unwrap();
        let middle = json!({"inner": inner_str});
        let middle_str = serde_json::to_string(&middle).unwrap();
        let outer = json!({"wrapper": middle_str});
        let input = serde_json::to_string(&outer).unwrap();

        let w = walk_and_render(&input, &no_skip()).unwrap();
        assert_eq!(w.leaves.len(), 2, "email and note leaves");
        let spans = vec![
            leaf_span(&w, 0, "private_email"),
            leaf_span(&w, 1, "secret"),
        ];
        let (text, masks) = serialize_with_masks(w, spans);
        assert_eq!(text, reference_serialization(&input, &no_skip()));
        assert_eq!(&text[masks[0].start..masks[0].end], "a@b.com");
        // `q"uote` is escaped twice on the way out: `q\"uote` → `q\\\"uote`
        // → inside the outer string, `q\\\\\\\"uote`.
        assert_eq!(&text[masks[1].start..masks[1].end], r#"q\\\\\\\"uote"#);

        let parsed: Value = serde_json::from_str(&apply_masks(&text, &masks)).unwrap();
        let middle_back: Value = serde_json::from_str(parsed["wrapper"].as_str().unwrap()).unwrap();
        let inner_back: Value =
            serde_json::from_str(middle_back["inner"].as_str().unwrap()).unwrap();
        assert_eq!(
            inner_back,
            json!({"email": "[REDACTED_PRIVATE_EMAIL]", "note": "[REDACTED_SECRET]"})
        );
    }

    #[test]
    fn pretty_printed_stringified_json_is_compacted_and_masks_still_align() {
        let input = r#"{"text":"{\n  \"account_id\": \"apn_1KhW56n\"\n}"}"#;
        let w = walk_and_render(input, &no_skip()).unwrap();
        let spans = vec![leaf_span(&w, 0, "secret")];
        let (text, masks) = serialize_with_masks(w, spans);
        assert_eq!(text, r#"{"text":"{\"account_id\":\"apn_1KhW56n\"}"}"#);
        assert_eq!(&text[masks[0].start..masks[0].end], "apn_1KhW56n");
    }

    #[test]
    fn object_keys_are_never_redacted() {
        // Keys aren't in value ranges, so serialization never touches them.
        let input = r#"{"john@example.com":"value"}"#;
        let w = walk_and_render(input, &no_skip()).unwrap();
        let spans = vec![leaf_span(&w, 0, "private_email")];
        let (text, masks) = serialize_with_masks(w, spans);
        assert_eq!(
            serde_json::from_str::<Value>(&apply_masks(&text, &masks)).unwrap(),
            json!({"john@example.com": "[REDACTED_PRIVATE_EMAIL]"})
        );
    }

    #[test]
    fn masks_are_sorted_and_non_overlapping_across_the_document() {
        let input = r#"{"a":"x@y.com","b":{"c":["Jane","{\"d\":\"z@w.com\"}"]}}"#;
        let w = walk_and_render(input, &no_skip()).unwrap();
        let spans = (0..w.leaves.len())
            .map(|i| leaf_span(&w, i, "private_person"))
            .collect();
        let (text, masks) = serialize_with_masks(w, spans);
        assert_eq!(masks.len(), 3);
        for pair in masks.windows(2) {
            assert!(pair[0].end <= pair[1].start, "{masks:?}");
        }
        assert_eq!(
            apply_masks(&text, &masks),
            r#"{"a":"[REDACTED_PRIVATE_PERSON]","b":{"c":["[REDACTED_PRIVATE_PERSON]","{\"d\":\"[REDACTED_PRIVATE_PERSON]\"}"]}}"#
        );
    }

    // ---- normalize_ranges ---------------------------------------------------

    fn range(s: usize, e: usize, l: &str) -> Mask {
        Mask {
            start: s,
            end: e,
            label: l.to_string(),
        }
    }

    #[test]
    fn overlapping_different_label_ranges_cover_full_union() {
        // Sliding-window decoders can label the same byte range differently
        // in adjacent windows. After same-label merging the two ranges still
        // overlap; the whole union must be covered without double-masking.
        let text = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        let out = normalize_ranges(
            text,
            vec![
                range(0, 10, "private_email"),
                range(5, 25, "private_personal_information"),
            ],
        );
        assert_eq!(
            out,
            vec![
                range(0, 10, "private_email"),
                range(10, 25, "private_personal_information"),
            ]
        );
    }

    #[test]
    fn fully_subsumed_range_is_dropped_not_double_masked() {
        let out = normalize_ranges(
            "ABCDEFGHIJ",
            vec![
                range(0, 10, "private_email"),
                range(3, 7, "private_personal_information"),
            ],
        );
        assert_eq!(out, vec![range(0, 10, "private_email")]);
    }

    #[test]
    fn same_label_fragments_merge_into_one_range() {
        let out = normalize_ranges(
            "ABCDEFGHIJ",
            vec![range(4, 7, "x"), range(0, 4, "x"), range(8, 10, "y")],
        );
        assert_eq!(out, vec![range(0, 7, "x"), range(8, 10, "y")]);
    }

    #[test]
    fn ranges_past_the_end_are_dropped() {
        assert!(normalize_ranges("abc", vec![range(0, 4, "x")]).is_empty());
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
