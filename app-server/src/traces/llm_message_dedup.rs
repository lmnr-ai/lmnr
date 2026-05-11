//! Content-addressed deduplication of LLM span input messages.
//!
//! Agent traces are highly redundant: step k's input is usually step k-1's
//! input plus one or two new messages. Storing the full message array on
//! every span grows quadratically. This module hashes each input message and
//! stores it once per trace in `llm_messages`; the span row keeps only the
//! ordered array of hashes.
//!
//! Dedup is trace-scoped (not project-scoped) so two traces with identical
//! content produce distinct rows. Redis is used as a best-effort "seen"
//! cache to avoid re-inserting the same message twice within the TTL; when
//! Redis is unreachable the caller falls back to inserting everything and
//! lets ReplacingMergeTree collapse duplicates on merge.
//!
//! Keys are `m:{project_id_hex}{trace_id_hex}{hash_hex}` (130 chars total).
//! `trace_id` is part of the key because `llm_messages` is ordered by
//! `(project_id, trace_id, message_hash)` — omitting it would let a hash
//! seen in one trace suppress the insert for a different trace, leaving
//! that trace's span rows pointing at missing `llm_messages` entries.

use std::sync::{
    Arc,
    atomic::{AtomicU64, Ordering},
};

use serde_json::Value;
use tokio::time::Instant;
use uuid::Uuid;

use crate::{
    cache::{Cache, CacheTrait},
    ch::llm_messages::CHLlmMessage,
    db::spans::{Span, SpanType},
};

/// Redis dedup key TTL. Short enough that stale entries expire before a
/// deployment rollback matters, long enough that a multi-step agent run
/// (minutes-to-hours) stays deduplicated.
const DEDUP_TTL_SECONDS: u64 = 3600;

/// A trip in the circuit breaker pauses Redis dedup for this duration; during
/// that time the pipeline inserts every message and lets ReplacingMergeTree
/// dedup on merge. We still emit correct (hashed, referenced) rows — we just
/// don't skip any as "already seen".
const CIRCUIT_BREAKER_COOLDOWN_SECS: u64 = 30;

/// A single LLM message keyed by its BLAKE3-256 hash.
#[derive(Debug, Clone)]
pub struct HashedMessage {
    pub project_id: Uuid,
    pub trace_id: Uuid,
    pub hash: [u8; 32],
    pub content: String,
}

/// Cross-invocation "Redis is sick" flag. When tripped, `not_seen_before` is
/// bypassed and every message falls back to raw insert. Stored as the UNIX
/// timestamp (seconds) at which the breaker expires; `0` means healthy.
static REDIS_CIRCUIT_BREAKER_UNTIL: AtomicU64 = AtomicU64::new(0);

fn redis_breaker_open() -> bool {
    let until = REDIS_CIRCUIT_BREAKER_UNTIL.load(Ordering::Relaxed);
    if until == 0 {
        return false;
    }
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    if now >= until {
        // Gate the probe with a CAS so only one concurrent caller wins the
        // reset and attempts Redis; everyone else still sees the breaker
        // open for this call. Without this, N concurrent tasks observing
        // `now >= until` would all unconditionally store 0 and all probe
        // Redis at once, re-flooding a partially-recovered instance.
        REDIS_CIRCUIT_BREAKER_UNTIL
            .compare_exchange(until, 0, Ordering::Relaxed, Ordering::Relaxed)
            .is_err()
    } else {
        true
    }
}

fn trip_redis_breaker() {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    REDIS_CIRCUIT_BREAKER_UNTIL.store(now + CIRCUIT_BREAKER_COOLDOWN_SECS, Ordering::Relaxed);
    log::warn!(
        "llm_messages dedup Redis breaker tripped; bypassing for {}s",
        CIRCUIT_BREAKER_COOLDOWN_SECS
    );
}

/// Serialise `value` with recursively sorted object keys so the same message
/// content always hashes to the same digest regardless of key ordering.
///
/// All bytes written by `write_canonical` are ASCII punctuation or valid
/// UTF-8 copied from the input `Value`'s existing `String` allocations, so
/// decoding should never fail. Returning `Err` rather than panicking lets
/// the caller skip dedup for a single malformed span cleanly instead of
/// crashing the batch processor; returning an empty string instead would
/// silently collapse distinct messages to the same hash and corrupt the
/// deduplicated store.
fn canonical_json(value: &Value) -> Result<String, std::string::FromUtf8Error> {
    let mut buf = Vec::with_capacity(64);
    write_canonical(&mut buf, value);
    String::from_utf8(buf)
}

