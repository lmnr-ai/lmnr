//! Project-scoped structural deduplication for LLM span input + output
//! messages and tool-definition blobs (LAM-1634).
//!
//! ## Two semantic axes
//!
//! Each message gets two independent Redis-backed checks:
//!
//! - **Storage** (`s:{project_id}:{hash}`): drives whether the producer ships
//!   the content on the wire and whether the consumer inserts a row into
//!   `messages`. Project-scoped — same content seen across two traces in the
//!   same project collapses to one CH row.
//! - **Trace-new** (`tn:{project_id}:{trace_id}:{hash}`): drives
//!   `*_new_message_indices` for search. Trace-scoped — preserves the "first
//!   occurrence per trace" semantic that span search relies on.
//!
//! These are independent: a message can be storage-hit + trace-miss (skip
//! content insert, but still mark as trace-new for search). That's the
//! cross-trace case that keeps search results correct under project-scoped
//! storage.
//!
//! ## Stamping rules
//!
//! Producer NEVER writes Redis. The consumer's `mark_seen` is the only writer
//! and runs only AFTER a successful `messages` insert. On insert failure we
//! return transient and let Rabbit redeliver — no phantom keys for content
//! that didn't make it to CH.

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::cache::{Cache, CacheTrait};
use crate::ch::messages::CHMessage;
use crate::db::spans::Span;
use crate::utils::sanitize_string;

const MESSAGE_SEEN_TTL_SECONDS: u64 = 3600;

/// Project-scoped storage check: have we ever inserted content for this hash
/// recently (within TTL)? Drives wire content + `messages` insert.
fn storage_seen_key(project_id: Uuid, hash: &[u8; 32]) -> String {
    format!("s:{}:{}", project_id.simple(), hex::encode(hash))
}

/// Trace-scoped first-occurrence check: has this span's trace already seen
/// this hash in any prior span (input or output)? Drives
/// `*_new_message_indices`. Independent of storage — same content can be
/// trace-new while being storage-hit (cross-trace case under project-scoped
/// storage).
fn trace_new_key(project_id: Uuid, trace_id: Uuid, hash: &[u8; 32]) -> String {
    format!(
        "tn:{}:{}:{}",
        project_id.simple(),
        trace_id.simple(),
        hex::encode(hash)
    )
}

/// JSON with sorted object keys — stable hash identity across field-order-only diffs.
pub fn canonical_json(value: &Value) -> String {
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

/// Producer's hash + Redis-status verdict for one LLM span's message array
/// (input or output). Both axes are independent:
///
/// - `storage_miss_indices` lists positions inside `hashes` whose content
///   the consumer must insert into `messages`. Aligned with `new_contents`.
/// - `trace_new_indices` lists positions that this span's trace has not yet
///   seen — drives `*_new_message_indices` for search "first occurrence in
///   trace" semantic.
///
/// Already-seen-everywhere messages do NOT travel in `new_contents`: only
/// hash references ride the wire. The consumer never re-hashes — the
/// `messages_dict` lookup at view-read time is the only reader path.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MessageDedup {
    pub hashes: Vec<[u8; 32]>,
    pub storage_miss_indices: Vec<u16>,
    pub new_contents: Vec<String>,
    pub trace_new_indices: Vec<u16>,
}

/// Field selector for `build_message_dedup` — determines which span field is
/// being deduped. Affects only logging today; same Redis namespaces are used
/// for both fields because the `messages` table is content-addressed and
/// shared across input/output (a message that is output for span A and input
/// for span B collapses to one row).
#[derive(Copy, Clone, Debug)]
pub enum MessageField {
    Input,
    Output,
}

