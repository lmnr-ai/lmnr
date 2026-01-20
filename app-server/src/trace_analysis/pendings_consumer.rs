//! This module reads pending LLM batch requests from RabbitMQ and processes them:
//! wait till completion and push new messages to clickhouse
//! - if no next steps required, create event and update status
//! - otherwise, make tool calls and push to Submissions Queue for next step

use anyhow::Result;
use async_trait::async_trait;
use std::{sync::Arc, time::Duration};
use tokio::{spawn, time::sleep};
use uuid::Uuid;

use crate::{
    ch::{
        events::{CHEvent, insert_events},
        trace_analysis_messages::{CHTraceAnalysisMessage, insert_trace_analysis_messages},
    },
    db::{
        DB,
        events::{Event, EventSource},
        trace_analysis_jobs::update_trace_analysis_job_statistics,
    },
    mq::MessageQueue,
    traces::semantic_events::process_event_notifications_and_clustering,
    worker::{HandlerError, MessageHandler},
};

use super::{
    RabbitMqLLMBatchPendingMessage, Task,
    gemini::{
        FunctionCall, GenerateContentBatchOutput, JobState,
        client::GeminiClient,
        utils::{
            extract_function_call, extract_response_content, extract_task_id_from_metadata,
            extract_text,
        },
    },
    push_to_pending_queue, push_to_submissions_queue,
    spans::{get_full_span_info, get_trace_spans},
    utils::replace_span_tags_with_links,
};

// Delay in seconds to push the batch back to the pending queue if not yet completed
const BATCH_POLLING_INTERVAL: u64 = 30;

pub struct LLMBatchPendingHandler {
    pub db: Arc<DB>,
    pub queue: Arc<MessageQueue>,
    pub clickhouse: clickhouse::Client,
    pub gemini: Arc<GeminiClient>,
}

impl LLMBatchPendingHandler {
    pub fn new(
        db: Arc<DB>,
        queue: Arc<MessageQueue>,
        clickhouse: clickhouse::Client,
        gemini: Arc<GeminiClient>,
    ) -> Self {
        Self {
            db,
            queue,
            clickhouse,
            gemini,
        }
    }
}

#[async_trait]
impl MessageHandler for LLMBatchPendingHandler {
    type Message = RabbitMqLLMBatchPendingMessage;

    async fn handle(&self, message: Self::Message) -> Result<(), HandlerError> {
        process(
            message,
            self.db.clone(),
            self.clickhouse.clone(),
            self.queue.clone(),
            self.gemini.clone(),
        )
        .await
    }
}

async fn process(
    message: RabbitMqLLMBatchPendingMessage,
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    queue: Arc<MessageQueue>,
    gemini: Arc<GeminiClient>,
) -> Result<(), HandlerError> {
    log::debug!(
        "Processing pending batch. job_id: {}, batch_id: {}, tasks: {}",
        message.job_id,
        message.batch_id,
        message.tasks.len()
    );

    // Get batch state from Gemini
    let result = gemini
        .get_batch(&message.batch_id.to_string())
        .await
        .map_err(|e| {
            if e.is_retryable() {
                HandlerError::transient(e)
            } else {
                HandlerError::permanent(e)
            }
        })?;

    let state = result
        .metadata
        .map(|m| m.state)
        .unwrap_or(JobState::BATCH_STATE_UNSPECIFIED);

    log::debug!("Batch {} state: {:?}", message.batch_id, state);

    // Handle batch depending on state
    match state {
        JobState::BATCH_STATE_SUCCEEDED => {
            process_succeeded_batch(&message, result.response, db, queue, clickhouse).await?;
        }
        JobState::BATCH_STATE_PENDING | JobState::BATCH_STATE_RUNNING => {
            process_pending_batch(message, queue);
            return Ok(()); // runs in background, so can't return an error here
        }
        JobState::BATCH_STATE_UNSPECIFIED
        | JobState::BATCH_STATE_FAILED
        | JobState::BATCH_STATE_CANCELLED
        | JobState::BATCH_STATE_EXPIRED => {
            return Err(HandlerError::permanent(anyhow::anyhow!(
                "LLM batch job failed. project_id: {}, job_id: {}, batch_id: {}, state: {:?}",
                message.project_id,
                message.job_id,
                message.batch_id,
                state
            )));
        }
    };

    Ok(())
}

