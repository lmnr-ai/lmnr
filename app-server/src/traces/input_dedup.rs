//! Project-scoped structural deduplication for LLM span input + output
//! messages.
//!
//! ## Two semantic axes
//!
//! Each message gets two independent Redis-backed checks:
//!
//! - **Storage** (`s:{project_id}:{hash}`): drives whether the producer ships
//!   the content on the wire and whether the consumer inserts a row into the
//!   `shared_content` table. Project-scoped — same content seen across two
//!   traces in the same project collapses to one CH row.
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
//! and runs only AFTER a successful `shared_content` insert. On insert
//! failure we return transient and let Rabbit redeliver — no phantom keys
//! for content that didn't make it to CH.

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::cache::{Cache, CacheTrait};
use crate::ch::deduped_content::CHDedupedContent;
use crate::db::spans::Span;
use crate::utils::sanitize_string;

const MESSAGE_SEEN_TTL_SECONDS: u64 = 3600;

/// Project-scoped storage check: have we ever inserted content for this hash
/// recently (within TTL)? Drives wire content + `shared_content` insert.
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
                // Object keys are always plain strings — `serde_json::to_string`
                // on a `&String` is infallible.
                out.push_str(
                    &serde_json::to_string(k)
                        .expect("serde_json::to_string of a String is infallible"),
                );
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
        // Only `Number`/`Bool`/`Null`/`String` reach this arm (Object/Array
        // are handled above). All four are infallible to serialize.
        _ => serde_json::to_string(value)
            .expect("serde_json::to_string of a JSON scalar is infallible"),
    }
}

/// Debugger-replay-cache (LAM-1715) input hash for a whole LLM-call message
/// array. Distinct from the per-message dedup hashing above: it hashes the
/// **entire** message array (with system messages removed) as one blob so the
/// same key can be reproduced byte-for-byte by the SDK before each live call.
///
/// `input` is the full reconstructed message array for the span. **Every**
/// message with `role == "system"` is stripped first — regardless of its
/// content or position — because the coding agent may add, remove, or edit its
/// own system prompt(s) between iterations, and those edits must not change the
/// cache key. The remaining array is then canonicalized (object keys sorted
/// recursively, array order preserved) and blake3-hashed. Returns the 64-char
/// lowercase hex digest. No number canonicalization in v1.
///
/// This intentionally strips by `role` alone and does NOT reuse
/// `prompt_hash::extract_system_message` (which removes a single system message,
/// and only when it has extractable text). The cache contract is the simpler
/// "drop all system messages", which the SDK mirrors exactly.
pub fn debug_input_hash(input: &Value) -> String {
    let messages = match input.as_array() {
        Some(arr) => Value::Array(
            arr.iter()
                .filter(|m| m.get("role").and_then(|r| r.as_str()) != Some("system"))
                .cloned()
                .collect(),
        ),
        None => input.clone(),
    };
    let canonical = canonical_json(&messages);
    let hash = blake3::hash(canonical.as_bytes());
    hex::encode(hash.as_bytes())
}

/// Producer's hash + Redis-status verdict for one LLM span's message array
/// (input or output). Both axes are independent:
///
/// - `trace_new_indices` lists positions that this span's trace has not yet
///   seen — drives `*_new_message_indices` for search "first occurrence in
///   trace" semantic AND drives Quickwit per-trace indexing.
/// - `trace_new_contents` is aligned with `trace_new_indices` and carries
///   the JSON content for each trace-new position. Always shipped for
///   trace-new positions even when the position is also a storage-hit
///   (cross-trace case under project-scoped storage), because Quickwit
///   needs the content to index this trace's first-occurrence even when
///   the bytes are already in `shared_content` from another trace.
/// - `storage_miss_offsets` is the subset of indexes into `trace_new_*`
///   that the consumer must additionally insert into `shared_content`.
///   `storage_miss ⊆ trace_new` always (storage-miss implies the content
///   has never been seen project-wide, which is necessarily trace-new),
///   so we save wire bytes by sending only one content array.
///
/// Already-seen-in-trace-and-storage messages do NOT travel in
/// `trace_new_contents`: only hash references ride the wire. The consumer
/// never re-hashes — the `deduped_content_dict` lookup at view-read time is
/// the only reader path for those.
#[derive(Serialize, Debug, Clone)]
pub struct MessageDedup {
    pub hashes: Vec<[u8; 32]>,
    pub trace_new_indices: Vec<u16>,
    pub trace_new_contents: Vec<String>,
    pub storage_miss_offsets: Vec<u16>,
}

