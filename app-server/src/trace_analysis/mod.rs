use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{env, sync::Arc};
use uuid::Uuid;

use crate::mq::{MessageQueue, MessageQueueTrait, utils::mq_max_payload};

pub mod gemini;
pub mod pendings_consumer;
pub mod prompts;
pub mod spans;
pub mod submissions_consumer;
pub mod tools;
pub mod utils;

// Queue for LLM batch submissions that should be requested to LLM
pub const TRACE_ANALYSIS_LLM_BATCH_SUBMISSIONS_QUEUE: &str =
    "trace_analysis_llm_batch_submissions_queue";
pub const TRACE_ANALYSIS_LLM_BATCH_SUBMISSIONS_EXCHANGE: &str =
    "trace_analysis_llm_batch_submissions_exchange";
pub const TRACE_ANALYSIS_LLM_BATCH_SUBMISSIONS_ROUTING_KEY: &str =
    "trace_analysis_llm_batch_submissions_routing_key";

// Queue for LLM batch requests that are pending completion
pub const TRACE_ANALYSIS_LLM_BATCH_PENDING_QUEUE: &str = "trace_analysis_llm_batch_pending_queue";
pub const TRACE_ANALYSIS_LLM_BATCH_PENDING_EXCHANGE: &str =
    "trace_analysis_llm_batch_pending_exchange";
pub const TRACE_ANALYSIS_LLM_BATCH_PENDING_ROUTING_KEY: &str =
    "trace_analysis_llm_batch_pending_routing_key";

// Queue for LLM pending batch requests that should be delayed before next status check
pub const TRACE_ANALYSIS_LLM_BATCH_WAITING_QUEUE: &str = "trace_analysis_llm_batch_waiting_queue";
pub const TRACE_ANALYSIS_LLM_BATCH_WAITING_EXCHANGE: &str =
    "trace_analysis_llm_batch_waiting_exchange";
pub const TRACE_ANALYSIS_LLM_BATCH_WAITING_ROUTING_KEY: &str =
    "trace_analysis_llm_batch_waiting_routing_key";

const DEFAULT_BATCH_SIZE: usize = 128;

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct RabbitMqLLMBatchSubmissionMessage {
    pub project_id: Uuid,
    pub job_id: Uuid,
    pub event_definition_id: Uuid,
    pub prompt: String,
    pub structured_output_schema: Value,
    pub event_name: String,
    pub model: String,
    pub provider: String,
    pub tasks: Vec<Task>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct RabbitMqLLMBatchPendingMessage {
    pub project_id: Uuid,
    pub job_id: Uuid,
    pub event_definition_id: Uuid,
    pub prompt: String,
    pub structured_output_schema: Value,
    pub event_name: String,
    pub model: String,
    pub provider: String,
    pub tasks: Vec<Task>,
    pub batch_id: String, // LLM Request Batch ID that can be used to track the completion of the batch
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct Task {
    pub task_id: Uuid,
    pub trace_id: Uuid,
    pub step: usize,
    pub internal_trace_id: Uuid,
    pub internal_root_span_id: Uuid,
}

pub async fn push_to_submissions_queue(
    message: RabbitMqLLMBatchSubmissionMessage,
    queue: Arc<MessageQueue>,
) -> Result<()> {
    let batch_size = env::var("TRACE_ANALYSIS_BATCH_SIZE")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(DEFAULT_BATCH_SIZE);

    let all_tasks = message.tasks;

    for tasks_batch in all_tasks.chunks(batch_size) {
        let batch_message = RabbitMqLLMBatchSubmissionMessage {
            project_id: message.project_id,
            job_id: message.job_id,
            event_definition_id: message.event_definition_id,
            event_name: message.event_name.clone(),
            prompt: message.prompt.clone(),
            structured_output_schema: message.structured_output_schema.clone(),
            model: message.model.clone(),
            provider: message.provider.clone(),
            tasks: tasks_batch.to_vec(),
        };

        let serialized = serde_json::to_vec(&batch_message)?;

        if serialized.len() >= mq_max_payload() {
            log::warn!(
                "[TRACE_ANALYSIS] MQ payload limit exceeded. Project ID: [{}], Job ID: [{}], payload size: [{}]. Batch size: [{}]",
                batch_message.project_id,
                batch_message.job_id,
                serialized.len(),
                tasks_batch.len()
            );
            // Skip publishing this batch
            continue;
        }

        queue
            .publish(
                &serialized,
                TRACE_ANALYSIS_LLM_BATCH_SUBMISSIONS_EXCHANGE,
                TRACE_ANALYSIS_LLM_BATCH_SUBMISSIONS_ROUTING_KEY,
            )
            .await?;
    }

    Ok(())
}

pub async fn push_to_pending_queue(
    queue: Arc<MessageQueue>,
    message: &RabbitMqLLMBatchPendingMessage,
) -> Result<()> {
    let mq_message = serde_json::to_vec(message)?;

    queue
        .publish(
            &mq_message,
            TRACE_ANALYSIS_LLM_BATCH_PENDING_EXCHANGE,
            TRACE_ANALYSIS_LLM_BATCH_PENDING_ROUTING_KEY,
        )
        .await?;

    Ok(())
}

async fn push_to_waiting_queue(
    queue: Arc<MessageQueue>,
    message: &RabbitMqLLMBatchPendingMessage, // Same message as for pending queue
) -> Result<()> {
    let mq_message = serde_json::to_vec(message)?;

    queue
        .publish(
            &mq_message,
            TRACE_ANALYSIS_LLM_BATCH_WAITING_EXCHANGE,
            TRACE_ANALYSIS_LLM_BATCH_WAITING_ROUTING_KEY,
        )
        .await?;

    Ok(())
}
