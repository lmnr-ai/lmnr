//! This module reads pending LLM batch requests from RabbitMQ and processes them:
//! wait till completion and push new messages to clickhouse
//! - if no next steps required, create event and update status
//! - otherwise, make tool calls and push to Submissions Queue for next step

use anyhow::Result;
use async_trait::async_trait;
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};
use uuid::Uuid;

use crate::{
    ch::{
        events::{CHEvent, insert_events},
        trace_analysis_messages::{
            CHTraceAnalysisMessage, delete_trace_analysis_messages_by_task_ids,
            insert_trace_analysis_messages,
        },
    },
    db::{
        DB,
        events::{Event, EventSource},
        spans::SpanType,
        trace_analysis_jobs::update_trace_analysis_job_statistics,
    },
    mq::MessageQueue,
    traces::semantic_events::process_event_notifications_and_clustering,
    worker::{HandlerError, MessageHandler},
};

use super::{
    RabbitMqLLMBatchPendingMessage, RabbitMqLLMBatchSubmissionMessage, Task,
    gemini::{
        Content, FunctionCall, FunctionResponse, GenerateContentBatchOutput, JobState, Part,
        client::GeminiClient, utils::parse_inline_response,
    },
    push_to_submissions_queue, push_to_waiting_queue,
    spans::get_trace_spans_with_id_mapping,
    tools::get_full_span_info,
    utils::{emit_internal_span, nanoseconds_to_datetime, replace_span_tags_with_links},
};

const MAX_ALLOWED_STEPS: usize = 10;

#[derive(Debug, Serialize)]
enum TaskStatus {
    CompletedNoEvent,
    CompletedWithEvent { attributes: serde_json::Value },
    RequiresNextStep { tool_result: serde_json::Value },
    Failed,
}

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
        "[TRACE_ANALYSIS] Processing batch. job_id: {}, batch_id: {}, tasks: {}",
        message.job_id,
        message.batch_id,
        message.tasks.len()
    );

    // Get batch state from Gemini
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
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

    log::debug!(
        "[TRACE_ANALYSIS] Batch {} state: {:?}",
        message.batch_id,
        state
    );

    // Handle batch depending on state
    match state {
        JobState::BATCH_STATE_UNSPECIFIED
        | JobState::BATCH_STATE_FAILED
        | JobState::BATCH_STATE_CANCELLED
        | JobState::BATCH_STATE_EXPIRED => {
            process_failed_batch(&message, state, db).await?;
        }
        JobState::BATCH_STATE_PENDING | JobState::BATCH_STATE_RUNNING => {
            process_pending_batch(&message, queue).await?;
        }
        JobState::BATCH_STATE_SUCCEEDED => {
            process_succeeded_batch(&message, result.response, db, queue, clickhouse).await?;
        }
    };

    Ok(())
}

async fn process_failed_batch(
    message: &RabbitMqLLMBatchPendingMessage,
    state: JobState,
    db: Arc<DB>,
) -> Result<(), HandlerError> {
    // Mark all tasks in this batch as failed
    let failed_count = message.tasks.len() as i32;
    if let Err(e) =
        update_trace_analysis_job_statistics(&db.pool, message.job_id, 0, failed_count).await
    {
        log::error!("Failed to update job statistics for failed batch: {}", e);
    }

    Err(HandlerError::permanent(anyhow::anyhow!(
        "LLM batch job failed. project_id: {}, job_id: {}, batch_id: {}, state: {:?}",
        message.project_id,
        message.job_id,
        message.batch_id,
        state
    )))
}

