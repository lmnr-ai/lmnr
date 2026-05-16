//! Structural deduplication for LLM span input message payloads (LAM-1578).
//! Replaces each span's `input` with BLAKE3 hashes; unique messages land in
//! `llm_messages` and the `spans_v0` view reconstructs the JSON array on read.
//! Redis is a best-effort "seen recently in this trace" filter; the key
//! includes `trace_id` because `llm_messages` is trace-scoped.
//!
//! ## Producer-side dedup (LAM-1608)
//!
//! Hashing + Redis-existence checks run on the producer (HTTP/gRPC ingest)
//! BEFORE the message hits Rabbit. The producer emits an [`LlmInputDedupPlan`]
//! per LLM span: full ordered hash list, plus only the contents the consumer
//! actually needs to insert (i.e. messages we haven't seen recently). Already-
//! seen messages ride the queue as 32-byte hash references — the wire savings
//! grow linearly with conversation history depth.
//!
//! Redis is still stamped on the consumer side, AFTER the `llm_messages`
//! insert succeeds, so the "stamp only after success / unmark on failure"
//! invariant is preserved exactly. Producer never writes to Redis.

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::cache::{Cache, CacheTrait};
use crate::ch::llm_messages::CHLlmMessage;
use crate::db::spans::Span;
use crate::utils::sanitize_string;

const MESSAGE_SEEN_TTL_SECONDS: u64 = 3600;

fn message_seen_key(project_id: Uuid, trace_id: Uuid, hash: &[u8; 32]) -> String {
    format!(
        "m:{}:{}:{}",
        project_id.simple(),
        trace_id.simple(),
        hex::encode(hash)
    )
}

/// JSON with sorted object keys — stable hash identity across field-order-only diffs.
fn canonical_json(value: &Value) -> String {
    match value {
        Value::Object(map) => {
            let mut entries: Vec<(&String, &Value)> = map.iter().collect();
            entries.sort_by(|a, b| a.0.cmp(b.0));
            let mut out = String::from("{");
            for (i, (k, v)) in entries.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&serde_json::to_string(k).unwrap());
                out.push(':');
                out.push_str(&canonical_json(v));
            }
            out.push('}');
            out
        }
        Value::Array(items) => {
            let mut out = String::from("[");
            for (i, v) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&canonical_json(v));
            }
            out.push(']');
            out
        }
        _ => serde_json::to_string(value).unwrap(),
    }
}

/// Producer's hash + Redis-status verdict for one LLM span's input messages.
///
/// `hashes[i]` is the BLAKE3 hash of input message `i` over canonical JSON.
/// `new_indices` lists positions inside `hashes` whose contents we are still
/// shipping (Redis miss + first-occurrence-in-batch). The wire payload of
/// those messages lives in `new_contents` aligned with `new_indices`, so
/// `(new_indices[k], new_contents[k])` is one (position, ingest-order
/// JSON content) pair the consumer must insert into `llm_messages`.
///
/// Already-seen messages do NOT travel in `new_contents`: we only ship their
/// hash. The consumer never tries to read them back — the existing
/// `llm_messages_dict` lookup at view-read time is the only reader path.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LlmInputDedupPlan {
    pub hashes: Vec<[u8; 32]>,
    pub new_indices: Vec<u16>,
    pub new_contents: Vec<String>,
}

/// Producer-side: walk an LLM span's array `input`, hash each message,
/// stamp Redis-already-seen entries as drop-content, and return a plan.
/// Returns `None` when the span isn't an LLM span or its input isn't a JSON
/// array — no dedup applies. Redis errors are best-effort: on failure we
/// treat the message as new (insert path), matching the consumer's prior
/// behaviour.
pub async fn build_producer_plan(span: &Span, cache: Arc<Cache>) -> Option<LlmInputDedupPlan> {
    if !span.is_llm_span() {
        return None;
    }
    let items = match span.input.as_ref()? {
        Value::Array(items) => items,
        _ => return None,
    };

    let mut hashes: Vec<[u8; 32]> = Vec::with_capacity(items.len());
    let mut new_indices: Vec<u16> = Vec::new();
    let mut new_contents: Vec<String> = Vec::new();
    let mut seen_in_span: std::collections::HashSet<[u8; 32]> = std::collections::HashSet::new();

    for (idx, item) in items.iter().enumerate() {
        let canonical = canonical_json(item);
        let hash: [u8; 32] = *blake3::hash(canonical.as_bytes()).as_bytes();
        hashes.push(hash);

        // Same hash twice in one span — emit only once.
        if !seen_in_span.insert(hash) {
            continue;
        }

        let key = message_seen_key(span.project_id, span.trace_id, &hash);
        let already_seen = cache.exists(&key).await.unwrap_or(false);
        if already_seen {
            continue;
        }

        // Store ingest-order JSON (serde_json `preserve_order`) so reads
        // match the non-dedup path byte-for-byte. Hash stays canonical.
        let content = sanitize_string(&item.to_string());
        if let Ok(i) = u16::try_from(idx) {
            new_indices.push(i);
            new_contents.push(content);
        }
    }

    Some(LlmInputDedupPlan {
        hashes,
        new_indices,
        new_contents,
    })
}

