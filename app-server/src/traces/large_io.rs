//! Large non-LLM span payloads (LAM-2580). A stored `input` / `output` above
//! [`LargeIoLimits::threshold_bytes`] moves to a `spans_large_io` row and the
//! `spans` row keeps a bounded, valid-JSON preview plus an `offloaded_io` bit.
//! `spans_v0` / `spans_v1` restore the full value as `input` / `output` and
//! expose the stored one as `input_preview` / `output_preview`, which
//! whole-trace readers select so they never pull multi-MiB payloads.
//!
//! Runs on the consumer after PII redaction and billing: `size_bytes` stays the
//! full payload's, and the row carries exactly the text (and masks) `spans`
//! would have stored. In `dual` mode the preview is cut from the redacted text,
//! so it needs no masks and shows placeholders to every reader.

use std::borrow::Cow;

use serde_json::{Map, Value};

use crate::{
    ch::{spans::CHSpan, spans_large_io::CHSpanLargeIo},
    db::spans::{Span, SpanType},
    env,
    pii_redactor::SpanVerdict,
    utils::sanitize_string,
};

pub const OFFLOADED_INPUT: u8 = 1;
pub const OFFLOADED_OUTPUT: u8 = 1 << 1;

/// Floor for [`LargeIoLimits::preview_bytes`]; the last-resort preview (one
/// truncated JSON string) always fits in it.
const MIN_PREVIEW_BYTES: usize = 256;
/// Strings are never cut below this many chars while the tree still fits.
const MIN_STRING_CHARS: usize = 16;
/// Array items / object keys kept per level on the first attempt.
const INITIAL_ITEMS: usize = 50;

#[derive(Clone, Copy, Debug)]
pub struct LargeIoLimits {
    pub threshold_bytes: usize,
    pub preview_bytes: usize,
}

impl LargeIoLimits {
    pub fn from_env() -> Self {
        Self {
            threshold_bytes: env::clickhouse::LARGE_PAYLOAD_THRESHOLD_BYTES.get(),
            preview_bytes: env::clickhouse::LARGE_PAYLOAD_PREVIEW_BYTES
                .get()
                .max(MIN_PREVIEW_BYTES),
        }
    }
}

/// LLM, CACHED and PIPELINE (deprecated) spans keep their payloads inline:
/// LLM readers parse message arrays, and LLM inputs are mostly dedup'd into
/// `unique_content` anyway.
fn offloads(span_type: &SpanType) -> bool {
    match span_type {
        SpanType::Default
        | SpanType::Tool
        | SpanType::Executor
        | SpanType::Evaluator
        | SpanType::Evaluation => true,
        SpanType::LLM | SpanType::Cached | SpanType::Pipeline | SpanType::HumanEvaluator => false,
    }
}

/// Moves `ch_span`'s oversized `input` / `output` into `spans_large_io` rows,
/// replacing each with its preview. A field stays inline when no safe preview
/// source exists (a `dual` field without its canonical text, or one whose
/// masks don't splice) or the preview would not be shorter.
pub fn offload(
    ch_span: &mut CHSpan,
    span: &Span,
    verdict: &SpanVerdict,
    limits: LargeIoLimits,
) -> Vec<CHSpanLargeIo> {
    if !offloads(&span.span_type) {
        return Vec::new();
    }
    let (project_id, trace_id, span_id, start_time, pii_checked) = (
        ch_span.project_id,
        ch_span.trace_id,
        ch_span.span_id,
        ch_span.start_time,
        ch_span.pii_checked,
    );

    let mut rows = Vec::new();
    for is_output in [false, true] {
        let (text, masks, raw, bit) = if is_output {
            (
                &mut ch_span.output,
                &mut ch_span.output_masks,
                span.output.as_ref(),
                OFFLOADED_OUTPUT,
            )
        } else {
            (
                &mut ch_span.input,
                &mut ch_span.input_masks,
                span.input.as_ref(),
                OFFLOADED_INPUT,
            )
        };
        if text.len() <= limits.threshold_bytes {
            continue;
        }
        let source: Option<Cow<Value>> = match verdict {
            SpanVerdict::Masked { input, output } => {
                let masked = if is_output { output } else { input };
                masked
                    .as_ref()
                    .and_then(|m| m.redacted_value())
                    .map(Cow::Owned)
            }
            _ => raw.map(Cow::Borrowed),
        };
        let Some(source) = source else {
            continue;
        };
        let preview = preview(&source, limits.preview_bytes);
        if preview.len() >= text.len() {
            continue;
        }

        rows.push(CHSpanLargeIo {
            project_id,
            trace_id,
            span_id,
            is_output,
            start_time,
            content: std::mem::replace(text, preview),
            content_masks: std::mem::take(masks),
            pii_checked,
        });
        ch_span.offloaded_io |= bit;
    }
    rows
}

