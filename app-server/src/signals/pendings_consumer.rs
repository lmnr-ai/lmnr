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
        signal_run_messages::{
            CHSignalRunMessage, delete_signal_run_messages, insert_signal_run_messages,
        },
        signal_runs::{CHSignalRun, insert_signal_runs},
    },
    db::{
        DB,
        events::{Event, EventSource},
        signal_jobs::update_signal_job_stats,
        spans::SpanType,
    },
    mq::MessageQueue,
    traces::semantic_events::process_event_notifications_and_clustering,
    worker::{HandlerError, MessageHandler},
};

use super::{
    RunStatus, SignalJobPendingBatchMessage, SignalJobSubmissionBatchMessage, SignalRun,
    SignalRunMessage,
    gemini::{
        Content, FunctionCall, FunctionResponse, GenerateContentBatchOutput, JobState, Part,
        client::GeminiClient, utils::parse_inline_response,
    },
    push_to_submissions_queue, push_to_waiting_queue,
    spans::get_trace_spans_with_id_mapping,
    tools::get_full_span_info,
    utils::{emit_internal_span, nanoseconds_to_datetime, replace_span_tags_with_links},
};

const MAX_ALLOWED_STEPS: usize = 5;

#[derive(Debug, Serialize)]
enum ToolCallResponseStatus {
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
    type Message = SignalJobPendingBatchMessage;

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
    message: SignalJobPendingBatchMessage,
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    queue: Arc<MessageQueue>,
    gemini: Arc<GeminiClient>,
) -> Result<(), HandlerError> {
    log::debug!(
        "[SIGNAL JOB] Processing batch. job_id: {}, batch_id: {}, runs: {}",
        message.job_id,
        message.batch_id,
        message.runs.len()
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

    log::debug!("[SIGNAL JOB] Batch {} state: {:?}", message.batch_id, state);

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
    message: &SignalJobPendingBatchMessage,
    state: JobState,
    db: Arc<DB>,
) -> Result<(), HandlerError> {
    // Mark all runs in this batch as failed
    let failed_count = message.runs.len() as i32;
    if let Err(e) = update_signal_job_stats(&db.pool, message.job_id, 0, failed_count).await {
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
    message: &SignalJobPendingBatchMessage,
    queue: Arc<MessageQueue>,
) -> Result<(), HandlerError> {
    log::debug!(
        "[SIGNAL JOB] Batch {} not ready, pushing to waiting queue",
        message.batch_id,
    );
    // Push to waiting queue which has a TTL; after expiry it dead-letters to the pending queue
    push_to_waiting_queue(queue, message)
        .await
        .map_err(|e| HandlerError::transient(e))
}

async fn process_succeeded_batch(
    message: &SignalJobPendingBatchMessage,
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
        "[SIGNAL JOB] Processing {} responses for batch {}",
        inlined_responses.len(),
        message.batch_id
    );

    // Keep track of new messages to insert into ClickHouse
    let mut new_messages = Vec::new();

    // Keep track of succeeded, failed and pending runs
    let mut succeeded_runs: Vec<SignalRun> = Vec::new();
    let mut failed_runs: Vec<SignalRun> = Vec::new();
    let mut pending_runs: Vec<SignalRunMessage> = Vec::new();

    // Build a map of run_id -> payload for efficient lookup
    let run_map: HashMap<Uuid, SignalRun> = message
        .runs
        .iter()
        .map(|r| {
            (
                r.run_id,
                SignalRun {
                    run_id: r.run_id,
                    project_id: message.project_id,
                    job_id: message.job_id,
                    signal_id: message.signal_id,
                    trace_id: r.trace_id,
                    status: RunStatus::Pending,
                    step: r.step,
                    internal_trace_id: r.internal_trace_id,
                    internal_span_id: r.internal_span_id,
                    time: chrono::Utc::now(),
                    event_id: None,
                },
            )
        })
        .collect();

    // Process each response, matching by run_id from response metadata
    for inline_response in inlined_responses.iter() {
        let response = parse_inline_response(inline_response);

        // Extract run_id from response metadata
        let run_id = match response.run_id {
            Some(id) => id,
            None => {
                // We don't record this run as failed as we don't know the run_id
                // To account for that we check unprocessed runs after the loop ends
                log::warn!(
                    "Response missing run_id in metadata, skipping response. Batch ID: {}",
                    message.batch_id
                );
                continue;
            }
        };

        // Find the corresponding run
        let run = match run_map.get(&run_id) {
            Some(p) => *p,
            None => {
                failed_runs.push(SignalRun {
                    run_id,
                    project_id: message.project_id,
                    job_id: message.job_id,
                    signal_id: message.signal_id,
                    trace_id: response.trace_id.unwrap_or_default(),
                    status: RunStatus::Failed,
                    step: 0,
                    internal_trace_id: Uuid::nil(),
                    internal_span_id: Uuid::nil(),
                    time: chrono::Utc::now(),
                    event_id: None,
                });
                log::error!("No payload found for run_id {}, skipping", run_id);
                continue;
            }
        };

        // Check if response contains an error
        if response.has_error {
            failed_runs.push(SignalRun {
                status: RunStatus::Failed,
                ..run
            });
            log::error!(
                "Response contains error, marking run as failed for run_id: {}",
                run_id
            );
            continue;
        }

        // Internal tracing span with LLM response
        emit_internal_span(
            &format!("step_{}.process_response", run.step),
            run.internal_trace_id,
            message.job_id,
            run.run_id,
            &message.signal_name,
            Some(run.internal_span_id),
            SpanType::LLM,
            chrono::Utc::now(),
            None,
            Some(serde_json::json!(&response.content)),
            response.input_tokens,
            response.output_tokens,
            Some(message.model.clone()),
            Some(message.provider.clone()),
            queue.clone(),
        )
        .await;

        // Insert LLM output message into ClickHouse
        let llm_output_msg = CHSignalRunMessage::new(
            message.project_id,
            run.run_id,
            chrono::Utc::now(),
            response.content.clone(),
        );
        new_messages.push(llm_output_msg);

        // Check if response contains a function call or text
        if let Some(function_call) = response.function_call {
            let tool_call_start_time = chrono::Utc::now();
            let status = handle_tool_call(message, &run, &function_call, clickhouse.clone()).await;

            // Fire-and-forget internal tracing span
            emit_internal_span(
                &function_call.name,
                run.internal_trace_id,
                message.job_id,
                run.run_id,
                &message.signal_name,
                Some(run.internal_span_id),
                SpanType::Tool,
                tool_call_start_time,
                Some(serde_json::json!(function_call)),
                Some(serde_json::json!(status)),
                None,
                None,
                Some(message.model.clone()),
                Some(message.provider.clone()),
                queue.clone(),
            )
            .await;

            match status {
                ToolCallResponseStatus::Failed => {
                    failed_runs.push(SignalRun {
                        status: RunStatus::Failed,
                        ..run
                    });
                }
                ToolCallResponseStatus::CompletedNoEvent => {
                    succeeded_runs.push(SignalRun {
                        status: RunStatus::Completed,
                        ..run
                    });
                }
                ToolCallResponseStatus::CompletedWithEvent { attributes } => {
                    match handle_create_event(
                        message,
                        &run,
                        attributes,
                        clickhouse.clone(),
                        db.clone(),
                        queue.clone(),
                        run.internal_span_id,
                    )
                    .await
                    {
                        Ok(event_id) => {
                            succeeded_runs.push(SignalRun {
                                status: RunStatus::Completed,
                                event_id: Some(event_id),
                                ..run
                            });
                        }
                        Err(e) => {
                            log::error!("Failed to generate event: {}", e);
                            failed_runs.push(SignalRun {
                                status: RunStatus::Failed,
                                ..run
                            });
                        }
                    }
                }
                ToolCallResponseStatus::RequiresNextStep { tool_result } => {
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

                    let tool_output_msg = CHSignalRunMessage::new(
                        message.project_id,
                        run.run_id,
                        chrono::Utc::now(),
                        serde_json::to_string(&function_response_content).unwrap_or_default(),
                    );
                    new_messages.push(tool_output_msg);

                    // If step number is greater than maximum allowed, mark run as failed
                    if run.step > MAX_ALLOWED_STEPS {
                        failed_runs.push(SignalRun {
                            status: RunStatus::Failed,
                            ..run
                        });
                        log::error!(
                            "Run {} has step number greater than maximum allowed, marking as failed",
                            run.run_id
                        );
                        continue;
                    }

                    // Add to pending runs list for next submission
                    pending_runs.push(SignalRunMessage {
                        run_id: run.run_id,
                        trace_id: run.trace_id,
                        internal_trace_id: run.internal_trace_id,
                        internal_span_id: run.internal_span_id,
                        step: run.step + 1,
                    });
                }
            }
        } else {
            log::warn!(
                "Response for run {} has no function_call, got text: {}",
                run.run_id,
                response.text.unwrap_or_default(),
            );
            failed_runs.push(SignalRun {
                status: RunStatus::Failed,
                ..run
            });
        }
    }

    // Find runs that didn't get any response (e.g., response missing run_id in metadata)
    // This is important to delete messages for all finished runs
    let processed_run_ids: HashSet<Uuid> = succeeded_runs
        .iter()
        .map(|r| r.run_id)
        .chain(failed_runs.iter().map(|r| r.run_id))
        .chain(pending_runs.iter().map(|t| t.run_id))
        .collect();

    for run in message.runs.iter() {
        if !processed_run_ids.contains(&run.run_id) {
            failed_runs.push(SignalRun {
                run_id: run.run_id,
                project_id: message.project_id,
                job_id: message.job_id,
                signal_id: message.signal_id,
                trace_id: run.trace_id,
                status: RunStatus::Failed,
                step: run.step,
                internal_trace_id: run.internal_trace_id,
                internal_span_id: run.internal_span_id,
                time: chrono::Utc::now(),
                event_id: None,
            });
        }
    }

    log::debug!(
        "[SIGNAL JOB] Batch {} results: succeeded={}, failed={}, pending={}",
        message.batch_id,
        succeeded_runs.len(),
        failed_runs.len(),
        pending_runs.len()
    );

    // Insert new messages into ClickHouse
    insert_signal_run_messages(clickhouse.clone(), &new_messages).await?;

    // Update job statistics
    update_signal_job_stats(
        &db.pool,
        message.job_id,
        succeeded_runs.len() as i32,
        failed_runs.len() as i32,
    )
    .await?;

    // Insert succeeded/failed runs into ClickHouse
    let succeeded_runs_ch: Vec<CHSignalRun> = succeeded_runs
        .iter()
        .map(|r| CHSignalRun::from(r))
        .collect();
    insert_signal_runs(clickhouse.clone(), &succeeded_runs_ch).await?;
    let failed_runs_ch: Vec<CHSignalRun> =
        failed_runs.iter().map(|r| CHSignalRun::from(r)).collect();
    insert_signal_runs(clickhouse.clone(), &failed_runs_ch).await?;

    // Create a new message for submissions queue containing all unfinished runs
    if !pending_runs.is_empty() {
        let submission_message = SignalJobSubmissionBatchMessage {
            project_id: message.project_id,
            job_id: message.job_id,
            signal_id: message.signal_id,
            signal_name: message.signal_name.clone(),
            prompt: message.prompt.clone(),
            structured_output_schema: message.structured_output_schema.clone(),
            model: message.model.clone(),
            provider: message.provider.clone(),
            runs: pending_runs,
        };

        push_to_submissions_queue(submission_message, queue).await?;
    }

    // Delete messages for finished runs (both succeeded and failed)
    let finished_run_ids: Vec<Uuid> = succeeded_runs
        .iter()
        .chain(failed_runs.iter())
        .map(|r| r.run_id)
        .collect();

    delete_signal_run_messages(clickhouse, message.project_id, &finished_run_ids).await?;

    Ok(())
}

async fn handle_tool_call(
    message: &SignalJobPendingBatchMessage,
    run: &SignalRun,
    function_call: &FunctionCall,
    clickhouse: clickhouse::Client,
) -> ToolCallResponseStatus {
    log::debug!(
        "[SIGNAL JOB] Processing tool call '{}' for run {}",
        function_call.name,
        run.run_id
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
                    "get_full_span_info called with no span_ids for run {}",
                    run.run_id
                );
                return ToolCallResponseStatus::Failed;
            }

            // Execute the tool
            let tool_result =
                match get_full_span_info(clickhouse, message.project_id, run.trace_id, span_ids)
                    .await
                {
                    Ok(spans) => serde_json::json!({ "spans": spans }),
                    Err(e) => {
                        log::error!("Error fetching full span info: {}", e);
                        serde_json::json!({ "error": e.to_string() })
                    }
                };

            return ToolCallResponseStatus::RequiresNextStep { tool_result };
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
                "[SIGNAL JOB] submit_identification identified: {:?}",
                identified,
            );

            if identified {
                let attrs = attributes.unwrap_or(serde_json::Value::Null);
                return ToolCallResponseStatus::CompletedWithEvent { attributes: attrs };
            }

            return ToolCallResponseStatus::CompletedNoEvent;
        }
        unknown => {
            log::warn!(
                "Unknown function called: {} for run {}",
                unknown,
                run.run_id
            );
            return ToolCallResponseStatus::Failed;
        }
    }
}

