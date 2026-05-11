//! LLM span input message deduplication.
//!
//! Agent traces repeat most of the conversation on every step (step k's
//! input is step k-1's input plus one new message), so a k-step trace can
//! grow roughly k(k+1)/2 messages when it could store only k. This module
//! dedups messages per (project_id, trace_id) at ingest time: each message
//! is hashed with BLAKE3-256 over its canonical (sorted-keys) JSON form,
//! first-seen messages are inserted into the `llm_messages` ClickHouse
//! table, and the span's `input` is replaced by an ordered array of hashes
//! (`input_message_hashes`). The `spans_v0` view reconstructs the original
//! `input` JSON transparently.
//!
//! Redis (via the `Cache` trait, which transparently falls back to the
//! in-memory cache) acts as a short-lived "seen this hash already" marker
//! so we skip re-inserting duplicates within the TTL window. ClickHouse's
//! `ReplacingMergeTree` dedups any rows that slip past this guard on merge.
//!
//! Only LLM spans whose `span.input` is a JSON array participate. Anything
//! else (non-array inputs, non-LLM spans) flows through unchanged.

use std::sync::Arc;

use serde_json::Value;
use uuid::Uuid;

use crate::{
    cache::{Cache, CacheTrait},
    ch::{ClickhouseTrait, llm_messages::CHLlmMessage, spans::CHSpan},
    db::{
        spans::{Span, SpanType},
        workspaces::WorkspaceDeployment,
    },
};

/// Redis TTL for the "seen this message hash" marker. Messages reappearing
/// within this window are assumed to already be in ClickHouse.
const SEEN_HASH_TTL_SECONDS: u64 = 3600;

/// Plan for how a single span's input will be stored. Constructed before any
/// Redis / ClickHouse IO so the processor can decide which messages are new
/// and need inserting, then apply the plan to the `CHSpan`.
struct SpanDedupPlan {
    span_index: usize,
    /// The ordered hashes for the span. Length matches the original input
    /// array length. `None` means this span's input is not a JSON array and
    /// should flow through unchanged.
    hashes: Option<Vec<[u8; 32]>>,
    /// Per-hash canonical JSON text for the messages in this span. Same
    /// length / order as `hashes`. Used to build `CHLlmMessage` rows for
    /// first-seen hashes.
    canonical_messages: Vec<String>,
}

/// Canonicalize a JSON value by sorting object keys recursively.
///
/// Two structurally identical messages differing only in key order will
/// produce the same bytes (and therefore the same hash) after
/// canonicalization. `serde_json` with `preserve_order` emits keys in
/// insertion order, which is not a useful hash input.
fn canonicalize(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            let mut out = serde_json::Map::new();
            for k in keys {
                out.insert(k.clone(), canonicalize(&map[k]));
            }
            Value::Object(out)
        }
        Value::Array(items) => Value::Array(items.iter().map(canonicalize).collect()),
        _ => value.clone(),
    }
}

/// Serialize a canonical JSON value to bytes for hashing.
fn canonical_bytes(value: &Value) -> anyhow::Result<Vec<u8>> {
    // `canonicalize` already sorted keys; serde_json with `preserve_order`
    // then emits in the canonical order. Propagate errors rather than
    // silently returning `Vec::new()` — an empty-byte fallback would hash
    // every failed message to the same BLAKE3 digest and collapse distinct
    // messages into a single empty row.
    serde_json::to_vec(value).map_err(|e| anyhow::anyhow!("canonical_bytes serialize: {e}"))
}

fn message_blake3(canonical: &[u8]) -> [u8; 32] {
    let digest = blake3::hash(canonical);
    *digest.as_bytes()
}

/// Redis key for "we've already written this message hash for this trace".
/// 66-byte binary key: `m:` prefix + project_id bytes + trace_id bytes + hash
/// bytes. Must include `trace_id` because the `llm_messages` table is keyed
/// by `(project_id, trace_id, message_hash)` — a project-only key would make
/// the cache report "seen" for a second trace and we'd skip the insert for
/// that trace, leaving the view unable to reconstruct `input`.
fn seen_key(project_id: Uuid, trace_id: Uuid, hash: &[u8; 32]) -> String {
    // Binary payload via Latin-1 bytes-to-chars: every byte is a valid char,
    // and `redis::ToRedisArgs` for `String` writes the UTF-8 encoding. The
    // round trip through UTF-8 inflates the key length but keeps us on the
    // existing String-keyed cache API. The key doesn't need to be readable
    // - only unique and stable.
    let mut s = String::with_capacity(2 + 16 + 16 + 32);
    s.push_str("m:");
    for b in project_id.as_bytes() {
        s.push(*b as char);
    }
    for b in trace_id.as_bytes() {
        s.push(*b as char);
    }
    for b in hash.iter() {
        s.push(*b as char);
    }
    s
}

