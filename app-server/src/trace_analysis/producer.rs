use anyhow::Result;
use std::{env, sync::Arc};
use uuid::Uuid;

use crate::{
    db::semantic_event_definitions::SemanticEventDefinition,
    mq::{MessageQueue, MessageQueueTrait, utils::mq_max_payload},
};

use super::{
    Payload, RabbitMqLLMBatchSubmissionMessage, TRACE_ANALYSIS_LLM_BATCH_SUBMISSIONS_EXCHANGE,
    TRACE_ANALYSIS_LLM_BATCH_SUBMISSIONS_ROUTING_KEY,
};

const DEFAULT_BATCH_SIZE: usize = 1;

/// Push trace analysis job to queue for processing
pub async fn push_trace_analysis_to_queue(
    trace_ids: Vec<String>,
    job_id: Uuid,
    event_definition: SemanticEventDefinition,
    event_definition_id: Uuid,
    model: String,
    provider: String,
    project_id: Uuid,
    queue: Arc<MessageQueue>,
) -> Result<()> {
    let batch_size = env::var("TRACE_ANALYSIS_BATCH_SIZE")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(DEFAULT_BATCH_SIZE);

    let structured_output_schema = event_definition.structured_output_schema;

    for batch in trace_ids.chunks(batch_size) {
        let payloads: Vec<Payload> = batch
            .iter()
            .map(|_trace_id| Payload {
                task_id: Uuid::new_v4(),
                event_defintion_id: event_definition_id,
                structured_output_schema: structured_output_schema.clone(),
                model: model.clone(),
                provider: provider.clone(),
            })
            .collect();

        let message = RabbitMqLLMBatchSubmissionMessage {
            project_id,
            job_id,
            payloads,
        };

        // Serialize and publish to queue
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