/// `span_hashes[i]` / `span_content_bytes[i]` / `span_new_indices[i]` align
/// with the span order passed in. `span_content_bytes[i]` is the bytes of
/// `llm_messages.content` span `i` caused to be newly inserted — shared
/// messages contribute 0 (billed once). `span_new_indices[i]` lists the
/// 0-based positions inside `span_hashes[i]` that this span was first to
/// introduce; Quickwit indexing only sees these new messages.
///
/// `span_new_message_values[i]` is the Quickwit-ready `Vec<Value>` for span
/// `i` — exactly the messages at `span_new_indices[i]`, aligned. Pre-built
/// here because the producer-side path drops `span.input` and the consumer
/// has no way to recover the originals otherwise; the legacy path mirrors
/// the same shape from `span.input` for code-path symmetry.
pub struct DedupBatch {
    pub messages: Vec<CHLlmMessage>,
    pub span_hashes: Vec<Vec<[u8; 32]>>,
    pub span_content_bytes: Vec<usize>,
    pub span_new_indices: Vec<Vec<u16>>,
    pub span_new_message_values: Vec<Vec<Value>>,
}

/// Consume the per-span [`LlmInputDedupPlan`]s the producer attached and
/// build the cross-span insert batch. Across spans we still dedupe by
/// `(project_id, trace_id, hash)` — the producer's per-span Redis check
/// can't know about other spans in the same flush, but two spans in one
/// flush that share a never-yet-seen message must collapse to a single
/// `llm_messages` row (RMT would merge them anyway, but skipping the
/// duplicate write avoids transient double-counting in `span_content_bytes`).
///
/// Spans without a plan (legacy producers, non-LLM, non-array input) emit
/// empty hashes — same fall-through as the original consumer-side path.
pub fn build_dedup_batch_from_plans(
    spans: &[&Span],
    plans: &[Option<LlmInputDedupPlan>],
) -> DedupBatch {
    debug_assert_eq!(spans.len(), plans.len());

    let mut messages: Vec<CHLlmMessage> = Vec::new();
    let mut span_hashes: Vec<Vec<[u8; 32]>> = Vec::with_capacity(spans.len());
    let mut span_content_bytes: Vec<usize> = Vec::with_capacity(spans.len());
    let mut span_new_indices: Vec<Vec<u16>> = Vec::with_capacity(spans.len());
    let mut span_new_message_values: Vec<Vec<Value>> = Vec::with_capacity(spans.len());
    // Key must match `llm_messages` ORDER BY — batches can mix projects.
    let mut emitted_in_batch: std::collections::HashSet<(Uuid, Uuid, [u8; 32])> =
        std::collections::HashSet::new();

    for (span, plan) in spans.iter().zip(plans.iter()) {
        let Some(plan) = plan else {
            span_hashes.push(Vec::new());
            span_content_bytes.push(0);
            span_new_indices.push(Vec::new());
            span_new_message_values.push(Vec::new());
            continue;
        };

        // Insertable rows are the producer's `new_indices` filtered to those
        // that haven't already been emitted earlier in this flush.
        let mut new_indices: Vec<u16> = Vec::with_capacity(plan.new_indices.len());
        let mut content_bytes_for_span: usize = 0;
        // Quickwit indexing reconstructs Values from the producer's stored
        // ingest-order JSON strings — `span.input` is `None` on the producer
        // path. Malformed JSON falls through silently; the worst case is an
        // unindexed message, never a panic.
        let mut new_values: Vec<Value> = Vec::with_capacity(plan.new_indices.len());
        // Defensive: if a malformed plan arrives over the wire (out-of-bounds
        // `new_indices` / mismatched `new_contents` length), we skip the bad
        // entries rather than panic and requeue the entire batch forever.
        // Producer-built plans are always well-formed today; this guards
        // against future bugs and against the rare corruption-on-deserialise
        // case.
        for (i, &pos) in plan.new_indices.iter().enumerate() {
            let Some(&hash) = plan.hashes.get(pos as usize) else {
                continue;
            };
            let Some(content) = plan.new_contents.get(i) else {
                continue;
            };
            if !emitted_in_batch.insert((span.project_id, span.trace_id, hash)) {
                continue;
            }
            let content = content.clone();
            content_bytes_for_span += content.len();
            if let Ok(v) = serde_json::from_str::<Value>(&content) {
                new_values.push(v);
            }
            messages.push(CHLlmMessage {
                project_id: span.project_id,
                trace_id: span.trace_id,
                message_hash: hash,
                content,
            });
            new_indices.push(pos);
        }

        span_hashes.push(plan.hashes.clone());
        span_content_bytes.push(content_bytes_for_span);
        span_new_indices.push(new_indices);
        span_new_message_values.push(new_values);
    }

    DedupBatch {
        messages,
        span_hashes,
        span_content_bytes,
        span_new_indices,
        span_new_message_values,
    }
}