/// `value` as JSON of at most `max_bytes` (for `max_bytes` >= 256): long
/// strings keep a head and tail around `…[+N chars]…`, arrays and objects keep
/// their first items with a `…[+N items]` element / `…[+N keys]` key. Caps
/// halve until the rendering fits; a tree that can't fit even at the floor
/// (huge keys, deep nesting) becomes one truncated JSON string of its text.
pub fn preview(value: &Value, max_bytes: usize) -> String {
    let mut string_chars = max_bytes;
    let mut items = INITIAL_ITEMS;
    loop {
        let text = sanitize_string(&truncate(value, string_chars, items).to_string());
        if text.len() <= max_bytes {
            return text;
        }
        if string_chars == MIN_STRING_CHARS && items == 1 {
            break;
        }
        string_chars = (string_chars / 2).max(MIN_STRING_CHARS);
        items = (items / 2).max(1);
    }

    let raw = value.to_string();
    let mut chars = max_bytes / 2;
    loop {
        let text = sanitize_string(&Value::String(truncate_str(&raw, chars)).to_string());
        if text.len() <= max_bytes || chars == 0 {
            return text;
        }
        chars /= 2;
    }
}

fn truncate(value: &Value, string_chars: usize, items: usize) -> Value {
    match value {
        Value::String(s) => Value::String(truncate_str(s, string_chars)),
        Value::Array(array) => {
            let mut out: Vec<Value> = array
                .iter()
                .take(items)
                .map(|v| truncate(v, string_chars, items))
                .collect();
            if array.len() > items {
                out.push(Value::String(format!("…[+{} items]", array.len() - items)));
            }
            Value::Array(out)
        }
        Value::Object(object) => {
            let mut out: Map<String, Value> = object
                .iter()
                .take(items)
                .map(|(k, v)| (k.clone(), truncate(v, string_chars, items)))
                .collect();
            if object.len() > items {
                out.insert(format!("…[+{} keys]", object.len() - items), Value::Null);
            }
            Value::Object(out)
        }
        other => other.clone(),
    }
}

