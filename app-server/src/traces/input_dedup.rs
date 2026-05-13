//! Structural deduplication for LLM span input message payloads (LAM-1578).
//!
//! Agent traces step-over-step re-send the full message history, so step k's
//! input contains roughly k(k+1)/2 messages across the trace when only k are
//! unique. This module replaces each LLM span's `input` with an ordered array
//! of BLAKE3 hashes and emits one row per unique message into `llm_messages`,
//! trace-scoped. The `spans_v0` view LEFT-JOINs the table back on read to
//! reconstruct the original JSON array transparently for the frontend.
//!
//! Redis is used as a best-effort "seen recently in this trace" filter so
//! we don't re-INSERT unchanged messages on every step. The key MUST include
//! `trace_id` because `llm_messages` is trace-scoped — a message seen in
//! trace A cannot be assumed queryable for trace B even in the same project,
//! so without the trace in the key we'd skip inserts for other traces whose
//! spans would then reconstruct to empty. When Redis is unavailable we fall
//! back to always inserting and rely on the ReplacingMergeTree engine to
//! dedup on merge.

use std::sync::Arc;

use serde_json::Value;
use uuid::Uuid;

use crate::cache::{Cache, CacheTrait};
use crate::ch::llm_messages::CHLlmMessage;
use crate::db::spans::Span;

/// Keep Redis dedup markers for one hour. Longer TTLs just mean fewer
/// re-inserts on the hot path at the cost of Redis memory; shorter TTLs are
/// safe because the ReplacingMergeTree engine collapses duplicates anyway.
const MESSAGE_SEEN_TTL_SECONDS: u64 = 3600;

fn message_seen_key(project_id: Uuid, trace_id: Uuid, hash: &[u8; 32]) -> String {
    format!(
        "m:{}:{}:{}",
        project_id.simple(),
        trace_id.simple(),
        hex::encode(hash)
    )
}

/// Canonical JSON with sorted object keys so semantically identical messages
/// hash to the same value regardless of ingest-time field order.
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

/// Bundle of messages to insert into `llm_messages` and the hash-array column
/// values to stamp onto each span. Order in `span_hashes` matches the order
/// of spans passed in.
pub struct DedupBatch {
    pub messages: Vec<CHLlmMessage>,
    pub span_hashes: Vec<Vec<[u8; 32]>>,
}

/// Parse each LLM span's input as a JSON array, hash its messages with
/// BLAKE3-256, and build the (messages, per-span hash arrays) batch.
/// Non-LLM spans and LLM spans whose input is not a JSON array produce an
/// empty hash array, leaving their `input` unchanged downstream.
///
/// Redis is consulted to drop messages seen recently in the same trace.
/// On Redis error we degrade to always emitting the row, letting the
/// ReplacingMergeTree dedup on merge.
pub async fn build_dedup_batch(spans: &[&Span], cache: Arc<Cache>) -> DedupBatch {
    let mut messages: Vec<CHLlmMessage> = Vec::new();
    let mut span_hashes: Vec<Vec<[u8; 32]>> = Vec::with_capacity(spans.len());
    // Dedup within a single batch so two spans in the same trace referencing
    // the same new message produce one CHLlmMessage, not two.
    let mut emitted_in_batch: std::collections::HashSet<(Uuid, [u8; 32])> =
        std::collections::HashSet::new();

    for span in spans {
        if !span.is_llm_span() {
            span_hashes.push(Vec::new());
            continue;
        }
        let Some(Value::Array(items)) = span.input.as_ref() else {
            span_hashes.push(Vec::new());
            continue;
        };

        let mut hashes: Vec<[u8; 32]> = Vec::with_capacity(items.len());
        for item in items {
            let canonical = canonical_json(item);
            let hash: [u8; 32] = *blake3::hash(canonical.as_bytes()).as_bytes();
            hashes.push(hash);

            if !emitted_in_batch.insert((span.trace_id, hash)) {
                continue;
            }

            let key = message_seen_key(span.project_id, span.trace_id, &hash);
            // On Redis errors / misses we emit the row. exists() returning
            // Ok(true) is the only path that skips the insert.
            let already_seen = cache.exists(&key).await.unwrap_or(false);
            if already_seen {
                continue;
            }

            messages.push(CHLlmMessage {
                project_id: span.project_id,
                trace_id: span.trace_id,
                message_hash: hash,
                content: canonical,
            });
        }
        span_hashes.push(hashes);
    }

    DedupBatch {
        messages,
        span_hashes,
    }
}

/// Mark every message we just inserted as seen in Redis with a 1h TTL. Called
/// only after the llm_messages insert succeeded so a failed insert can't
/// leave a "seen" marker blocking future re-inserts.
pub async fn mark_seen(keys: &[(Uuid, Uuid, [u8; 32])], cache: Arc<Cache>) {
    for (project_id, trace_id, hash) in keys {
        let key = message_seen_key(*project_id, *trace_id, hash);
        let _ = cache
            .insert_with_ttl(&key, "1", MESSAGE_SEEN_TTL_SECONDS)
            .await;
    }
}

/// Remove Redis markers for messages whose ClickHouse insert failed so the
/// next attempt re-emits them.
pub async fn unmark_seen(keys: &[(Uuid, Uuid, [u8; 32])], cache: Arc<Cache>) {
    for (project_id, trace_id, hash) in keys {
        let key = message_seen_key(*project_id, *trace_id, hash);
        let _ = cache.remove(&key).await;
    }
}
