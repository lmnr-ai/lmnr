//! Builds checkpoint messages from the spans-consumer batch and publishes them
//! to the checkpoints queue.
//!
//! Emission runs on the spans consumer (after spans are durably recorded)
//! rather than on the ingest producer: a checkpoint span is a conversation
//! start (exactly two input messages), so its system message is trace-new and
//! its content rides the wire in `span_trace_new_contents` even when storage-
//! deduped. Dedup is the consumer's job — it strips dynamic content from the
//! system prompt and keys on the resulting `version_hash` — so the producer
//! just publishes every qualifying conversation-start span.

use std::sync::Arc;

use serde_json::Value;

use super::{CHECKPOINTS_EXCHANGE, CHECKPOINTS_ROUTING_KEY, consumer::CheckpointsQueueMessage};
use crate::{
    db::spans::Span,
    mq::{MessageQueue, MessageQueueTrait},
    traces::{input_dedup::DedupBatch, prompt_hash::extract_system_message, tool_dedup::ToolDedup},
};

/// Number of input messages a span must carry to qualify as a checkpoint:
/// a system prompt + the first turn.
const CHECKPOINT_INPUT_MESSAGE_COUNT: usize = 2;

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
    queue: Arc<MessageQueue>,
) {
    let mut checkpoints: Vec<CheckpointsQueueMessage> = Vec::new();

    for (dedup_idx, &span_idx) in recordable_indices.iter().enumerate() {
        let span = &spans[span_idx];
        if !span.is_llm_span() {
            continue;
        }
        // Never checkpoint our own tracing spans.
        if span.attributes.is_checkpoint_internal() {
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

        checkpoints.push(CheckpointsQueueMessage {
            project_id: span.project_id,
            system_prompt,
            tool_definitions_hash: tool_def_hash,
            model,
            span_ids_path: span.attributes.ids_path().unwrap_or_default(),
        });
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

    if let Err(e) = queue
        .publish(&payload, CHECKPOINTS_EXCHANGE, CHECKPOINTS_ROUTING_KEY, None)
        .await
    {
        log::error!("[CHECKPOINTS] Failed to publish checkpoint messages: {e:?}");
    }
}