/// Producer-side: walk an LLM span's array `input` or `output`, hash each
/// message, consult the two Redis scopes, and return the dedup verdict.
/// Returns `None` when the span isn't an LLM span or the field isn't a
/// non-empty JSON array — no dedup applies. Redis errors are best-effort: on
/// failure we treat the entry as new on both axes (insert + mark trace-new),
/// which keeps the system correct at the cost of extra writes.
pub async fn build_message_dedup(
    span: &Span,
    field: MessageField,
    cache: Arc<Cache>,
) -> Option<MessageDedup> {
    if !span.is_llm_span() {
        return None;
    }
    let value = match field {
        MessageField::Input => span.input.as_ref(),
        MessageField::Output => span.output.as_ref(),
    };
    let items = match value? {
        Value::Array(items) if !items.is_empty() => items,
        // Empty `Some([])` — preserve the wire shape so `CHSpan.input/output`
        // round-trips as `"[]"` rather than empty string.
        _ => return None,
    };

    let mut hashes: Vec<[u8; 32]> = Vec::with_capacity(items.len());
    let mut storage_miss_indices: Vec<u16> = Vec::new();
    let mut new_contents: Vec<String> = Vec::new();
    let mut trace_new_indices: Vec<u16> = Vec::new();
    let mut seen_storage_in_span: std::collections::HashSet<[u8; 32]> =
        std::collections::HashSet::new();
    let mut seen_trace_in_span: std::collections::HashSet<[u8; 32]> =
        std::collections::HashSet::new();

    for (idx, item) in items.iter().enumerate() {
        let canonical = canonical_json(item);
        let hash: [u8; 32] = *blake3::hash(canonical.as_bytes()).as_bytes();
        hashes.push(hash);

        let pos = match u16::try_from(idx) {
            Ok(p) => p,
            Err(_) => continue,
        };

        // Trace-new check: is this hash new to this trace?
        let trace_key = trace_new_key(span.project_id, span.trace_id, &hash);
        let trace_already_seen = cache.exists(&trace_key).await.unwrap_or(false);
        if !trace_already_seen && seen_trace_in_span.insert(hash) {
            trace_new_indices.push(pos);
        }

        // Storage check: do we already have content stored for this hash
        // anywhere in the project?
        if !seen_storage_in_span.insert(hash) {
            // Already emitted within this span — skip duplicate work.
            continue;
        }
        let storage_key = storage_seen_key(span.project_id, &hash);
        let storage_already_seen = cache.exists(&storage_key).await.unwrap_or(false);
        if storage_already_seen {
            continue;
        }

        // Storage miss: ship content for the consumer to insert. Use ingest-
        // order JSON (serde_json `preserve_order`) so reads reconstruct
        // byte-identical to the non-dedup path. Hash stays canonical.
        let content = sanitize_string(&item.to_string());
        storage_miss_indices.push(pos);
        new_contents.push(content);
    }

    Some(MessageDedup {
        hashes,
        storage_miss_indices,
        new_contents,
        trace_new_indices,
    })
}

/// Consumer-side per-span resolution of one [`MessageDedup`] verdict against
/// the cross-span batch state. Spans without a verdict (legacy producers,
/// non-LLM, non-array field) emit empty hashes — same fall-through as the
/// non-dedup path.
///
/// `span_hashes[i]` / `span_content_bytes[i]` / `span_new_indices[i]` /
/// `span_new_message_indices[i]` align with the spans slice passed in.
/// `span_content_bytes[i]` is the bytes of `messages.content` span `i` caused
/// to be newly inserted — shared content contributes 0 (billed once to the
/// first referrer in the batch).
/// `span_new_indices[i]` is the trace-new positions (search semantic).
/// `span_new_message_indices[i]` lists positions into `messages` (for
/// Quickwit per-span message-slice reads).
pub struct DedupBatch {
    pub span_hashes: Vec<Vec<[u8; 32]>>,
    pub span_content_bytes: Vec<usize>,
    pub span_new_indices: Vec<Vec<u16>>,
    pub span_new_message_indices: Vec<Vec<usize>>,
}