/// Build one `SpanDedupPlan` per LLM span whose `input` parses as a JSON
/// array. Non-array inputs and non-LLM spans are filtered out so the
/// returned vec is sparse relative to `spans`.
///
/// Returns an error if any message fails to serialize or decode — silently
/// defaulting would collapse distinct messages into an empty-content row
/// with the BLAKE3 digest of `[]`, permanently corrupting `input`.
fn build_plans(spans: &[Span]) -> anyhow::Result<Vec<SpanDedupPlan>> {
    let mut plans = Vec::new();
    for (idx, span) in spans.iter().enumerate() {
        if span.span_type != SpanType::LLM {
            continue;
        }
        let Some(input) = span.input.as_ref() else {
            continue;
        };
        let Some(messages) = input.as_array() else {
            continue;
        };
        if messages.is_empty() {
            continue;
        }
        let mut hashes = Vec::with_capacity(messages.len());
        let mut canonical_messages = Vec::with_capacity(messages.len());
        for msg in messages {
            let canon = canonicalize(msg);
            let bytes = canonical_bytes(&canon)?;
            hashes.push(message_blake3(&bytes));
            let text = String::from_utf8(bytes).map_err(|e| {
                anyhow::anyhow!("canonical bytes are not valid UTF-8: {e}")
            })?;
            canonical_messages.push(text);
        }
        plans.push(SpanDedupPlan {
            span_index: idx,
            hashes: Some(hashes),
            canonical_messages,
        });
    }
    Ok(plans)
}