// Backward-compatible deserialization: the old (pre project-scoped) wire shape
// used `new_indices` / `new_contents` and had no `storage_miss_offsets`. Under
// that trace-scoped model every trace-new position was also a storage miss, so
// we synthesize `storage_miss_offsets = 0..trace_new_indices.len()`. Remove
// this custom impl (restore `#[derive(Deserialize)]`) once all old-shape
// messages have drained from the queue.
impl<'de> Deserialize<'de> for MessageDedup {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(Deserialize)]
        struct Wire {
            hashes: Vec<[u8; 32]>,
            #[serde(default, alias = "new_indices")]
            trace_new_indices: Vec<u16>,
            #[serde(default, alias = "new_contents")]
            trace_new_contents: Vec<String>,
            #[serde(default)]
            storage_miss_offsets: Option<Vec<u16>>,
        }

        let wire = Wire::deserialize(deserializer)?;
        let storage_miss_offsets = wire
            .storage_miss_offsets
            .unwrap_or_else(|| (0..wire.trace_new_indices.len() as u16).collect());
        Ok(MessageDedup {
            hashes: wire.hashes,
            trace_new_indices: wire.trace_new_indices,
            trace_new_contents: wire.trace_new_contents,
            storage_miss_offsets,
        })
    }
}

/// Producer-side: walk an LLM span's array message field (`input` or
/// `output`), hash each message, consult the two Redis scopes, and return the
/// dedup verdict. Returns `None` when the span isn't an LLM span or `value`
/// isn't a non-empty JSON array — no dedup applies. Redis errors are
/// best-effort: on failure we treat the entry as new on both axes (insert +
/// mark trace-new), which keeps the system correct at the cost of extra
/// writes.
pub async fn build_message_dedup(
    span: &Span,
    value: Option<&Value>,
    cache: Arc<Cache>,
) -> Option<MessageDedup> {
    if !span.is_llm_span() {
        return None;
    }
    let items = match value? {
        Value::Array(items) if !items.is_empty() => items,
        // Empty `Some([])` — preserve the wire shape so `CHSpan.input/output`
        // round-trips as `"[]"` rather than empty string.
        _ => return None,
    };

    let mut hashes: Vec<[u8; 32]> = Vec::with_capacity(items.len());
    let mut trace_new_indices: Vec<u16> = Vec::new();
    let mut trace_new_contents: Vec<String> = Vec::new();
    let mut storage_miss_offsets: Vec<u16> = Vec::new();
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

        // Trace-new check: is this hash new to this trace? If we've already
        // emitted it for this span, skip — RMT/dedup semantics handle it.
        let trace_key = trace_new_key(span.project_id, span.trace_id, &hash);
        let trace_already_seen = cache.exists(&trace_key).await.unwrap_or(false);
        if trace_already_seen || !seen_trace_in_span.insert(hash) {
            continue;
        }

        // Trace-new: ship content so Quickwit can index this trace's
        // first-occurrence even when storage is a hit. Use ingest-order
        // JSON (serde_json `preserve_order`) so reads reconstruct
        // byte-identical to the non-dedup path. Hash stays canonical.
        let content = sanitize_string(&item.to_string());
        let offset = trace_new_indices.len() as u16;
        trace_new_indices.push(pos);
        trace_new_contents.push(content);

        // Storage check: only the storage-miss subset of trace-new
        // positions also needs to land in `shared_content`. Storage-hit
        // means the bytes are already there from another trace.
        let storage_key = storage_seen_key(span.project_id, &hash);
        let storage_already_seen = cache.exists(&storage_key).await.unwrap_or(false);
        if !storage_already_seen {
            storage_miss_offsets.push(offset);
        }
    }

    Some(MessageDedup {
        hashes,
        trace_new_indices,
        trace_new_contents,
        storage_miss_offsets,
    })
}

/// Consumer-side per-span resolution of one [`MessageDedup`] verdict against
/// the cross-span batch state. Spans without a verdict (legacy producers,
/// non-LLM, non-array field) emit empty hashes — same fall-through as the
/// non-dedup path.
///
/// `span_hashes[i]` / `span_content_bytes[i]` / `span_new_indices[i]` /
/// `span_trace_new_contents[i]` align with the spans slice passed in.
/// `span_content_bytes[i]` is the bytes of `shared_content.content` span `i`
/// caused to be newly inserted — shared content contributes 0 (billed once
/// to the first referrer in the batch).
/// `span_new_indices[i]` is the trace-new positions inside `span_hashes[i]`
/// (search semantic).
/// `span_trace_new_contents[i]` is the JSON content for every trace-new
/// position of span `i` — used by Quickwit per-trace indexing. Includes
/// content for trace-new + storage-hit positions (cross-trace case under
/// project-scoped storage), so Quickwit indexes this trace's first-
/// occurrence even when the bytes are already in `shared_content` from
/// another trace.
///
/// For storage-miss positions the string is duplicated into both
/// `shared_content` (CH insert) and `span_trace_new_contents` (Quickwit
/// indexing). The PII redactor redacts both copies in lockstep when
/// `remove_pii=true` for the project.
pub struct DedupBatch {
    pub span_hashes: Vec<Vec<[u8; 32]>>,
    pub span_content_bytes: Vec<usize>,
    pub span_new_indices: Vec<Vec<u16>>,
    pub span_trace_new_contents: Vec<Vec<String>>,
}