async fn process_pending_batch(
    message: &RabbitMqLLMBatchPendingMessage,
    queue: Arc<MessageQueue>,
) -> Result<(), HandlerError> {
    log::debug!(
        "[TRACE_ANALYSIS] Batch {} not ready, pushing to waiting queue",
        message.batch_id,
    );
    // Push to waiting queue which has a TTL; after expiry it dead-letters to the pending queue
    push_to_waiting_queue(queue, message)
        .await
        .map_err(|e| HandlerError::transient(e))
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
        "[TRACE_ANALYSIS] Processing {} responses for batch {}",
        inlined_responses.len(),
        message.batch_id
    );

    // Keep track of new messages to insert into ClickHouse
    let mut new_messages = Vec::new();

    let mut succeeded_task_ids: Vec<Uuid> = Vec::new();
    let mut failed_task_ids: Vec<Uuid> = Vec::new();
    let mut pending_tasks: Vec<Task> = Vec::new();

    // Build a map of task_id -> payload for efficient lookup
    let task_map: HashMap<Uuid, &Task> = message.tasks.iter().map(|p| (p.task_id, p)).collect();

    // Process each response, matching by task_id from response metadata
    for inline_response in inlined_responses.iter() {
        let response = parse_inline_response(inline_response);

        // Extract task_id from response metadata
        let task_id = match response.task_id {
            Some(id) => id,
            None => {
                // failed_task_ids is not updated here cause we don't know the task_id
                // we compensate for this outside the loop by checking not processed tasks
                log::warn!(
                    "Response missing task_id in metadata, skipping response. Batch ID: {}",
                    message.batch_id
                );
                continue;
            }
        };

        // Check if response contains an error
        if response.has_error {
            failed_task_ids.push(task_id);
            log::error!(
                "Response contains error, marking task as failed for task_id: {}",
                task_id
            );
            continue;
        }

        // Find the corresponding task
        let task = match task_map.get(&task_id) {
            Some(p) => *p,
            None => {
                failed_task_ids.push(task_id);
                log::error!("No payload found for task_id {}, skipping", task_id);
                continue;
            }
        };

        // Internal tracing span with LLM response
        emit_internal_span(
            &format!("step_{}.process_response", task.step),
            task.internal_trace_id,
            message.job_id,
            task.task_id,
            &message.event_name,
            Some(task.internal_root_span_id),
            SpanType::LLM,
            chrono::Utc::now(),
            None,
            Some(serde_json::json!(&response.content)),
            response.input_tokens,
            response.output_tokens,
            queue.clone(),
        )
        .await;

        // Insert LLM output message into ClickHouse
        let llm_output_msg = CHTraceAnalysisMessage::new(
            message.project_id,
            message.job_id,
            task.task_id,
            chrono::Utc::now(),
            response.content.clone(),
        );
        new_messages.push(llm_output_msg);

        // Check if response contains a function call or text
        if let Some(function_call) = response.function_call {
            let tool_call_start_time = chrono::Utc::now();
            let status = handle_tool_call(message, task, &function_call, clickhouse.clone()).await;

            // Fire-and-forget internal tracing span
            emit_internal_span(
                &function_call.name,
                task.internal_trace_id,
                message.job_id,
                task.task_id,
                &message.event_name,
                Some(task.internal_root_span_id),
                SpanType::Tool,
                tool_call_start_time,
                Some(serde_json::json!(function_call)),
                Some(serde_json::json!(status)),
                None,
                None,
                queue.clone(),
            )
            .await;

            match status {
                TaskStatus::Failed => failed_task_ids.push(task.task_id),
                TaskStatus::CompletedNoEvent => succeeded_task_ids.push(task.task_id),
                TaskStatus::CompletedWithEvent { attributes } => {
                    if let Err(e) = handle_create_event(
                        message,
                        task,
                        attributes,
                        clickhouse.clone(),
                        db.clone(),
                        queue.clone(),
                        task.internal_root_span_id,
                    )
                    .await
                    {
                        log::error!("Failed to generate event: {}", e);
                        failed_task_ids.push(task.task_id);
                    } else {
                        succeeded_task_ids.push(task.task_id);
                    }
                }
                TaskStatus::RequiresNextStep { tool_result } => {
                    // Save tool result to ClickHouse
                    let function_response_content = Content {
                        role: Some("user".to_string()),
                        parts: vec![Part {
                            function_response: Some(FunctionResponse {
                                name: function_call.name.clone(),
                                response: tool_result,
                                id: function_call.id.clone(),
                            }),
                            ..Default::default()
                        }],
                    };

                    let tool_output_msg = CHTraceAnalysisMessage::new(
                        message.project_id,
                        message.job_id,
                        task.task_id,
                        chrono::Utc::now(),
                        serde_json::to_string(&function_response_content).unwrap_or_default(),
                    );
                    new_messages.push(tool_output_msg);

                    // If step number is greater than maximum allowed, mark task as failed
                    if task.step > MAX_ALLOWED_STEPS {
                        failed_task_ids.push(task.task_id);
                        log::error!(
                            "Task {} has step number greater than maximum allowed, marking as failed",
                            task.task_id
                        );
                        continue;
                    }

                    // Add to pending tasks list for next submission
                    pending_tasks.push(Task {
                        task_id: task.task_id,
                        trace_id: task.trace_id,
                        internal_trace_id: task.internal_trace_id,
                        internal_root_span_id: task.internal_root_span_id,
                        step: task.step + 1,
                    });
                }
            }
        } else {
            log::warn!(
                "Response for task {} has no function_call, got text: {}",
                task.task_id,
                response.text.unwrap_or_default(),
            );
            failed_task_ids.push(task.task_id);
        }
    }

    // Find tasks that didn't get any response (e.g., response missing task_id in metadata)
    // This is important to delete messages for all finished tasks
    let processed_task_ids: HashSet<Uuid> = succeeded_task_ids
        .iter()
        .chain(failed_task_ids.iter())
        .chain(pending_tasks.iter().map(|t| &t.task_id))
        .copied()
        .collect();

    for task in message.tasks.iter() {
        if !processed_task_ids.contains(&task.task_id) {
            failed_task_ids.push(task.task_id);
        }
    }

    log::debug!(
        "[TRACE_ANALYSIS] Batch {} results: succeeded={}, failed={}, pending={}",
        message.batch_id,
        succeeded_task_ids.len(),
        failed_task_ids.len(),
        pending_tasks.len()
    );

    // Insert new messages into ClickHouse
    insert_trace_analysis_messages(clickhouse.clone(), &new_messages).await?;

    // Update job statistics
    update_trace_analysis_job_statistics(
        &db.pool,
        message.job_id,
        succeeded_task_ids.len() as i32,
        failed_task_ids.len() as i32,
    )
    .await?;

    // Create a new message for submissions queue containing all unfinished tasks
    if !pending_tasks.is_empty() {
        let submission_message = RabbitMqLLMBatchSubmissionMessage {
            project_id: message.project_id,
            job_id: message.job_id,
            event_definition_id: message.event_definition_id,
            event_name: message.event_name.clone(),
            prompt: message.prompt.clone(),
            structured_output_schema: message.structured_output_schema.clone(),
            model: message.model.clone(),
            provider: message.provider.clone(),
            tasks: pending_tasks,
        };

        push_to_submissions_queue(submission_message, queue).await?;
    }

    // Delete messages for finished tasks (both succeeded and failed)
    let finished_task_ids: Vec<Uuid> = succeeded_task_ids
        .iter()
        .chain(failed_task_ids.iter())
        .copied()
        .collect();

    delete_trace_analysis_messages_by_task_ids(
        clickhouse,
        message.project_id,
        message.job_id,
        &finished_task_ids,
    )
    .await?;

    Ok(())
}