fn write_canonical(buf: &mut Vec<u8>, value: &Value) {
    match value {
        Value::Null => buf.extend_from_slice(b"null"),
        Value::Bool(b) => buf.extend_from_slice(if *b { b"true" } else { b"false" }),
        Value::Number(n) => buf.extend_from_slice(n.to_string().as_bytes()),
        Value::String(s) => write_json_string(buf, s),
        Value::Array(items) => {
            buf.push(b'[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    buf.push(b',');
                }
                write_canonical(buf, item);
            }
            buf.push(b']');
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort_unstable();
            buf.push(b'{');
            for (i, key) in keys.iter().enumerate() {
                if i > 0 {
                    buf.push(b',');
                }
                write_json_string(buf, key);
                buf.push(b':');
                write_canonical(buf, &map[*key]);
            }
            buf.push(b'}');
        }
    }
}

fn write_json_string(buf: &mut Vec<u8>, s: &str) {
    // Reuse serde_json's own escaping so we match the wire format byte-for-byte.
    match serde_json::to_vec(s) {
        Ok(escaped) => buf.extend_from_slice(&escaped),
        Err(_) => buf.extend_from_slice(b"\"\""),
    }
}

/// Extract hashed input messages from the span's parsed input and produce the
/// ordered hash array for the span row. Returns `None` when the input isn't a
/// JSON array or the array is empty (the span keeps its raw `input` string
/// unchanged — otherwise the caller would blank out `input` for a span with
/// no hashes, and `spans_v0`'s fallback would show `""` instead of `"[]"`).
pub fn hash_span_input(span: &Span) -> Option<(Vec<HashedMessage>, Vec<[u8; 32]>)> {
    if span.span_type != SpanType::LLM {
        return None;
    }
    let input = span.input.as_ref()?;
    let messages = input.as_array()?;
    if messages.is_empty() {
        return None;
    }

    let mut hashed = Vec::with_capacity(messages.len());
    let mut order = Vec::with_capacity(messages.len());
    for message in messages {
        let canonical = match canonical_json(message) {
            Ok(s) => s,
            Err(e) => {
                // Unreachable today, but don't crash the batch if
                // write_canonical ever regresses: skip dedup for this span
                // and let the caller keep its raw `input` intact.
                log::error!(
                    "canonical_json produced non-UTF-8 bytes for span {} in trace {}: {:?}",
                    span.span_id,
                    span.trace_id,
                    e
                );
                return None;
            }
        };
        let hash_bytes: [u8; 32] = blake3::hash(canonical.as_bytes()).into();
        order.push(hash_bytes);
        hashed.push(HashedMessage {
            project_id: span.project_id,
            trace_id: span.trace_id,
            hash: hash_bytes,
            content: canonical,
        });
    }
    Some((hashed, order))
}

fn dedup_key(project_id: Uuid, trace_id: Uuid, hash: &[u8; 32]) -> String {
    use std::fmt::Write;
    // 2 prefix + 32 hex (project uuid) + 32 hex (trace uuid) + 64 hex (hash)
    let mut key = String::with_capacity(2 + 32 + 32 + 64);
    key.push_str("m:");
    // Bytes are encoded as hex rather than raw to stay compatible with
    // RedisCache's string-key APIs (`try_acquire_lock` etc. accept &str).
    for b in project_id.as_bytes() {
        let _ = write!(key, "{:02x}", b);
    }
    for b in trace_id.as_bytes() {
        let _ = write!(key, "{:02x}", b);
    }
    for b in hash {
        let _ = write!(key, "{:02x}", b);
    }
    key
}

/// Filter `messages` down to the ones not already seen in Redis for this
/// project+trace+hash. Newly-seen messages are marked in Redis with a TTL so
/// subsequent batches can skip them. On any Redis error this trips the
/// circuit breaker and returns the full list (safe fallback — duplicates are
/// collapsed by ReplacingMergeTree on the server side).
pub async fn filter_unseen(
    messages: Vec<HashedMessage>,
    cache: Arc<Cache>,
) -> Vec<HashedMessage> {
    if messages.is_empty() || redis_breaker_open() {
        return messages;
    }

    let start = Instant::now();
    let mut unseen = Vec::with_capacity(messages.len());
    let mut iter = messages.into_iter();
    while let Some(msg) = iter.next() {
        let key = dedup_key(msg.project_id, msg.trace_id, &msg.hash);
        match cache.try_acquire_lock(&key, DEDUP_TTL_SECONDS).await {
            Ok(true) => unseen.push(msg),
            Ok(false) => {
                // Already seen — skip insert.
            }
            Err(e) => {
                log::warn!("llm_messages Redis SETNX failed, bypassing dedup: {:?}", e);
                trip_redis_breaker();
                unseen.push(msg);
                unseen.extend(iter);
                return unseen;
            }
        }
    }
    log::trace!(
        "llm_messages dedup checked {} messages in {:?}",
        unseen.len(),
        start.elapsed()
    );
    unseen
}