/// Build a per-field cross-span dedup batch. Maintains a project-scoped
/// HashSet (matching the `messages` ORDER BY) so two spans in one flush
/// sharing a never-yet-stored hash collapse to a single insert.
///
/// `seen_storage_in_batch` is shared across both fields and the tool path
/// when the caller threads it through — a hash appearing as input in span A
/// and output in span B emits one `messages` row, billed to whichever lands
/// first.
pub fn build_dedup_batch(
    spans: &[&Span],
    dedups: &[Option<MessageDedup>],
    seen_storage_in_batch: &mut std::collections::HashSet<(Uuid, [u8; 32])>,
    messages: &mut Vec<CHMessage>,
) -> DedupBatch {
    debug_assert_eq!(spans.len(), dedups.len());

    let mut span_hashes: Vec<Vec<[u8; 32]>> = Vec::with_capacity(spans.len());
    let mut span_content_bytes: Vec<usize> = Vec::with_capacity(spans.len());
    let mut span_new_indices: Vec<Vec<u16>> = Vec::with_capacity(spans.len());
    let mut span_new_message_indices: Vec<Vec<usize>> = Vec::with_capacity(spans.len());

    for (span, dedup) in spans.iter().zip(dedups.iter()) {
        let Some(dedup) = dedup else {
            span_hashes.push(Vec::new());
            span_content_bytes.push(0);
            span_new_indices.push(Vec::new());
            span_new_message_indices.push(Vec::new());
            continue;
        };

        let mut new_message_indices: Vec<usize> =
            Vec::with_capacity(dedup.storage_miss_indices.len());
        let mut content_bytes_for_span: usize = 0;
        // Defensive: if a malformed dedup arrives over the wire (out-of-bounds
        // `storage_miss_indices` / mismatched `new_contents` length), skip the
        // bad entries rather than panic and requeue the entire batch forever.
        for (i, &pos) in dedup.storage_miss_indices.iter().enumerate() {
            let Some(&hash) = dedup.hashes.get(pos as usize) else {
                continue;
            };
            let Some(content) = dedup.new_contents.get(i) else {
                continue;
            };
            if !seen_storage_in_batch.insert((span.project_id, hash)) {
                continue;
            }
            let content = content.clone();
            content_bytes_for_span += content.len();
            let msg_idx = messages.len();
            messages.push(CHMessage {
                project_id: span.project_id,
                message_hash: hash,
                content,
            });
            new_message_indices.push(msg_idx);
        }

        span_hashes.push(dedup.hashes.clone());
        span_content_bytes.push(content_bytes_for_span);
        span_new_indices.push(dedup.trace_new_indices.clone());
        span_new_message_indices.push(new_message_indices);
    }

    DedupBatch {
        span_hashes,
        span_content_bytes,
        span_new_indices,
        span_new_message_indices,
    }
}

