//! Queue plumbing for ingestion-time user-task extraction (LAM-1880).
//!
//! The producer enqueues a message here when a candidate LLM span's
//! regex cache misses; the `InputExtraction` worker generates the regex
//! via LLM, applies it, and patches the trace metadata.

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::lock::WinnerState;
use crate::mq::{MessageQueue, MessageQueueTrait, utils::mq_max_payload};

pub const INPUT_EXTRACTION_QUEUE: &str = "input_extraction_queue";
pub const INPUT_EXTRACTION_EXCHANGE: &str = "input_extraction_exchange";
pub const INPUT_EXTRACTION_ROUTING_KEY: &str = "input_extraction_routing_key";

#[derive(Debug, Serialize, Deserialize)]
pub struct InputExtractionMessage {
    pub trace_id: Uuid,
    pub project_id: Uuid,
    /// The winning span. Lets the worker resolve the prompt's version from
    /// ClickHouse when the memo has expired.
    #[serde(default)]
    pub span_id: Option<Uuid>,
    /// First-sentence hash of the span's system prompt, a key component of both
    /// regex cachings. `None` for LLM spans with no system message.
    #[serde(default)]
    pub prompt_hash: Option<String>,
    /// Byte-identity hash of the system prompt — the worker's memo lookup key
    /// when the producer couldn't resolve a version inline.
    #[serde(default)]
    pub full_prompt_hash: Option<String>,
    /// Version resolved inline by the producer. `None` means the worker re-reads
    /// (memo, then ClickHouse) before deciding between a cached regex and a
    /// direct extraction.
    #[serde(default)]
    pub version_hash: Option<String>,
    /// Whether the last turn follows assistant history — a key component of the
    /// version-keyed cache.
    #[serde(default)]
    pub has_history: bool,
    /// Signposted last-turn user text, prepared once at the producer so
    /// the consumer applies the regex to byte-identical input.
    pub signposted_text: String,
    /// Order-insensitive fingerprint of the user parts, part of the
    /// regex cache key.
    pub fingerprint: String,
    /// Winning-candidate snapshot at enqueue time; the consumer drops the
    /// message when the current lock's published winner strictly beats it
    /// (a later batch superseded this candidate).
    #[serde(default)]
    pub winner_state: Option<WinnerState>,
    /// Winning span's rollout session id, for debugger-channel routing.
    #[serde(default)]
    pub rollout_session_id: Option<String>,
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