/// Build a per-field cross-span dedup batch. Maintains a project-scoped
/// HashSet (matching the `shared_content` ORDER BY) so two spans in one
/// flush sharing a never-yet-stored hash collapse to a single insert.
///
/// `seen_storage_in_batch` is shared across both fields and the tool path
/// when the caller threads it through — a hash appearing as input in span A
/// and output in span B emits one `shared_content` row, billed to whichever
/// lands first.
pub fn build_dedup_batch(
    spans: &[&Span],
    dedups: &[Option<MessageDedup>],
    seen_storage_in_batch: &mut std::collections::HashSet<(Uuid, [u8; 32])>,
    shared_content: &mut Vec<CHDedupedContent>,
) -> DedupBatch {
    debug_assert_eq!(spans.len(), dedups.len());

    let mut span_hashes: Vec<Vec<[u8; 32]>> = Vec::with_capacity(spans.len());
    let mut span_content_bytes: Vec<usize> = Vec::with_capacity(spans.len());
    let mut span_new_indices: Vec<Vec<u16>> = Vec::with_capacity(spans.len());
    let mut span_trace_new_contents: Vec<Vec<String>> = Vec::with_capacity(spans.len());

    for (span, dedup) in spans.iter().zip(dedups.iter()) {
        let Some(dedup) = dedup else {
            span_hashes.push(Vec::new());
            span_content_bytes.push(0);
            span_new_indices.push(Vec::new());
            span_trace_new_contents.push(Vec::new());
            continue;
        };

        // `storage_miss_offsets` indexes into `trace_new_*`. Build a quick
        // lookup so we know which trace-new offsets are also storage-miss.
        let storage_miss_set: std::collections::HashSet<u16> =
            dedup.storage_miss_offsets.iter().copied().collect();

        let mut content_bytes_for_span: usize = 0;
        // Always carry trace-new content per span; Quickwit reads this
        // directly so cross-trace storage-hit content is still searchable
        // for THIS trace's first occurrence.
        let mut trace_new_contents_for_span: Vec<String> =
            Vec::with_capacity(dedup.trace_new_indices.len());
        // Defensive: if a malformed dedup arrives over the wire
        // (out-of-bounds index / mismatched length), skip the bad entries
        // rather than panic and requeue the entire batch forever.
        for (offset, &pos) in dedup.trace_new_indices.iter().enumerate() {
            let Some(&hash) = dedup.hashes.get(pos as usize) else {
                continue;
            };
            let Some(content) = dedup.trace_new_contents.get(offset) else {
                continue;
            };

            trace_new_contents_for_span.push(content.clone());

            // Insert into `shared_content` only when this position is also
            // storage-miss AND we haven't already seen the hash earlier in
            // this flush.
            let is_storage_miss = storage_miss_set.contains(&(offset as u16));
            if is_storage_miss && seen_storage_in_batch.insert((span.project_id, hash)) {
                let content = content.clone();
                content_bytes_for_span += content.len();
                shared_content.push(CHDedupedContent {
                    project_id: span.project_id,
                    content_hash: hash,
                    content,
                });
            }
        }

        span_hashes.push(dedup.hashes.clone());
        span_content_bytes.push(content_bytes_for_span);
        span_new_indices.push(dedup.trace_new_indices.clone());
        span_trace_new_contents.push(trace_new_contents_for_span);
    }

    DedupBatch {
        span_hashes,
        span_content_bytes,
        span_new_indices,
        span_trace_new_contents,
    }
}