async fn handle_tool_call(
    message: &RabbitMqLLMBatchPendingMessage,
    task: &Task,
    function_call: &FunctionCall,
    clickhouse: clickhouse::Client,
) -> TaskStatus {
    log::debug!(
        "[TRACE_ANALYSIS] Processing tool call '{}' for task {}",
        function_call.name,
        task.task_id
    );

    match function_call.name.as_str() {
        "get_full_span_info" => {
            // Extract span_ids from args
            let span_ids: Vec<usize> = function_call
                .args
                .as_ref()
                .and_then(|args| args.get("span_ids"))
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_u64().map(|n| n as usize))
                        .collect()
                })
                .unwrap_or_default();

            if span_ids.is_empty() {
                log::error!(
                    "get_full_span_info called with no span_ids for task {}",
                    task.task_id
                );
                return TaskStatus::Failed;
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

            return TaskStatus::RequiresNextStep { tool_result };
        }
        "submit_identification" => {
            let identified = function_call
                .args
                .as_ref()
                .and_then(|args| args.get("identified"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            let attributes: Option<serde_json::Value> = function_call
                .args
                .as_ref()
                .and_then(|args| args.get("data").cloned());

            log::debug!(
                "[TRACE_ANALYSIS] submit_identification identified: {:?}",
                identified,
            );

            if identified {
                let attrs = attributes.unwrap_or(serde_json::Value::Null);
                return TaskStatus::CompletedWithEvent { attributes: attrs };
            }

            return TaskStatus::CompletedNoEvent;
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

async fn handle_create_event(
    message: &RabbitMqLLMBatchPendingMessage,
    task: &Task,
    attributes: serde_json::Value,
    clickhouse: clickhouse::Client,
    db: Arc<DB>,
    queue: Arc<MessageQueue>,
    parent_span_id: Uuid,
) -> anyhow::Result<()> {
    let create_event_start_time = chrono::Utc::now();

    // Get trace spans
    let (ch_spans, uuid_to_seq) =
        get_trace_spans_with_id_mapping(clickhouse.clone(), message.project_id, task.trace_id)
            .await?;

    if ch_spans.is_empty() {
        anyhow::bail!("No spans found for trace {}", task.trace_id);
    }

    let root_span = &ch_spans[0];

    // Replace span tags with markdown links
    let seq_to_uuid: HashMap<usize, Uuid> = uuid_to_seq
        .iter()
        .map(|(uuid, seq)| (*seq, *uuid))
        .collect();

    let attrs =
        replace_span_tags_with_links(attributes, &seq_to_uuid, message.project_id, task.trace_id)?;

    // Use root span's end_time as event timestamp
    let timestamp = nanoseconds_to_datetime(root_span.end_time);

    // Create event
    let event = Event {
        id: Uuid::new_v4(),
        span_id: root_span.span_id,
        project_id: message.project_id,
        timestamp,
        name: message.event_name.clone(),
        attributes: attrs.clone(),
        trace_id: task.trace_id,
        source: EventSource::Semantic,
    };

    // Insert into ClickHouse
    let ch_events = vec![CHEvent::from_db_event(&event)];
    insert_events(clickhouse, ch_events).await?;

    log::debug!(
        "[TRACE_ANALYSIS] Created event '{}' for trace {} (task {})",
        message.event_name,
        task.trace_id,
        task.task_id
    );

    // Process notifications and clustering
    process_event_notifications_and_clustering(
        db,
        queue.clone(),
        message.project_id,
        task.trace_id,
        root_span.span_id,
        &message.event_name,
        attrs,
        event.clone(),
    )
    .await?;

    // Internal tracing span
    emit_internal_span(
        "create_event",
        task.internal_trace_id,
        message.job_id,
        task.task_id,
        &message.event_name,
        Some(parent_span_id),
        SpanType::Default,
        create_event_start_time,
        Some(serde_json::json!(event)),
        None,
        None,
        None,
        queue,
    )
    .await;

    Ok(())
}