/// Apply dedup to the batch of spans.
///
/// For each LLM span whose `input` parses as a JSON array:
/// 1. Hash each message (BLAKE3-256 over canonical JSON).
/// 2. Consult Redis for each (project_id, hash): if not present, mark the
///    message as first-seen and set the TTL key.
/// 3. Insert first-seen messages into `llm_messages` (sync; must complete
///    before the span insert so the view can reconstruct `input`).
/// 4. Mutate the corresponding `CHSpan` to carry `input_message_hashes` and
///    clear `input`.
///
/// If the `llm_messages` insert fails we delete the Redis markers we set
/// (so future spans see them as unseen again) and return the error. The
/// caller retries the batch.
///
/// If Redis is unreachable the per-hash lookup / set fails gracefully: we
/// treat every hash as first-seen and still insert into `llm_messages`;
/// ReplacingMergeTree dedups on merge.
pub async fn dedup_llm_input_messages(
    spans: &[Span],
    ch_spans: &mut [CHSpan],
    cache: Arc<Cache>,
    ch: &impl ClickhouseTrait,
    config: Option<&WorkspaceDeployment>,
) -> anyhow::Result<()> {
    // CHSpans filter out non-recordable spans upstream, so `spans` and
    // `ch_spans` do NOT index the same way. Rebuild the mapping from
    // span_id -> ch_span index.
    let mut span_id_to_ch_idx: std::collections::HashMap<Uuid, usize> =
        std::collections::HashMap::with_capacity(ch_spans.len());
    for (i, ch_span) in ch_spans.iter().enumerate() {
        span_id_to_ch_idx.insert(ch_span.span_id, i);
    }

    let plans = build_plans(spans)?;
    if plans.is_empty() {
        return Ok(());
    }

    // Collect every first-seen (project_id, hash) across all plans so we
    // insert messages in a single batch.
    let mut new_messages: Vec<CHLlmMessage> = Vec::new();
    let mut redis_keys_set: Vec<String> = Vec::new();

    for plan in &plans {
        let span = &spans[plan.span_index];
        let hashes = plan.hashes.as_ref().unwrap();
        for (hash, canonical) in hashes.iter().zip(plan.canonical_messages.iter()) {
            let key = seen_key(span.project_id, span.trace_id, hash);
            let already_seen = cache.exists(&key).await.unwrap_or(false);
            if already_seen {
                continue;
            }
            // Mark as seen with TTL; if this fails (e.g. Redis down), we
            // still insert the message — ReplacingMergeTree handles the
            // duplicate on merge.
            let _ = cache
                .insert_with_ttl(&key, "1", SEEN_HASH_TTL_SECONDS)
                .await;
            redis_keys_set.push(key);

            new_messages.push(CHLlmMessage {
                project_id: span.project_id,
                trace_id: span.trace_id,
                message_hash: *hash,
                content: canonical.clone(),
            });
        }
    }

    // Messages MUST be inserted before the span row insert (caller does the
    // span insert after this function returns). If this fails, roll back the
    // Redis markers so the next attempt treats these messages as unseen and
    // re-inserts them.
    if !new_messages.is_empty() {
        if let Err(e) = ch.insert_batch(&new_messages, config).await {
            for key in &redis_keys_set {
                let _ = cache.remove(key).await;
            }
            return Err(anyhow::anyhow!(
                "Failed to insert {} llm_messages: {:?}",
                new_messages.len(),
                e
            ));
        }
    }

    // Mutate the corresponding CHSpan rows: populate the hashes and clear
    // the raw input (the view will reconstruct it from llm_messages).
    for plan in plans {
        let span = &spans[plan.span_index];
        let Some(ch_idx) = span_id_to_ch_idx.get(&span.span_id) else {
            continue;
        };
        let Some(hashes) = plan.hashes else { continue };
        let ch_span = &mut ch_spans[*ch_idx];
        ch_span.input_message_hashes = hashes;
        ch_span.input.clear();
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn canonicalize_sorts_keys() {
        let a = json!({"b": 1, "a": 2});
        let b = json!({"a": 2, "b": 1});
        assert_eq!(
            canonical_bytes(&canonicalize(&a)).unwrap(),
            canonical_bytes(&canonicalize(&b)).unwrap(),
        );
    }

    #[test]
    fn canonicalize_recurses_into_arrays() {
        let a = json!([{"b": 1, "a": 2}, {"d": 3, "c": 4}]);
        let b = json!([{"a": 2, "b": 1}, {"c": 4, "d": 3}]);
        assert_eq!(
            canonical_bytes(&canonicalize(&a)).unwrap(),
            canonical_bytes(&canonicalize(&b)).unwrap(),
        );
    }

    #[test]
    fn same_content_same_hash() {
        let a = canonical_bytes(&canonicalize(&json!({"role": "user", "content": "hi"}))).unwrap();
        let b = canonical_bytes(&canonicalize(&json!({"content": "hi", "role": "user"}))).unwrap();
        assert_eq!(message_blake3(&a), message_blake3(&b));
    }

    #[test]
    fn different_content_different_hash() {
        let a = canonical_bytes(&canonicalize(&json!({"role": "user", "content": "hi"}))).unwrap();
        let b =
            canonical_bytes(&canonicalize(&json!({"role": "user", "content": "hello"}))).unwrap();
        assert_ne!(message_blake3(&a), message_blake3(&b));
    }

    #[test]
    fn seen_key_is_deterministic_and_has_fixed_prefix() {
        let pid = Uuid::from_u128(0x0123_4567_89ab_cdef_0123_4567_89ab_cdef);
        let tid = Uuid::from_u128(0xfedc_ba98_7654_3210_fedc_ba98_7654_3210);
        let hash = [7u8; 32];
        let k1 = seen_key(pid, tid, &hash);
        let k2 = seen_key(pid, tid, &hash);
        assert_eq!(k1, k2);
        assert!(k1.starts_with("m:"));
    }

    #[test]
    fn seen_key_differs_per_trace() {
        let pid = Uuid::from_u128(0x0123_4567_89ab_cdef_0123_4567_89ab_cdef);
        let tid1 = Uuid::from_u128(0x1111_1111_1111_1111_1111_1111_1111_1111);
        let tid2 = Uuid::from_u128(0x2222_2222_2222_2222_2222_2222_2222_2222);
        let hash = [7u8; 32];
        assert_ne!(seen_key(pid, tid1, &hash), seen_key(pid, tid2, &hash));
    }
}
