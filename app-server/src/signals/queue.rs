use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{env, sync::Arc};
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

const DEFAULT_BATCH_SIZE: usize = 128;

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

pub async fn push_to_submissions_queue(
    message: SignalJobSubmissionBatchMessage,
    queue: Arc<MessageQueue>,
) -> Result<()> {
    let batch_size = env::var("SIGNAL_JOB_BATCH_SIZE")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(DEFAULT_BATCH_SIZE);

    let all_runs = message.runs;

    for runs_batch in all_runs.chunks(batch_size) {
        let batch_message = SignalJobSubmissionBatchMessage {
            project_id: message.project_id,
            job_id: message.job_id,
            signal_id: message.signal_id,
            signal_name: message.signal_name.clone(),
            prompt: message.prompt.clone(),
            structured_output_schema: message.structured_output_schema.clone(),
            model: message.model.clone(),
            provider: message.provider.clone(),
            runs: runs_batch.to_vec(),
        };

        let serialized = serde_json::to_vec(&batch_message)?;

        if serialized.len() >= mq_max_payload() {
            log::warn!(
                "[SIGNAL JOB] MQ payload limit exceeded. Project ID: [{}], Job ID: [{}], payload size: [{}]. Batch size: [{}]",
                batch_message.project_id,
                batch_message.job_id,
                serialized.len(),
                runs_batch.len()
            );
            // Skip publishing this batch
            continue;
        }

        queue
            .publish(
                &serialized,
                SIGNAL_JOB_SUBMISSION_BATCH_EXCHANGE,
                SIGNAL_JOB_SUBMISSION_BATCH_ROUTING_KEY,
            )
            .await?;
    }

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
        )
        .await?;

    Ok(())
}

pub(crate) async fn push_to_waiting_queue(
    queue: Arc<MessageQueue>,
    message: &SignalJobPendingBatchMessage, // Same message as for pending queue
) -> Result<()> {
    let mq_message = serde_json::to_vec(message)?;

    queue
        .publish(
            &mq_message,
            SIGNAL_JOB_WAITING_BATCH_EXCHANGE,
            SIGNAL_JOB_WAITING_BATCH_ROUTING_KEY,
        )
        .await?;

    Ok(())
}
