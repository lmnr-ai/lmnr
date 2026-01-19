use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use uuid::Uuid;

use crate::mq::{MessageQueue, MessageQueueTrait};

pub mod gemini;
pub mod pendings_consumer;
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

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct RabbitMqLLMBatchSubmissionMessage {
    pub project_id: Uuid,
    pub job_id: Uuid,
    pub event_definition_id: Uuid,
    pub prompt: String,
    pub structured_output_schema: Value,
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
    pub model: String,
    pub provider: String,
    pub tasks: Vec<Task>,
    pub batch_id: Uuid, // LLM Request Batch ID that can be used to track the completion of the batch
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct Task {
    pub task_id: Uuid,
    pub trace_id: Uuid,
}

async fn push_to_pending_queue(
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

async fn push_to_submissions_queue(
    queue: Arc<MessageQueue>,
    message: &RabbitMqLLMBatchSubmissionMessage,
) -> Result<()> {
    let mq_message = serde_json::to_vec(message)?;

    queue
        .publish(
            &mq_message,
            TRACE_ANALYSIS_LLM_BATCH_SUBMISSIONS_EXCHANGE,
            TRACE_ANALYSIS_LLM_BATCH_SUBMISSIONS_ROUTING_KEY,
        )
        .await?;

    Ok(())
}
