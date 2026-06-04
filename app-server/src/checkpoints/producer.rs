//! Builds checkpoint messages from the spans-consumer batch and publishes them
//! to the checkpoints queue.
//!
//! Emission runs on the spans consumer (after spans are durably recorded)
//! rather than on the ingest producer: a checkpoint span is a conversation
//! start (exactly two input messages), so its system message is trace-new and
//! its content rides the wire in `span_trace_new_contents` even when storage-
//! deduped. A cheap per-combo Redis check keeps repeated
//! `(system prompt, tool definitions, model)` combinations from flooding the
//! queue — only genuinely new combinations are published.

use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;

use serde_json::Value;
use uuid::Uuid;

use super::{CHECKPOINTS_EXCHANGE, CHECKPOINTS_ROUTING_KEY, consumer::CheckpointsQueueMessage};
use crate::{
    cache::{Cache, CacheTrait},
    db::spans::Span,
    mq::{MessageQueue, MessageQueueTrait},
    traces::{input_dedup::DedupBatch, prompt_hash::extract_system_message, tool_dedup::ToolDedup},
};

/// Number of input messages a span must carry to qualify as a checkpoint:
/// a system prompt + the first turn.
const CHECKPOINT_INPUT_MESSAGE_COUNT: usize = 2;

/// TTL for the per-combo dedup key — long enough to suppress repeats within a
/// reasonable window, short enough that combos re-confirm periodically.
const COMBO_SEEN_TTL_SECONDS: u64 = 24 * 3600;

/// Upper bound on the best-effort publish so a slow broker can't stall the
/// spans consumer.
const PUBLISH_TIMEOUT: Duration = Duration::from_secs(2);

fn combo_key(project_id: Uuid, system_prompt: &str, tool_def_hash: &str, model: &str) -> String {
    let combo = format!("{system_prompt}|{tool_def_hash}|{model}");
    let hash = blake3::hash(combo.as_bytes());
    format!("ckpt:{}:{}", project_id.simple(), hash.to_hex())
}

/// Build and publish checkpoint messages for the qualifying LLM spans in a
/// processed batch. Best-effort: any failure is logged and never propagated.
///
/// `input_batch` is keyed by `dedup_idx` (position within `recordable_indices`)
/// while `tool_dedups` is keyed by `span_idx` (position within `spans`) — same
/// indexing the CHSpan build uses.
pub async fn publish_checkpoints_for_batch(
    spans: &[Span],
    recordable_indices: &[usize],
    input_batch: &DedupBatch,
    tool_dedups: &[Option<ToolDedup>],
    cache: Arc<Cache>,
    queue: Arc<MessageQueue>,
) {
    let mut checkpoints: Vec<CheckpointsQueueMessage> = Vec::new();
    let mut combo_keys: Vec<String> = Vec::new();
    // Collapse duplicate combos appearing twice within the same batch — the
    // Redis key isn't stamped until after publish, so the per-combo `exists`
    // check alone can't catch in-batch repeats.
    let mut seen_in_batch: HashSet<String> = HashSet::new();

    for (dedup_idx, &span_idx) in recordable_indices.iter().enumerate() {
        let span = &spans[span_idx];
        if !span.is_llm_span() {
            continue;
        }

        // Authoritative input-message count = number of dedup hashes. Non-array
        // / non-dedup'd input has no hashes → not a checkpoint candidate.
        let num_messages = input_batch
            .span_hashes
            .get(dedup_idx)
            .map(|h| h.len())
            .unwrap_or(0);
        if num_messages != CHECKPOINT_INPUT_MESSAGE_COUNT {
            continue;
        }

        // The conversation-start system message is trace-new, so its JSON is in
        // `span_trace_new_contents`. Rebuild the (partial) message array and
        // pull the system prompt out of it.
        let Some(contents) = input_batch.span_trace_new_contents.get(dedup_idx) else {
            continue;
        };
        let messages: Vec<Value> = contents
            .iter()
            .filter_map(|c| serde_json::from_str::<Value>(c).ok())
            .collect();
        let Some((system_prompt, _)) = extract_system_message(&Value::Array(messages)) else {
            continue;
        };

        let tool_def_hash = tool_dedups
            .get(span_idx)
            .and_then(|d| d.as_ref())
            .map(|t| hex::encode(t.hash))
            .unwrap_or_default();
        let model = span.attributes.request_model().unwrap_or_default();

        // Cheap dedup: skip combos seen recently (or already queued in this
        // batch). Best-effort — a Redis miss/error just means we publish; the
        // downstream consumer is idempotent on the combination.
        let key = combo_key(span.project_id, &system_prompt, &tool_def_hash, &model);
        if !seen_in_batch.insert(key.clone()) {
            continue;
        }
        if cache.exists(&key).await.unwrap_or(false) {
            continue;
        }

        checkpoints.push(CheckpointsQueueMessage {
            project_id: span.project_id,
            system_prompt,
            tool_definitions_hash: tool_def_hash,
            model,
            span_ids_path: span.attributes.ids_path().unwrap_or_default(),
        });
        combo_keys.push(key);
    }

    if checkpoints.is_empty() {
        return;
    }

    let payload = match serde_json::to_vec(&checkpoints) {
        Ok(p) => p,
        Err(e) => {
            log::error!("[CHECKPOINTS] Failed to serialize checkpoint messages: {e:?}");
            return;
        }
    };

    match tokio::time::timeout(
        PUBLISH_TIMEOUT,
        queue.publish(
            &payload,
            CHECKPOINTS_EXCHANGE,
            CHECKPOINTS_ROUTING_KEY,
            None,
        ),
    )
    .await
    {
        Ok(Ok(())) => {
            // Stamp combo keys only after a successful publish, so a failed
            // publish doesn't suppress a later retry of the same combination.
            for key in &combo_keys {
                let _ = cache.insert_with_ttl(key, "1", COMBO_SEEN_TTL_SECONDS).await;
            }
        }
        Ok(Err(e)) => {
            log::error!("[CHECKPOINTS] Failed to publish checkpoint messages: {e:?}")
        }
        Err(_) => log::error!("[CHECKPOINTS] Publishing checkpoints timed out"),
    }
}