// Spawns a background task to wait and re-queue the message for later processing.
// TODO: handle error better
fn process_pending_batch(message: RabbitMqLLMBatchPendingMessage, queue: Arc<MessageQueue>) {
    log::debug!(
        "Batch {} not ready, re-queuing in {}s",
        message.batch_id,
        BATCH_POLLING_INTERVAL
    );
    spawn(async move {
        sleep(Duration::from_secs(BATCH_POLLING_INTERVAL)).await;
        if let Err(e) = push_to_pending_queue(queue, &message).await {
            log::error!(
                "Failed to push batch back to pending queue. project_id: {}, job_id: {}, batch_id: {}, error: {:?}",
                message.project_id,
                message.job_id,
                message.batch_id,
                e
            );
        }
    });
}

async fn process_succeeded_batch(
    message: &RabbitMqLLMBatchPendingMessage,
    response: Option<GenerateContentBatchOutput>,
    db: Arc<DB>,
    queue: Arc<MessageQueue>,
    clickhouse: clickhouse::Client,
) -> Result<(), HandlerError> {
    let response = response.ok_or_else(|| {
        HandlerError::permanent(anyhow::anyhow!(
            "Batch succeeded but response is missing for batch_id: {}",
            message.batch_id
        ))
    })?;

    let inlined_responses = &response.inlined_responses.inlined_responses;
    log::debug!(
        "Processing {} responses for batch {}",
        inlined_responses.len(),
        message.batch_id
    );

    let mut messages = Vec::new();

    let mut succeeded_tasks_cnt = 0;
    let mut failed_tasks_cnt = 0;
    let mut pending_tasks: Vec<Task> = Vec::new();

    // Build a map of task_id -> payload for efficient lookup
    let task_map: std::collections::HashMap<Uuid, &Task> =
        message.tasks.iter().map(|p| (p.task_id, p)).collect();

    // Process each response, matching by task_id from metadata
    // TODO: process responses in parallel
    for inline_response in inlined_responses.iter() {
        // Extract task_id from response metadata
        let task_id = match extract_task_id_from_metadata(inline_response) {
            Some(id) => id,
            None => {
                failed_tasks_cnt += 1;
                log::error!("Response missing task_id in metadata, skipping");
                continue;
            }
        };

        // Find the corresponding task
        let task = match task_map.get(&task_id) {
            Some(p) => *p,
            None => {
                failed_tasks_cnt += 1;
                log::error!("No payload found for task_id {}, skipping", task_id);
                continue;
            }
        };

        // Build message content from response for ClickHouse
        let response_content = extract_response_content(inline_response);
        let llm_output_msg = CHTraceAnalysisMessage::new(
            message.project_id,
            message.job_id,
            task.task_id,
            chrono::Utc::now(),
            response_content,
        );
        messages.push(llm_output_msg);

        // Check if response contains a function call or text
        // TODO: can LLM response contain multiple function calls?
        if let Some(function_call) = extract_function_call(inline_response) {
            // TODO: combine tool calls into a single clickhouse query
            let status = process_tool_call(
                message,
                task,
                &function_call,
                db.clone(),
                queue.clone(),
                clickhouse.clone(),
            )
            .await;

            match status {
                TaskStatus::Completed => succeeded_tasks_cnt += 1,
                TaskStatus::Pending { tool_result } => {
                    // Save tool result to ClickHouse
                    let tool_output_msg = CHTraceAnalysisMessage::new(
                        message.project_id,
                        message.job_id,
                        task.task_id,
                        chrono::Utc::now(),
                        serde_json::json!({
                            "role": "tool",
                            "content": tool_result
                        })
                        .to_string(),
                    );
                    messages.push(tool_output_msg);

                    // Add to pending tasks list for next submission
                    pending_tasks.push(Task {
                        task_id: task.task_id,
                        trace_id: task.trace_id,
                    });
                }
                TaskStatus::Failed => failed_tasks_cnt += 1,
            }
        } else {
            let text = extract_text(inline_response);
            log::warn!(
                "Response for task {} has no function_call, got text: {}",
                task.task_id,
                text.unwrap_or_default(),
            );
            failed_tasks_cnt += 1;
            // TODO: Check if response is JSON with "identified" key. If so, retry with specifying prompt.
        }
    }

    log::debug!(
        "Batch {} results: succeeded={}, failed={}, pending={}",
        message.batch_id,
        succeeded_tasks_cnt,
        failed_tasks_cnt,
        pending_tasks.len()
    );

    // Insert new messages into ClickHouse
    insert_trace_analysis_messages(clickhouse.clone(), &messages).await?;

    // Update job statistics
    update_trace_analysis_job_statistics(
        &db.pool,
        message.job_id,
        succeeded_tasks_cnt,
        failed_tasks_cnt,
    )
    .await?;

    // Create a new message for submissions queue containing all unfinished tasks
    if !pending_tasks.is_empty() {
        push_to_submissions_queue(
            pending_tasks,
            message.job_id,
            message.event_definition_id,
            message.event_name.clone(),
            message.prompt.clone(),
            message.structured_output_schema.clone(),
            message.model.clone(),
            message.provider.clone(),
            message.project_id,
            queue,
        )
        .await?;
    }

    Ok(())
}