/// Stamp Redis only after the `shared_content` insert succeeded.
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
    fn deserializes_old_wire_shape_with_legacy_field_names() {
        let zero_hash = format!("[{}]", vec!["0"; 32].join(","));
        let json_str =
            format!(r#"{{"hashes":[{zero_hash}],"new_indices":[0],"new_contents":["{{}}"]}}"#);
        let dedup: MessageDedup = serde_json::from_str(&json_str).unwrap();
        assert_eq!(dedup.trace_new_indices, vec![0]);
        assert_eq!(dedup.trace_new_contents, vec!["{}".to_string()]);
        // Old trace-scoped model: every trace-new position was a storage miss.
        assert_eq!(dedup.storage_miss_offsets, vec![0]);
    }

    #[test]
    fn deserializes_new_wire_shape_roundtrip() {
        let dedup = MessageDedup {
            hashes: vec![[0u8; 32]],
            trace_new_indices: vec![0],
            trace_new_contents: vec!["{}".to_string()],
            storage_miss_offsets: vec![],
        };
        let s = serde_json::to_string(&dedup).unwrap();
        let back: MessageDedup = serde_json::from_str(&s).unwrap();
        assert_eq!(back.trace_new_indices, vec![0]);
        // Explicit empty `storage_miss_offsets` is preserved, NOT re-synthesized.
        assert_eq!(back.storage_miss_offsets, Vec::<u16>::new());
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
            build_message_dedup(&span, span.input.as_ref(), make_cache())
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
        let dedup = build_message_dedup(&span, span.input.as_ref(), cache)
            .await
            .unwrap();
        assert_eq!(dedup.hashes.len(), 1);
        assert_eq!(dedup.trace_new_indices, vec![0]);
        assert_eq!(dedup.trace_new_contents.len(), 1);
        // First-time content is also a storage miss — the consumer inserts
        // it into `shared_content`.
        assert_eq!(dedup.storage_miss_offsets, vec![0]);
    }

    #[tokio::test]
    async fn cross_trace_storage_hit_still_carries_content_for_quickwit() {
        // Same content seen in trace A; appearing in trace B must NOT ship
        // the content for `shared_content` insert (storage hit) but MUST
        // still carry the content in `trace_new_contents` so Quickwit can
        // index this trace's first occurrence.
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
        let dedup = build_message_dedup(&span, span.input.as_ref(), cache)
            .await
            .unwrap();
        assert_eq!(dedup.hashes.len(), 1);
        assert_eq!(
            dedup.trace_new_indices,
            vec![0],
            "trace B has not seen this content yet — must still be trace-new"
        );
        assert_eq!(
            dedup.trace_new_contents.len(),
            1,
            "content must travel for Quickwit per-trace indexing even when storage is a hit"
        );
        assert!(
            dedup.storage_miss_offsets.is_empty(),
            "storage hit — no `shared_content` insert needed"
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
        let dedup = build_message_dedup(&span, span.input.as_ref(), cache)
            .await
            .unwrap();
        assert_eq!(dedup.hashes.len(), 2);
        assert!(dedup.trace_new_indices.is_empty());
        assert!(dedup.trace_new_contents.is_empty());
    }

    #[tokio::test]
    async fn build_dedup_batch_quickwit_sees_storage_hit_content() {
        // Regression: under project-scoped storage, a message that's
        // storage-hit but trace-new (re-running an agent in a new trace)
        // must still have its content available to Quickwit indexing.
        // Pre-fix the consumer's `shared_content` Vec only contained
        // storage-miss content, so cross-trace-shared messages were
        // silently dropped from the index.
        use crate::cache::in_memory::InMemoryCache;

        let project_id = Uuid::new_v4();
        let trace_id = Uuid::new_v4();
        let cache: Arc<Cache> = Arc::new(Cache::InMemory(InMemoryCache::new(None)));
        let msg = json!({"role": "system", "content": "you are helpful"});
        let canonical = canonical_json(&msg);
        let hash: [u8; 32] = *blake3::hash(canonical.as_bytes()).as_bytes();
        // Stamp storage as if a prior trace already inserted this hash.
        cache
            .insert_with_ttl(
                &storage_seen_key(project_id, &hash),
                "1",
                MESSAGE_SEEN_TTL_SECONDS,
            )
            .await
            .unwrap();

        let span = Span {
            span_type: SpanType::LLM,
            project_id,
            trace_id,
            input: Some(json!([msg])),
            ..Default::default()
        };
        let dedup = build_message_dedup(&span, span.input.as_ref(), cache)
            .await
            .unwrap();

        let mut shared_content: Vec<CHDedupedContent> = Vec::new();
        let mut seen: std::collections::HashSet<(Uuid, [u8; 32])> =
            std::collections::HashSet::new();
        let batch = build_dedup_batch(&[&span], &[Some(dedup)], &mut seen, &mut shared_content);

        assert!(
            shared_content.is_empty(),
            "storage hit — nothing should be inserted into shared_content"
        );
        assert_eq!(batch.span_trace_new_contents.len(), 1, "one span");
        assert_eq!(
            batch.span_trace_new_contents[0].len(),
            1,
            "trace-new content must be available for Quickwit even on storage hit"
        );
        assert!(
            batch.span_trace_new_contents[0][0].contains("you are helpful"),
            "the actual message content must travel to Quickwit"
        );
    }
}