/// Called when the `llm_messages` insert fails after keys were marked "seen"
/// in Redis. Deletes the seen-markers for the affected hashes so the next
/// retry actually re-inserts them.
pub async fn release_seen_markers(messages: &[CHLlmMessage], cache: Arc<Cache>) {
    for msg in messages {
        let key = dedup_key(msg.project_id, msg.trace_id, &msg.message_hash);
        if let Err(e) = cache.release_lock(&key).await {
            log::warn!(
                "llm_messages failed to release Redis seen-marker on insert failure: {:?}",
                e
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn canonical_json_sorts_keys_recursively() {
        let a = json!({"b": 1, "a": {"d": 2, "c": 3}});
        let b = json!({"a": {"c": 3, "d": 2}, "b": 1});
        assert_eq!(canonical_json(&a).unwrap(), canonical_json(&b).unwrap());
        assert_eq!(canonical_json(&a).unwrap(), r#"{"a":{"c":3,"d":2},"b":1}"#);
    }

    #[test]
    fn canonical_json_handles_arrays_and_primitives() {
        let v = json!({"xs": [1, "two", null, {"z": 9, "y": 8}]});
        assert_eq!(
            canonical_json(&v).unwrap(),
            r#"{"xs":[1,"two",null,{"y":8,"z":9}]}"#
        );
    }

    #[test]
    fn hash_is_stable_across_key_ordering() {
        let a = json!({"role": "user", "content": "hello"});
        let b = json!({"content": "hello", "role": "user"});
        let ha: [u8; 32] = blake3::hash(canonical_json(&a).unwrap().as_bytes()).into();
        let hb: [u8; 32] = blake3::hash(canonical_json(&b).unwrap().as_bytes()).into();
        assert_eq!(ha, hb);
    }

    #[test]
    fn dedup_key_is_hex_encoded_prefixed() {
        let pid = Uuid::parse_str("00112233-4455-6677-8899-aabbccddeeff").unwrap();
        let tid = Uuid::parse_str("ffeeddcc-bbaa-9988-7766-554433221100").unwrap();
        let hash = [0u8; 32];
        let key = dedup_key(pid, tid, &hash);
        assert!(key.starts_with("m:"));
        // 2 prefix + 32 hex (project uuid) + 32 hex (trace uuid) + 64 hex (hash)
        assert_eq!(key.len(), 2 + 32 + 32 + 64);
    }

    #[test]
    fn dedup_key_differs_across_traces_same_project_and_hash() {
        let pid = Uuid::parse_str("00112233-4455-6677-8899-aabbccddeeff").unwrap();
        let tid_a = Uuid::parse_str("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa").unwrap();
        let tid_b = Uuid::parse_str("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb").unwrap();
        let hash = [7u8; 32];
        assert_ne!(dedup_key(pid, tid_a, &hash), dedup_key(pid, tid_b, &hash));
    }

    #[test]
    fn hash_span_input_returns_none_for_empty_array() {
        // Empty array must not be treated as "hashed" — otherwise the caller
        // would clear `input` to "" and spans_v0's fallback would render ""
        // instead of the original "[]".
        use crate::traces::spans::SpanAttributes;
        use chrono::Utc;
        use std::collections::HashMap;

        let span = Span {
            span_id: Uuid::new_v4(),
            project_id: Uuid::new_v4(),
            trace_id: Uuid::new_v4(),
            parent_span_id: None,
            name: "test".to_string(),
            attributes: SpanAttributes::new(HashMap::new()),
            start_time: Utc::now(),
            end_time: Utc::now(),
            span_type: SpanType::LLM,
            input: Some(json!([])),
            output: None,
            events: vec![],
            status: None,
            tags: None,
            input_url: None,
            output_url: None,
            size_bytes: 0,
        };
        assert!(hash_span_input(&span).is_none());
    }
}
