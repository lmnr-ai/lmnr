use std::sync::Arc;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::mq::{MessageQueue, MessageQueueTrait, utils::mq_max_payload};

// Queue for batch submissions that should be requested to LLM
pub const SIGNAL_JOB_SUBMISSION_BATCH_QUEUE: &str = "signal_job_submission_batch_queue";
pub const SIGNAL_JOB_SUBMISSION_BATCH_EXCHANGE: &str = "signal_job_submission_batch_exchange";
pub const SIGNAL_JOB_SUBMISSION_BATCH_ROUTING_KEY: &str = "signal_job_submission_batch_routing_key";

// Queue for batch requests that are pending completion
pub const SIGNAL_JOB_PENDING_BATCH_QUEUE: &str = "signal_job_pending_batch_queue";
pub const SIGNAL_JOB_PENDING_BATCH_EXCHANGE: &str = "signal_job_pending_batch_exchange";
pub const SIGNAL_JOB_PENDING_BATCH_ROUTING_KEY: &str = "signal_job_pending_batch_routing_key";

// Queue for batch requests that should be delayed before next status check
pub const SIGNAL_JOB_WAITING_BATCH_QUEUE: &str = "signal_job_waiting_batch_queue";
pub const SIGNAL_JOB_WAITING_BATCH_EXCHANGE: &str = "signal_job_waiting_batch_exchange";
pub const SIGNAL_JOB_WAITING_BATCH_ROUTING_KEY: &str = "signal_job_waiting_batch_routing_key";

// Flat unbatched queue in front of the batched processsing
pub const SIGNALS_QUEUE: &str = "semantic_event_queue";
pub const SIGNALS_EXCHANGE: &str = "semantic_event_exchange";
pub const SIGNALS_ROUTING_KEY: &str = "semantic_event_routing_key";

pub const DEFAULT_BATCH_SIZE: usize = 64;

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct SignalJobSubmissionBatchMessage {
    /// All signal messages in this batch (may contain different projects/signals)
    pub messages: Vec<SignalMessage>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct SignalJobPendingBatchMessage {
    /// All signal messages in this batch (may contain different projects/signals)
    pub messages: Vec<SignalMessage>,
    /// LLM Request Batch ID returned by Gemini API for polling completion status
    pub batch_id: String,
}

/// Metadata for pre-created signal runs (from batch API).
#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct SignalRunMetadata {
    pub run_id: Uuid,
    pub internal_trace_id: Uuid,
    pub internal_span_id: Uuid,
    pub job_id: Uuid,
    pub step: usize,
}

impl Default for SignalRunMetadata {
    fn default() -> Self {
        Self {
            run_id: Uuid::new_v4(),
            internal_trace_id: Uuid::nil(),
            internal_span_id: Uuid::nil(),
            job_id: Uuid::nil(),
            step: 0,
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SignalMessage {
    pub trace_id: Uuid,
    pub project_id: Uuid,
    #[serde(default)]
    pub trigger_id: Option<Uuid>,
    #[serde(alias = "event_definition")] // backwards compatibility with old messages
    pub signal: crate::db::signals::Signal,
    /// Run metadata. Defaults with new run_id for triggered runs; batch API provides full metadata.
    #[serde(default)]
    pub run_metadata: SignalRunMetadata,
}

pub async fn push_to_submissions_queue(
    message: SignalJobSubmissionBatchMessage,
    queue: Arc<MessageQueue>,
) -> Result<()> {
    let number_of_messages = message.messages.len();

    let serialized = serde_json::to_vec(&message)?;

    if serialized.len() >= mq_max_payload() {
        log::warn!(
            "[SIGNAL JOB] MQ payload limit exceeded. payload size: [{}]. Batch size: [{}]",
            serialized.len(),
            number_of_messages
        );
        // Skip publishing this batch
        return Ok(());
    }

    queue
        .publish(
            &serialized,
            SIGNAL_JOB_SUBMISSION_BATCH_EXCHANGE,
            SIGNAL_JOB_SUBMISSION_BATCH_ROUTING_KEY,
            None,
        )
        .await?;

    Ok(())
}

pub async fn push_to_pending_queue(
    queue: Arc<MessageQueue>,
    message: &SignalJobPendingBatchMessage,
) -> Result<()> {
    let mq_message = serde_json::to_vec(message)?;

    queue
        .publish(
            &mq_message,
            SIGNAL_JOB_PENDING_BATCH_EXCHANGE,
            SIGNAL_JOB_PENDING_BATCH_ROUTING_KEY,
            None,
        )
        .await?;

    Ok(())
}

pub async fn push_to_waiting_queue(
    queue: Arc<MessageQueue>,
    message: &SignalJobPendingBatchMessage, // Same message as for pending queue
    ttl_ms: Option<u64>,
) -> Result<()> {
    let mq_message = serde_json::to_vec(message)?;

    queue
        .publish(
            &mq_message,
            SIGNAL_JOB_WAITING_BATCH_EXCHANGE,
            SIGNAL_JOB_WAITING_BATCH_ROUTING_KEY,
            ttl_ms,
        )
        .await?;

    Ok(())
}

pub async fn push_to_signals_queue(
    message: SignalMessage,
    queue: Arc<MessageQueue>,
) -> anyhow::Result<()> {
    let serialized = serde_json::to_vec(&message)?;

    queue
        .publish(&serialized, SIGNALS_EXCHANGE, SIGNALS_ROUTING_KEY, None)
        .await?;

    log::debug!(
        "Pushed signal message to queue: trace_id={}, project_id={}, trigger_id={}, signal={}",
        message.trace_id,
        message.project_id,
        message.trigger_id.unwrap_or_default(),
        message.signal.name
    );

    Ok(())
}
