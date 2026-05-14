//! Structural deduplication for LLM span input message payloads (LAM-1578).
//! Replaces each span's `input` with BLAKE3 hashes; unique messages land in
//! `llm_messages` and the `spans_v0` view reconstructs the JSON array on read.
//! Redis is a best-effort "seen recently in this trace" filter; the key
//! includes `trace_id` because `llm_messages` is trace-scoped.

use std::sync::Arc;

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

/// `span_hashes[i]` / `span_content_bytes[i]` align with the span order passed
/// in. `span_content_bytes[i]` is the bytes of `llm_messages.content` span `i`
/// caused to be newly inserted — shared messages contribute 0 (billed once).
pub struct DedupBatch {
    pub messages: Vec<CHLlmMessage>,
    pub span_hashes: Vec<Vec<[u8; 32]>>,
    pub span_content_bytes: Vec<usize>,
}

/// Hash each LLM span's input messages with BLAKE3 and emit unique rows per
/// `(project_id, trace_id, hash)`. Non-LLM spans and non-array inputs pass
/// through with empty hashes. Redis misses/errors fall through to insert.
pub async fn build_dedup_batch(spans: &[&Span], cache: Arc<Cache>) -> DedupBatch {
    let mut messages: Vec<CHLlmMessage> = Vec::new();
    let mut span_hashes: Vec<Vec<[u8; 32]>> = Vec::with_capacity(spans.len());
    let mut span_content_bytes: Vec<usize> = Vec::with_capacity(spans.len());
    // Key must match `llm_messages` ORDER BY — batches can mix projects.
    let mut emitted_in_batch: std::collections::HashSet<(Uuid, Uuid, [u8; 32])> =
        std::collections::HashSet::new();

    for span in spans {
        if !span.is_llm_span() {
            span_hashes.push(Vec::new());
            span_content_bytes.push(0);
            continue;
        }
        let Some(Value::Array(items)) = span.input.as_ref() else {
            span_hashes.push(Vec::new());
            span_content_bytes.push(0);
            continue;
        };

        let mut hashes: Vec<[u8; 32]> = Vec::with_capacity(items.len());
        let mut content_bytes_for_span: usize = 0;
        for item in items {
            let canonical = canonical_json(item);
            let hash: [u8; 32] = *blake3::hash(canonical.as_bytes()).as_bytes();
            hashes.push(hash);

            if !emitted_in_batch.insert((span.project_id, span.trace_id, hash)) {
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
            content_bytes_for_span += content.len();
            messages.push(CHLlmMessage {
                project_id: span.project_id,
                trace_id: span.trace_id,
                message_hash: hash,
                content,
            });
        }
        span_hashes.push(hashes);
        span_content_bytes.push(content_bytes_for_span);
    }

    DedupBatch {
        messages,
        span_hashes,
        span_content_bytes,
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
}
