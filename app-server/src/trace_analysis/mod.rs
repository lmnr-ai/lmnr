use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{env, sync::Arc};
use uuid::Uuid;

use crate::mq::{MessageQueue, MessageQueueTrait, utils::mq_max_payload};

pub mod gemini;
pub mod pendings_consumer;
pub mod prompts;
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

const DEFAULT_BATCH_SIZE: usize = 1;

pub async fn push_to_submissions_queue(
    trace_ids: Vec<String>,
    job_id: Uuid,
    event_definition_id: Uuid,
    prompt: String,
    structured_output_schema: Value,
    model: String,
    provider: String,
    project_id: Uuid,
    queue: Arc<MessageQueue>,
) -> Result<()> {
    let batch_size = env::var("TRACE_ANALYSIS_BATCH_SIZE")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(DEFAULT_BATCH_SIZE);

    for batch in trace_ids.chunks(batch_size) {
        let tasks: Vec<Task> = batch
            .iter()
            .map(|trace_id| Task {
                task_id: Uuid::new_v4(),
                trace_id: trace_id.parse::<Uuid>().unwrap(),
            })
            .collect();

        let message = RabbitMqLLMBatchSubmissionMessage {
            project_id,
            job_id,
            event_definition_id,
            prompt: prompt.clone(),
            structured_output_schema: structured_output_schema.clone(),
            model: model.clone(),
            provider: provider.clone(),
            tasks,
        };

        let serialized = serde_json::to_vec(&message)?;

        if serialized.len() >= mq_max_payload() {
            log::warn!(
                "[TRACE_ANALYSIS] MQ payload limit exceeded. Project ID: [{}], Job ID: [{}], payload size: [{}]. Batch size: [{}]",
                project_id,
                job_id,
                serialized.len(),
                batch.len()
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