async fn handle_create_event(
    message: &SignalJobPendingBatchMessage,
    run: &SignalRun,
    attributes: serde_json::Value,
    clickhouse: clickhouse::Client,
    db: Arc<DB>,
    queue: Arc<MessageQueue>,
    parent_span_id: Uuid,
) -> anyhow::Result<Uuid> {
    let create_event_start_time = chrono::Utc::now();

    // Get trace spans
    let (ch_spans, uuid_to_seq) =
        get_trace_spans_with_id_mapping(clickhouse.clone(), message.project_id, run.trace_id)
            .await?;

    if ch_spans.is_empty() {
        anyhow::bail!("No spans found for trace {}", run.trace_id);
    }

    let root_span = &ch_spans[0];

    // Replace span tags with markdown links
    let seq_to_uuid: HashMap<usize, Uuid> = uuid_to_seq
        .iter()
        .map(|(uuid, seq)| (*seq, *uuid))
        .collect();

    let attrs =
        replace_span_tags_with_links(attributes, &seq_to_uuid, message.project_id, run.trace_id)?;

    // Use root span's end_time as event timestamp
    let timestamp = nanoseconds_to_datetime(root_span.end_time);

    // Create event
    let event = Event {
        id: Uuid::new_v4(),
        span_id: root_span.span_id,
        project_id: message.project_id,
        timestamp,
        name: message.signal_name.clone(),
        attributes: attrs.clone(),
        trace_id: run.trace_id,
        source: EventSource::Semantic,
    };

    // Insert into ClickHouse
    let ch_events = vec![CHEvent::from_db_event(&event)];
    insert_events(clickhouse, ch_events).await?;

    log::debug!(
        "[SIGNAL JOB] Created event '{}' for trace {} (run {})",
        message.signal_name,
        run.trace_id,
        run.run_id
    );

    // Process notifications and clustering
    process_event_notifications_and_clustering(
        db,
        queue.clone(),
        message.project_id,
        run.trace_id,
        root_span.span_id,
        &message.signal_name,
        attrs,
        event.clone(),
    )
    .await?;

    let event_id = event.id;

    // Internal tracing span
    emit_internal_span(
        "create_event",
        run.internal_trace_id,
        message.job_id,
        run.run_id,
        &message.signal_name,
        Some(parent_span_id),
        SpanType::Default,
        create_event_start_time,
        Some(serde_json::json!(event)),
        None,
        None,
        None,
        Some(message.model.clone()),
        Some(message.provider.clone()),
        queue,
    )
    .await;

    Ok(event_id)
}
