//! Queue plumbing for ingestion-time user-task extraction (LAM-1880).
//!
//! The producer enqueues a message here when a candidate LLM span's
//! regex cache misses; the `InputExtraction` worker generates the regex
//! via LLM, applies it, and patches the trace metadata.

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::lock::{SubagentInputLockState, UserTaskLockState};
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
    /// When set, this extraction targets a subagent slot instead of the
    /// trace's main `lmnr_user_task` (LAM-1953). `None` = main task, so
    /// in-flight legacy messages decode unchanged.
    #[serde(default)]
    pub subagent: Option<SubagentTarget>,
}

/// A subagent extraction target: the locator span identifies the branch
/// point where the subagent's subtree diverges from its owning agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubagentTarget {
    /// Locator half-UUID span id — resolves the metadata keys
    /// (`lmnr.internal.lmnr_subagent_input.<uuid>`) and the `st_in_lock`
    /// cache key.
    pub span_id: Uuid,
    /// Dot-joined name-path down to the locator, for
    /// `lmnr.internal.lmnr_subagent_path.<uuid>`.
    pub label: String,
    /// Per-locator winner-lock snapshot at enqueue time; supersession
    /// checks run against `st_in_lock` instead of the main lock.
    pub winner_state: Option<SubagentInputLockState>,
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