/// Head and tail of `s` around a `…[+N chars]…` marker, `max_chars` kept.
fn truncate_str(s: &str, max_chars: usize) -> String {
    if s.len() <= max_chars {
        return s.to_string();
    }
    let len = s.chars().count();
    if len <= max_chars {
        return s.to_string();
    }
    let tail = max_chars / 2;
    let head = max_chars - tail;
    let head_end = s.char_indices().nth(head).map_or(s.len(), |(i, _)| i);
    let tail_start = match tail {
        0 => s.len(),
        n => s.char_indices().nth_back(n - 1).map_or(0, |(i, _)| i),
    };
    format!(
        "{}…[+{} chars]…{}",
        &s[..head_end],
        len - head - tail,
        &s[tail_start..]
    )
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use chrono::Utc;
    use serde_json::json;
    use uuid::Uuid;

    use super::*;
    use crate::{
        pii_redactor::{MaskedText, PiiMask},
        traces::spans::{SpanAttributes, SpanUsage},
    };

    const LIMITS: LargeIoLimits = LargeIoLimits {
        threshold_bytes: 1_000,
        preview_bytes: 300,
    };

    fn span(span_type: SpanType, input: Value, output: Value) -> Span {
        Span {
            span_id: Uuid::from_u128(1),
            project_id: Uuid::from_u128(2),
            trace_id: Uuid::from_u128(3),
            parent_span_id: None,
            name: "s".into(),
            attributes: SpanAttributes::new(HashMap::new()),
            input: Some(input),
            output: Some(output),
            span_type,
            start_time: Utc::now(),
            end_time: Utc::now(),
            events: Vec::new(),
            status: None,
            tags: None,
            size_bytes: 0,
        }
    }

    fn ch(span: &Span) -> CHSpan {
        CHSpan::from_db_span(span, &SpanUsage::default(), span.project_id)
    }

    fn parse(s: &str) -> Value {
        serde_json::from_str(s).unwrap_or_else(|e| panic!("not JSON ({e}): {s}"))
    }

    #[test]
    fn small_values_render_unchanged() {
        let v = json!({ "a": [1, 2, "three"], "b": null });
        assert_eq!(preview(&v, 300), v.to_string());
    }

    #[test]
    fn long_string_keeps_head_and_tail() {
        let s = format!("{}{}", "a".repeat(5_000), "z".repeat(5_000));
        let p = preview(&json!(s), 300);
        assert!(p.len() <= 300, "{}", p.len());
        let text = parse(&p);
        let text = text.as_str().unwrap();
        assert!(text.starts_with("aaa") && text.ends_with("zzz"), "{text}");
        assert!(text.contains("chars]…"), "{text}");
    }

    #[test]
    fn arrays_and_objects_keep_leading_items_with_markers() {
        let v = json!({
            "rows": (0..1_000).map(|i| json!({ "id": i, "text": "x".repeat(200) })).collect::<Vec<_>>(),
            "meta": { "source": "db" },
        });
        let p = preview(&v, 300);
        assert!(p.len() <= 300, "{}", p.len());
        let tree = parse(&p);
        let rows = tree["rows"].as_array().unwrap();
        assert_eq!(rows[0]["id"], 0);
        assert!(rows.last().unwrap().as_str().unwrap().ends_with("items]"));
    }

    #[test]
    fn unfittable_tree_falls_back_to_one_string() {
        // Keys are never cut, so one huge key can't fit as a tree.
        let v = json!({ "k".repeat(2_000): 1 });
        let p = preview(&v, 300);
        assert!(p.len() <= 300, "{}", p.len());
        assert!(parse(&p).as_str().unwrap().starts_with("{\"kkk"));
    }

    #[test]
    fn multibyte_text_is_cut_on_char_boundaries() {
        let v = json!("é🙂".repeat(3_000));
        let p = preview(&v, 300);
        assert!(p.len() <= 300, "{}", p.len());
        parse(&p);
    }

    #[test]
    fn default_span_moves_large_field_and_keeps_small_one() {
        let big = json!({ "doc": "x".repeat(5_000) });
        let s = span(SpanType::Default, big.clone(), json!("ok"));
        let mut row = ch(&s);
        let stored = row.input.clone();

        let rows = offload(&mut row, &s, &SpanVerdict::Off, LIMITS);

        assert_eq!(rows.len(), 1);
        assert!(!rows[0].is_output);
        assert_eq!(rows[0].content, stored);
        assert_eq!(rows[0].trace_id, s.trace_id);
        assert_eq!(row.offloaded_io, OFFLOADED_INPUT);
        assert!(row.input.len() <= LIMITS.preview_bytes);
        assert!(
            parse(&row.input)["doc"]
                .as_str()
                .unwrap()
                .contains("chars]")
        );
        assert_eq!(row.output, "\"ok\"");
    }

    #[test]
    fn every_offloaded_span_type_moves_both_fields() {
        for span_type in [
            SpanType::Default,
            SpanType::Tool,
            SpanType::Executor,
            SpanType::Evaluator,
            SpanType::Evaluation,
        ] {
            let big = json!("y".repeat(5_000));
            let s = span(span_type, big.clone(), big);
            let mut row = ch(&s);
            let rows = offload(&mut row, &s, &SpanVerdict::Off, LIMITS);
            assert_eq!(rows.len(), 2);
            assert_eq!(row.offloaded_io, OFFLOADED_INPUT | OFFLOADED_OUTPUT);
        }
    }

    #[test]
    fn llm_like_spans_stay_inline() {
        for span_type in [
            SpanType::LLM,
            SpanType::Cached,
            SpanType::Pipeline,
            SpanType::HumanEvaluator,
        ] {
            let big = json!("y".repeat(5_000));
            let s = span(span_type, big.clone(), big);
            let mut row = ch(&s);
            let before = row.input.clone();
            assert!(offload(&mut row, &s, &SpanVerdict::Off, LIMITS).is_empty());
            assert_eq!(row.input, before);
            assert_eq!(row.offloaded_io, 0);
        }
    }

    #[test]
    fn dual_preview_comes_from_redacted_text_and_masks_move_with_content() {
        let raw = json!({ "email": "alice@example.com", "doc": "x".repeat(5_000) });
        let s = span(SpanType::Default, raw.clone(), json!("ok"));
        let canonical = raw.to_string();
        let start = canonical.find("alice").unwrap() as u32;
        let masked = MaskedText {
            text: canonical.clone(),
            masks: vec![PiiMask {
                start,
                end: start + "alice@example.com".len() as u32,
                label: "email".into(),
            }],
        };
        let verdict = SpanVerdict::Masked {
            input: Some(masked.clone()),
            output: None,
        };
        let mut row = ch(&s);
        row.pii_checked = verdict.pii_checked();
        row.input = masked.text.clone();
        row.input_masks = masked.ch_masks();

        let rows = offload(&mut row, &s, &verdict, LIMITS);

        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].content, canonical);
        assert_eq!(rows[0].content_masks, masked.ch_masks());
        assert!(rows[0].pii_checked);
        assert!(row.input_masks.is_empty());
        assert_eq!(parse(&row.input)["email"], "[REDACTED_EMAIL]");
    }

    #[test]
    fn dual_field_without_canonical_text_stays_inline() {
        let big = json!("y".repeat(5_000));
        let s = span(SpanType::Default, big.clone(), big);
        let mut row = ch(&s);
        let verdict = SpanVerdict::Masked {
            input: None,
            output: None,
        };
        assert!(offload(&mut row, &s, &verdict, LIMITS).is_empty());
        assert_eq!(row.offloaded_io, 0);
    }

    #[test]
    fn preview_not_shorter_than_payload_stays_inline() {
        let limits = LargeIoLimits {
            threshold_bytes: 10,
            preview_bytes: 10_000,
        };
        let s = span(SpanType::Default, json!("y".repeat(500)), json!("ok"));
        let mut row = ch(&s);
        assert!(offload(&mut row, &s, &SpanVerdict::Off, limits).is_empty());
        assert_eq!(row.offloaded_io, 0);
    }
}
