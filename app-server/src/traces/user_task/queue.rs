//! Queue plumbing for ingestion-time user-task extraction (LAM-1880).
//!
//! The producer enqueues a message here when a candidate LLM span's
//! regex cache misses; the `InputExtraction` worker generates the regex
//! via LLM, applies it, and patches the trace metadata.

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::UserTaskLockState;
use crate::mq::{MessageQueue, MessageQueueTrait, utils::mq_max_payload};

pub const INPUT_EXTRACTION_QUEUE: &str = "input_extraction_queue";
pub const INPUT_EXTRACTION_EXCHANGE: &str = "input_extraction_exchange";
pub const INPUT_EXTRACTION_ROUTING_KEY: &str = "input_extraction_routing_key";

#[derive(Debug, Serialize, Deserialize)]
pub struct InputExtractionMessage {
    pub trace_id: Uuid,
    pub project_id: Uuid,
    /// System-prompt hash of the span, part of the regex cache key.
    #[serde(default)]
    pub prompt_hash: Option<String>,
    /// Signposted last-turn user text, prepared once at the producer so
    /// the consumer applies the regex to byte-identical input.
    pub signposted_text: String,
    /// Order-insensitive fingerprint of the user parts, part of the
    /// regex cache key.
    pub fingerprint: String,
    /// Winner-lock state at enqueue time; the consumer drops the
    /// message when the current lock no longer matches (a later batch
    /// superseded this candidate).
    #[serde(default)]
    pub winner_state: Option<UserTaskLockState>,
}

/// Returns `Ok(true)` when the message was enqueued, `Ok(false)` when it
/// was dropped for exceeding the MQ payload limit — callers must not
/// treat a drop as a successful hand-off (e.g. the per-trace winner lock
/// is only written after a real enqueue).
pub async fn push_to_input_extraction_queue(
    message: InputExtractionMessage,
    queue: Arc<MessageQueue>,
) -> anyhow::Result<bool> {
    let serialized = serde_json::to_vec(&message)?;
    if serialized.len() >= mq_max_payload() {
        log::warn!(
            "Input extraction message exceeds MQ payload limit, dropping. \
             trace_id: [{}], project_id: [{}], payload size: [{}]",
            message.trace_id,
            message.project_id,
            serialized.len()
        );
        return Ok(false);
    }

    queue
        .publish(
            &serialized,
            INPUT_EXTRACTION_EXCHANGE,
            INPUT_EXTRACTION_ROUTING_KEY,
            None,
        )
        .await?;

    Ok(true)
}