/// Stamp Redis only after the `llm_messages` insert succeeded.
pub async fn mark_seen(keys: &[(Uuid, Uuid, [u8; 32])], cache: Arc<Cache>) {
    for (project_id, trace_id, hash) in keys {
        let key = message_seen_key(*project_id, *trace_id, hash);
        let _ = cache
            .insert_with_ttl(&key, "1", MESSAGE_SEEN_TTL_SECONDS)
            .await;
    }
}

/// Clear markers so a retry of the failed insert re-emits the rows.
pub async fn unmark_seen(keys: &[(Uuid, Uuid, [u8; 32])], cache: Arc<Cache>) {
    for (project_id, trace_id, hash) in keys {
        let key = message_seen_key(*project_id, *trace_id, hash);
        let _ = cache.remove(&key).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn top_level_key_order_is_normalized() {
        let a = json!({"role": "user", "content": "hi"});
        let b = json!({"content": "hi", "role": "user"});
        assert_eq!(canonical_json(&a), canonical_json(&b));
        assert_eq!(canonical_json(&a), r#"{"content":"hi","role":"user"}"#);
    }

    #[test]
    fn nested_object_keys_are_sorted_at_every_depth() {
        let v = json!({
            "z": {"b": 1, "a": {"y": 2, "x": 1}},
            "a": [{"k": 2, "j": 1}],
        });
        assert_eq!(
            canonical_json(&v),
            r#"{"a":[{"j":1,"k":2}],"z":{"a":{"x":1,"y":2},"b":1}}"#
        );
    }

    #[test]
    fn array_element_order_is_preserved() {
        let v = json!([3, 1, 2]);
        assert_eq!(canonical_json(&v), "[3,1,2]");
        let reordered = json!([1, 2, 3]);
        assert_ne!(canonical_json(&v), canonical_json(&reordered));
    }

    #[test]
    fn primitives_pass_through() {
        assert_eq!(canonical_json(&json!(null)), "null");
        assert_eq!(canonical_json(&json!(true)), "true");
        assert_eq!(canonical_json(&json!(42)), "42");
        assert_eq!(canonical_json(&json!("hi")), "\"hi\"");
    }

    #[test]
    fn string_keys_and_values_are_json_escaped() {
        let v = json!({"a\"b": "x\ny", "c": "\\"});
        assert_eq!(canonical_json(&v), r#"{"a\"b":"x\ny","c":"\\"}"#);
    }

    #[test]
    fn blake3_hash_is_stable_across_field_order() {
        let a = json!({"role": "user", "content": [{"type": "text", "text": "hi"}]});
        let b = json!({"content": [{"text": "hi", "type": "text"}], "role": "user"});
        let ha = blake3::hash(canonical_json(&a).as_bytes());
        let hb = blake3::hash(canonical_json(&b).as_bytes());
        assert_eq!(ha.as_bytes(), hb.as_bytes());
    }

    #[test]
    fn build_dedup_batch_from_plans_dedupes_across_spans_in_one_flush() {
        // Two spans sharing the same trace, both shipping the same never-seen
        // message — the second span must NOT re-insert it; its bytes attribute
        // to the first referrer only.
        let project_id = Uuid::nil();
        let trace_id = Uuid::nil();
        let hash = [7u8; 32];
        let plan = LlmInputDedupPlan {
            hashes: vec![hash],
            new_indices: vec![0],
            new_contents: vec![r#"{"role":"user","content":"hi"}"#.to_string()],
        };

        let span_a = Span {
            project_id,
            trace_id,
            ..Default::default()
        };
        let span_b = Span {
            project_id,
            trace_id,
            ..Default::default()
        };
        let spans: Vec<&Span> = vec![&span_a, &span_b];
        let plans = vec![Some(plan.clone()), Some(plan)];
        let batch = build_dedup_batch_from_plans(&spans, &plans);

        assert_eq!(batch.messages.len(), 1, "shared message inserted once");
        assert_eq!(batch.span_hashes[0], vec![hash]);
        assert_eq!(batch.span_hashes[1], vec![hash]);
        assert_eq!(batch.span_new_indices[0], vec![0u16]);
        assert!(
            batch.span_new_indices[1].is_empty(),
            "second span attributes 0 new bytes"
        );
        assert!(batch.span_content_bytes[0] > 0);
        assert_eq!(batch.span_content_bytes[1], 0);
    }
}
