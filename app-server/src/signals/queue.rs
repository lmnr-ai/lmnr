use std::sync::Arc;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    batch_worker::message_handler::UniqueId,
    mq::{MessageQueue, MessageQueueTrait, utils::mq_max_payload},
};

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
    pub project_id: Uuid,
    pub job_id: Uuid,
    pub signal_id: Uuid,
    pub prompt: String,
    pub structured_output_schema: Value,
    pub signal_name: String,
    pub model: String,
    pub provider: String,
    pub runs: Vec<SignalRunPayload>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct SignalJobPendingBatchMessage {
    pub project_id: Uuid,
    pub job_id: Uuid,
    pub signal_id: Uuid,
    pub prompt: String,
    pub structured_output_schema: Value,
    pub signal_name: String,
    pub model: String,
    pub provider: String,
    pub runs: Vec<SignalRunPayload>,
    pub batch_id: String, // LLM Request Batch ID that can be used to track the completion of the batch
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct SignalRunPayload {
    pub run_id: Uuid,
    pub trace_id: Uuid,
    pub step: usize,
    pub internal_trace_id: Uuid,
    pub internal_span_id: Uuid,
}

impl From<&super::SignalRun> for SignalRunPayload {
    fn from(run: &super::SignalRun) -> Self {
        Self {
            run_id: run.run_id,
            trace_id: run.trace_id,
            step: run.step,
            internal_trace_id: run.internal_trace_id,
            internal_span_id: run.internal_span_id,
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SignalMessage {
    pub trace_id: Uuid,
    pub project_id: Uuid,
    pub trigger_id: Option<Uuid>, // TODO: Remove Option once old messages in queue without trigger_id are processed
    #[serde(alias = "event_definition")] // backwards compatibility with old messages
    pub signal: crate::db::signals::Signal,
}

impl UniqueId for SignalMessage {
    fn get_unique_id(&self) -> String {
        format!("{}-{}", self.project_id, self.signal.id)
    }
}

pub async fn push_to_submissions_queue(
    message: SignalJobSubmissionBatchMessage,
    queue: Arc<MessageQueue>,
) -> Result<()> {
    let number_of_runs = message.runs.len();

    let batch_message = SignalJobSubmissionBatchMessage {
        project_id: message.project_id,
        job_id: message.job_id,
        signal_id: message.signal_id,
        signal_name: message.signal_name.clone(),
        prompt: message.prompt.clone(),
        structured_output_schema: message.structured_output_schema.clone(),
        model: message.model.clone(),
        provider: message.provider.clone(),
        runs: message.runs,
    };

    let serialized = serde_json::to_vec(&batch_message)?;

    if serialized.len() >= mq_max_payload() {
        log::warn!(
            "[SIGNAL JOB] MQ payload limit exceeded. Project ID: [{}], Job ID: [{}], payload size: [{}]. Batch size: [{}]",
            batch_message.project_id,
            batch_message.job_id,
            serialized.len(),
            number_of_runs
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
    trace_id: Uuid,
    project_id: Uuid,
    trigger_id: Option<Uuid>,
    signal: crate::db::signals::Signal,
    queue: Arc<MessageQueue>,
) -> anyhow::Result<()> {
    let message = SignalMessage {
        trace_id,
        project_id,
        trigger_id,
        signal: signal.clone(),
    };

    let serialized = serde_json::to_vec(&message)?;

    queue
        .publish(&serialized, SIGNALS_EXCHANGE, SIGNALS_ROUTING_KEY, None)
        .await?;

    log::debug!(
        "Pushed signal message to queue: trace_id={}, project_id={}, trigger_id={}, event={}",
        trace_id,
        project_id,
        trigger_id.unwrap_or_default(),
        signal.name
    );

    Ok(())
}
