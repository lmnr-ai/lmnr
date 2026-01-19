use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

pub mod gemini;
pub mod pendings_consumer;
pub mod producer;
pub mod submissions_consumer;
pub mod utils;

// Queue for LLM batch submissions that should be requested to LLM
pub const TRACE_ANALYSIS_LLM_BATCH_SUBMISSIONS_QUEUE: &str = "trace_analysis_llm_batch_submissions_queue";
pub const TRACE_ANALYSIS_LLM_BATCH_SUBMISSIONS_EXCHANGE: &str = "trace_analysis_llm_batch_submissions_exchange";
pub const TRACE_ANALYSIS_LLM_BATCH_SUBMISSIONS_ROUTING_KEY: &str = "trace_analysis_llm_batch_submissions_routing_key";

// Queue for LLM batch requests that are pending completion
pub const TRACE_ANALYSIS_LLM_BATCH_PENDING_QUEUE: &str = "trace_analysis_llm_batch_pending_queue";
pub const TRACE_ANALYSIS_LLM_BATCH_PENDING_EXCHANGE: &str = "trace_analysis_llm_batch_pending_exchange";
pub const TRACE_ANALYSIS_LLM_BATCH_PENDING_ROUTING_KEY: &str = "trace_analysis_llm_batch_pending_routing_key";

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct RabbitMqLLMBatchSubmissionMessage {
    pub project_id: Uuid,
    pub job_id: Uuid,
    pub payloads: Vec<Payload>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct RabbitMqLLMBatchPendingMessage {
    pub project_id: Uuid,
    pub job_id: Uuid,
    pub batch_id: Uuid, // LLM Request Batch ID that can be used to track the completion of the batch
    pub payloads: Vec<Payload>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct Payload {
    pub task_id: Uuid,
    pub event_defintion_id: Uuid,
    pub structured_output_schema: Value,
    pub model: String,
    pub provider: String,
}