enum TaskStatus {
    Completed,
    Pending { tool_result: serde_json::Value },
    Failed,
}

async fn process_tool_call(
    message: &RabbitMqLLMBatchPendingMessage,
    task: &Task,
    function_call: &FunctionCall,
    db: Arc<DB>,
    queue: Arc<MessageQueue>,
    clickhouse: clickhouse::Client,
) -> TaskStatus {
    log::debug!(
        "Processing tool call '{}' for task {}",
        function_call.name,
        task.task_id
    );

    match function_call.name.as_str() {
        "get_full_span_info" => {
            // Extract span_ids from args
            let span_ids: Vec<usize> = function_call
                .args
                .get("span_ids")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_u64().map(|n| n as usize))
                        .collect()
                })
                .unwrap_or_default();

            if span_ids.is_empty() {
                log::warn!(
                    "get_full_span_info called with no span_ids for task {}",
                    task.task_id
                );
            }

            // Execute the tool
            let tool_result =
                match get_full_span_info(clickhouse, message.project_id, task.trace_id, span_ids)
                    .await
                {
                    Ok(spans) => serde_json::json!({ "spans": spans }),
                    Err(e) => {
                        log::error!("Error fetching full span info: {}", e);
                        serde_json::json!({ "error": e.to_string() })
                    }
                };

            return TaskStatus::Pending { tool_result };
        }
        "submit_identification" => {
            let identified = function_call
                .args
                .get("identified")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            let attributes: Option<serde_json::Value> = function_call.args.get("data").cloned();

            // Create a new event if we have attributes
            if identified {
                let mut attrs = attributes.clone().unwrap_or(serde_json::Value::Null);

                // Get trace spans
                let (ch_spans, uuid_to_seq) =
                    match get_trace_spans(&clickhouse, message.project_id, task.trace_id).await {
                        Ok(result) => result,
                        Err(e) => {
                            log::error!("Failed to get trace spans: {}", e);
                            return TaskStatus::Failed;
                        }
                    };

                if ch_spans.is_empty() {
                    log::error!("No spans found for trace {}", task.trace_id);
                    return TaskStatus::Failed;
                }

                let root_span = &ch_spans[0];

                // Replace span tags with markdown links
                let seq_to_uuid: std::collections::HashMap<usize, Uuid> = uuid_to_seq
                    .iter()
                    .map(|(uuid, seq)| (*seq, *uuid))
                    .collect();

                attrs = match replace_span_tags_with_links(
                    attrs,
                    &seq_to_uuid,
                    message.project_id,
                    task.trace_id,
                ) {
                    Ok(replaced) => replaced,
                    Err(e) => {
                        log::error!("Failed to replace span tags with links: {}", e);
                        return TaskStatus::Failed;
                    }
                };

                // Use root span's end_time as event timestamp
                let timestamp = {
                    let secs = root_span.end_time / 1_000_000_000;
                    let nsecs = (root_span.end_time % 1_000_000_000) as u32;
                    chrono::DateTime::from_timestamp(secs, nsecs).unwrap_or_else(chrono::Utc::now)
                };

                // Create event
                let event = Event {
                    id: uuid::Uuid::new_v4(),
                    span_id: root_span.span_id,
                    project_id: message.project_id,
                    timestamp,
                    name: message.event_name.clone(),
                    attributes: attrs.clone(),
                    trace_id: task.trace_id,
                    source: EventSource::Semantic,
                };

                let ch_events = vec![CHEvent::from_db_event(&event)];

                if let Err(e) = insert_events(clickhouse, ch_events).await {
                    log::error!("Failed to insert events: {}", e);
                    return TaskStatus::Failed;
                }

                log::debug!(
                    "Created event '{}' for trace {} (task {})",
                    message.event_name,
                    task.trace_id,
                    task.task_id
                );

                // Process event slack notifications and clustering
                if let Err(e) = process_event_notifications_and_clustering(
                    db,
                    queue,
                    message.project_id,
                    task.trace_id,
                    root_span.span_id,
                    &message.event_name,
                    attrs,
                    event,
                )
                .await
                {
                    log::error!("Failed to process notifications/clustering: {}", e);
                    return TaskStatus::Failed;
                }
            }

            return TaskStatus::Completed;
        }
        unknown => {
            log::warn!(
                "Unknown function called: {} for task {}",
                unknown,
                task.task_id
            );
            return TaskStatus::Failed;
        }
    }
}