/// Stamp Redis only after the `messages` insert succeeded.
///
/// `storage_keys`: `(project_id, hash)` — the content rows we just inserted.
/// `trace_keys`: `(project_id, trace_id, hash)` — every position we marked
/// trace-new on the spans (drives search "first occurrence in trace"
/// semantic; must be stamped even when storage was a hit).
pub async fn mark_seen(
    storage_keys: &[(Uuid, [u8; 32])],
    trace_keys: &[(Uuid, Uuid, [u8; 32])],
    cache: Arc<Cache>,
) {
    for (project_id, hash) in storage_keys {
        let key = storage_seen_key(*project_id, hash);
        let _ = cache
            .insert_with_ttl(&key, "1", MESSAGE_SEEN_TTL_SECONDS)
            .await;
    }
    for (project_id, trace_id, hash) in trace_keys {
        let key = trace_new_key(*project_id, *trace_id, hash);
        let _ = cache
            .insert_with_ttl(&key, "1", MESSAGE_SEEN_TTL_SECONDS)
            .await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::in_memory::InMemoryCache;
    use crate::db::spans::SpanType;
    use serde_json::json;

    fn make_cache() -> Arc<Cache> {
        Arc::new(Cache::InMemory(InMemoryCache::new(None)))
    }

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
    fn blake3_hash_is_stable_across_field_order() {
        let a = json!({"role": "user", "content": [{"type": "text", "text": "hi"}]});
        let b = json!({"content": [{"text": "hi", "type": "text"}], "role": "user"});
        let ha = blake3::hash(canonical_json(&a).as_bytes());
        let hb = blake3::hash(canonical_json(&b).as_bytes());
        assert_eq!(ha.as_bytes(), hb.as_bytes());
    }

    #[tokio::test]
    async fn build_dedup_returns_none_for_empty_input_array() {
        let span = Span {
            span_type: SpanType::LLM,
            input: Some(json!([])),
            ..Default::default()
        };
        assert!(
            build_message_dedup(&span, MessageField::Input, make_cache())
                .await
                .is_none()
        );
    }

    #[tokio::test]
    async fn first_occurrence_marks_storage_miss_and_trace_new() {
        let span = Span {
            span_type: SpanType::LLM,
            project_id: Uuid::new_v4(),
            trace_id: Uuid::new_v4(),
            input: Some(json!([{"role": "user", "content": "hi"}])),
            ..Default::default()
        };
        let cache = make_cache();
        let dedup = build_message_dedup(&span, MessageField::Input, cache)
            .await
            .unwrap();
        assert_eq!(dedup.hashes.len(), 1);
        assert_eq!(dedup.storage_miss_indices, vec![0]);
        assert_eq!(dedup.trace_new_indices, vec![0]);
        assert_eq!(dedup.new_contents.len(), 1);
    }

    #[tokio::test]
    async fn cross_trace_storage_hit_still_marks_trace_new() {
        // Same content seen in trace A; appearing in trace B must NOT ship the
        // content again (storage hit) but MUST still mark as trace-new for
        // search "first occurrence in trace" semantic.
        let project_id = Uuid::new_v4();
        let trace_a = Uuid::new_v4();
        let trace_b = Uuid::new_v4();
        let cache = make_cache();
        let msg = json!([{"role": "user", "content": "hi"}]);

        // Stamp storage as if trace A had inserted.
        let canonical = canonical_json(&msg.as_array().unwrap()[0]);
        let hash: [u8; 32] = *blake3::hash(canonical.as_bytes()).as_bytes();
        let storage_key = storage_seen_key(project_id, &hash);
        cache
            .insert_with_ttl(&storage_key, "1", MESSAGE_SEEN_TTL_SECONDS)
            .await
            .unwrap();
        // Trace A's trace-new key (different trace, irrelevant to trace B).
        let trace_a_key = trace_new_key(project_id, trace_a, &hash);
        cache
            .insert_with_ttl(&trace_a_key, "1", MESSAGE_SEEN_TTL_SECONDS)
            .await
            .unwrap();

        let span = Span {
            span_type: SpanType::LLM,
            project_id,
            trace_id: trace_b,
            input: Some(msg),
            ..Default::default()
        };
        let dedup = build_message_dedup(&span, MessageField::Input, cache)
            .await
            .unwrap();
        assert_eq!(dedup.hashes.len(), 1);
        assert!(
            dedup.storage_miss_indices.is_empty(),
            "storage hit — no content should ship"
        );
        assert_eq!(
            dedup.trace_new_indices,
            vec![0],
            "trace B has not seen this content yet — must still be trace-new for search"
        );
    }

    #[tokio::test]
    async fn within_trace_repeat_does_not_double_mark() {
        // If the same hash appears twice in a span's array AND was already
        // seen in this trace, it must not be marked trace-new again.
        let project_id = Uuid::new_v4();
        let trace_id = Uuid::new_v4();
        let cache = make_cache();
        let msg = json!({"role": "user", "content": "hi"});
        let canonical = canonical_json(&msg);
        let hash: [u8; 32] = *blake3::hash(canonical.as_bytes()).as_bytes();
        let trace_key = trace_new_key(project_id, trace_id, &hash);
        cache
            .insert_with_ttl(&trace_key, "1", MESSAGE_SEEN_TTL_SECONDS)
            .await
            .unwrap();

        let span = Span {
            span_type: SpanType::LLM,
            project_id,
            trace_id,
            input: Some(json!([msg.clone(), msg])),
            ..Default::default()
        };
        let dedup = build_message_dedup(&span, MessageField::Input, cache)
            .await
            .unwrap();
        assert_eq!(dedup.hashes.len(), 2);
        assert!(dedup.trace_new_indices.is_empty());
    }
}
