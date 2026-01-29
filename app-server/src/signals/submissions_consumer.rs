//! This module reads LLM batch submissions from RabbitMQ and processes them:
//! - Makes batch API calls to LLMs (Gemini, etc.)
//! - Pushes results to the Pending Queue for polling

use async_trait::async_trait;
use chrono::Utc;
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    ch::{
        signal_run_messages::{
            CHSignalRunMessage, delete_signal_run_messages, get_signal_run_messages,
            insert_signal_run_messages,
        },
        signal_runs::{CHSignalRun, insert_signal_runs},
    },
    db::{DB, signal_jobs::update_signal_job_stats, spans::SpanType},
    mq::MessageQueue,
    signals::{
        InternalSpan, RunStatus, SignalJobPendingBatchMessage, SignalJobSubmissionBatchMessage,
        SignalRun, SignalRunPayload, SignalWorkerConfig,
        gemini::{
            Content, GeminiClient, GenerateContentRequest, GenerationConfig, InlineRequestItem,
            Part,
        },
        prompts::{IDENTIFICATION_PROMPT, SYSTEM_PROMPT},
        push_to_pending_queue,
        spans::get_trace_structure_as_string,
        tools::build_tool_definitions,
        utils::{emit_internal_span, extract_batch_id_from_operation},
    },
    worker::{HandlerError, MessageHandler},
};

pub struct SignalJobSubmissionBatchHandler {
    pub db: Arc<DB>,
    pub queue: Arc<MessageQueue>,
    pub clickhouse: clickhouse::Client,
    pub gemini: Arc<GeminiClient>,
    pub config: Arc<SignalWorkerConfig>,
}

impl SignalJobSubmissionBatchHandler {
    pub fn new(
        db: Arc<DB>,
        queue: Arc<MessageQueue>,
        clickhouse: clickhouse::Client,
        gemini: Arc<GeminiClient>,
        config: Arc<SignalWorkerConfig>,
    ) -> Self {
        Self {
            db,
            queue,
            clickhouse,
            gemini,
            config,
        }
    }
}

#[async_trait]
impl MessageHandler for SignalJobSubmissionBatchHandler {
    type Message = SignalJobSubmissionBatchMessage;

    async fn handle(&self, message: Self::Message) -> Result<(), HandlerError> {
        log::debug!(
            "[SIGNAL JOB] Processing submission message. job_id: {}, runs: {}",
            message.job_id,
            message.runs.len(),
        );

        process(
            message,
            self.db.clone(),
            self.clickhouse.clone(),
            self.queue.clone(),
            self.gemini.clone(),
            self.config.clone(),
        )
        .await
    }
}

async fn process(
    msg: SignalJobSubmissionBatchMessage,
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    queue: Arc<MessageQueue>,
    gemini: Arc<GeminiClient>,
    config: Arc<SignalWorkerConfig>,
) -> Result<(), HandlerError> {
    let project_id = msg.project_id;
    let job_id = msg.job_id;
    let prompt = &msg.prompt;
    let structured_output_schema = &msg.structured_output_schema;

    let mut requests: Vec<InlineRequestItem> = Vec::with_capacity(msg.runs.len());
    let mut all_new_messages: Vec<CHSignalRunMessage> = Vec::new();
    let mut failed_runs: Vec<SignalRun> = Vec::new();
    let mut to_submit_runs: Vec<SignalRunPayload> = Vec::new();

    for run in msg.runs.iter() {
        match process_run(
            &msg,
            run,
            project_id,
            job_id,
            prompt,
            &msg.signal_name,
            structured_output_schema,
            clickhouse.clone(),
            queue.clone(),
            config.internal_project_id,
        )
        .await
        {
            Ok((request, new_messages)) => {
                requests.push(request);
                all_new_messages.extend(new_messages);
                to_submit_runs.push(run.clone());
            }
            Err(e) => {
                log::error!("[SIGNAL JOB] Failed to process run {}: {:?}", run.run_id, e);
                failed_runs.push(SignalRun {
                    run_id: run.run_id,
                    project_id,
                    job_id,
                    trigger_id: Uuid::nil(),
                    signal_id: msg.signal_id,
                    trace_id: run.trace_id,
                    status: RunStatus::Failed,
                    step: run.step,
                    internal_trace_id: run.internal_trace_id,
                    internal_span_id: run.internal_span_id,
                    updated_at: Utc::now(),
                    event_id: None,
                    error_message: Some(format!("Failed to process run: {}", e)),
                });
            }
        }
    }

    if requests.is_empty() {
        log::error!("[SIGNAL JOB] No requests to submit");
        // All runs failed during processing, handle them before returning
        handle_failed_runs(clickhouse, db, project_id, job_id, failed_runs).await;
        return Err(HandlerError::permanent(anyhow::anyhow!(
            "No requests to submit"
        )));
    }

    // Insert new messages into ClickHouse
    if !all_new_messages.is_empty() {
        insert_signal_run_messages(clickhouse.clone(), &all_new_messages)
            .await
            .map_err(|e| {
                HandlerError::Transient(anyhow::anyhow!("Failed to insert messages: {}", e))
            })?;
    }

    // Submit batch to Gemini API
    let batch_result = submit_batch_to_gemini(&msg, gemini, requests, to_submit_runs, queue).await;

    match batch_result {
        Ok(()) => {
            // Batch submitted successfully, handle any runs that failed during processing
            handle_failed_runs(clickhouse, db, project_id, job_id, failed_runs).await;
            Ok(())
        }
        Err((batch_failed_runs, handler_error)) => {
            // Only handle failed runs for permanent errors (transient errors will be retried)
            if matches!(handler_error, HandlerError::Permanent(_)) {
                failed_runs.extend(batch_failed_runs);
                handle_failed_runs(clickhouse, db, project_id, job_id, failed_runs).await;
            }
            Err(handler_error)
        }
    }
}

/// Submit batch to Gemini API and push to pending queue on success.
/// On failure, returns the failed runs and the handler error.
async fn submit_batch_to_gemini(
    msg: &SignalJobSubmissionBatchMessage,
    gemini: Arc<GeminiClient>,
    requests: Vec<InlineRequestItem>,
    runs: Vec<SignalRunPayload>,
    queue: Arc<MessageQueue>,
) -> Result<(), (Vec<SignalRun>, HandlerError)> {
    let project_id = msg.project_id;
    let job_id = msg.job_id;

    match gemini
        .create_batch(&msg.model, requests, Some(format!("signal_job_{}", job_id)))
        .await
    {
        Ok(operation) => {
            log::debug!(
                "[SIGNAL JOB] Batch submitted successfully. Operation name: {}",
                operation.name
            );

            let batch_id = extract_batch_id_from_operation(&operation.name).map_err(|e| {
                // If we can't extract batch ID, mark all runs as failed
                let batch_failed_runs = create_failed_runs_from_payloads(
                    &runs,
                    msg,
                    format!("Failed to extract batch ID: {}", e),
                );
                (
                    batch_failed_runs,
                    HandlerError::Permanent(anyhow::anyhow!("Failed to extract batch ID: {}", e)),
                )
            })?;

            let pending_message = SignalJobPendingBatchMessage {
                project_id,
                job_id,
                signal_id: msg.signal_id,
                prompt: msg.prompt.clone(),
                signal_name: msg.signal_name.clone(),
                structured_output_schema: msg.structured_output_schema.clone(),
                model: msg.model.clone(),
                provider: msg.provider.clone(),
                runs,
                batch_id,
                clustering_key: msg.clustering_key.clone(),
            };

            push_to_pending_queue(queue, &pending_message)
                .await
                .map_err(|e| {
                    // If we can't push to pending queue, mark all runs as failed
                    let batch_failed_runs = create_failed_runs_from_payloads(
                        &pending_message.runs,
                        msg,
                        format!("Failed to push to pending queue: {}", e),
                    );
                    (batch_failed_runs, HandlerError::transient(e))
                })?;

            Ok(())
        }
        Err(e) => {
            log::error!("[SIGNAL JOB] Failed to submit batch to Gemini: {:?}", e);

            let batch_failed_runs = create_failed_runs_from_payloads(
                &runs,
                msg,
                format!("Batch submission failed: {}", e),
            );

            let handler_error = if e.is_retryable() {
                HandlerError::transient(e)
            } else {
                HandlerError::permanent(e)
            };

            Err((batch_failed_runs, handler_error))
        }
    }
}

/// Create failed SignalRun instances from SignalRunPayload list
fn create_failed_runs_from_payloads(
    runs: &[SignalRunPayload],
    msg: &SignalJobSubmissionBatchMessage,
    error_message: String,
) -> Vec<SignalRun> {
    runs.iter()
        .map(|run| SignalRun {
            run_id: run.run_id,
            project_id: msg.project_id,
            job_id: msg.job_id,
            trigger_id: Uuid::nil(),
            signal_id: msg.signal_id,
            trace_id: run.trace_id,
            status: RunStatus::Failed,
            step: run.step,
            internal_trace_id: run.internal_trace_id,
            internal_span_id: run.internal_span_id,
            updated_at: Utc::now(),
            event_id: None,
            error_message: Some(error_message.clone()),
        })
        .collect()
}

/// Insert failed runs into ClickHouse and delete their messages
async fn handle_failed_runs(
    clickhouse: clickhouse::Client,
    db: Arc<DB>,
    project_id: uuid::Uuid,
    job_id: uuid::Uuid,
    failed_runs: Vec<SignalRun>,
) {
    if failed_runs.is_empty() {
        return;
    }

    // Insert failed runs into ClickHouse
    let failed_runs_ch: Vec<CHSignalRun> = failed_runs.iter().map(CHSignalRun::from).collect();
    if let Err(e) = insert_signal_runs(clickhouse.clone(), &failed_runs_ch).await {
        log::error!("[SIGNAL JOB] Failed to insert failed runs: {:?}", e);
    }

    // Delete messages for failed runs since they won't be processed further
    let failed_run_ids: Vec<uuid::Uuid> = failed_runs.iter().map(|r| r.run_id).collect();
    if let Err(e) = delete_signal_run_messages(clickhouse, project_id, &failed_run_ids).await {
        log::error!(
            "[SIGNAL JOB] Failed to delete messages for failed runs: {:?}",
            e
        );
    }

    // Update job statistics
    let failed_count = failed_runs.len() as i32;
    if let Err(e) = update_signal_job_stats(&db.pool, job_id, 0, failed_count).await {
        log::error!("Failed to update job statistics for failed batch: {}", e);
    }
}

async fn process_run(
    message: &SignalJobSubmissionBatchMessage,
    run: &SignalRunPayload,
    project_id: uuid::Uuid,
    job_id: uuid::Uuid,
    prompt: &str,
    signal_name: &str,
    structured_output_schema: &serde_json::Value,
    clickhouse: clickhouse::Client,
    queue: Arc<MessageQueue>,
    internal_project_id: Option<uuid::Uuid>,
) -> Result<(InlineRequestItem, Vec<CHSignalRunMessage>), HandlerError> {
    let processing_start_time = Utc::now();

    let run_id = run.run_id;
    let trace_id = run.trace_id;
    let internal_trace_id = run.internal_trace_id;
    let internal_span_id = run.internal_span_id;

    // 1. Query existing messages for this run
    let existing_messages = get_signal_run_messages(clickhouse.clone(), project_id, run_id)
        .await
        .map_err(|e| {
            HandlerError::Transient(anyhow::anyhow!("Failed to query existing messages: {}", e))
        })?;

    let (contents, system_instruction, new_messages) = if existing_messages.is_empty() {
        // No messages exist - build initial prompts
        let trace_structure =
            get_trace_structure_as_string(clickhouse.clone(), project_id, trace_id)
                .await
                .map_err(|e| {
                    HandlerError::Transient(anyhow::anyhow!("Failed to get trace structure: {}", e))
                })?;

        let system_prompt = SYSTEM_PROMPT.replace("{{fullTraceData}}", &trace_structure);

        let user_prompt = IDENTIFICATION_PROMPT.replace("{{developer_prompt}}", prompt);

        let now = Utc::now();
        let user_time = now + chrono::Duration::milliseconds(1);

        // Create Content objects (used for both storage and API request)
        let system_content = Content {
            role: Some("system".to_string()), // Stored as "system", converted to None for Gemini API
            parts: Some(vec![Part {
                text: Some(system_prompt.clone()),
                ..Default::default()
            }]),
        };

        let user_content = Content {
            role: Some("user".to_string()),
            parts: Some(vec![Part {
                text: Some(user_prompt.clone()),
                ..Default::default()
            }]),
        };

        // Store as serialized Content for consistent format
        let system_message = CHSignalRunMessage::new(
            project_id,
            run_id,
            now,
            serde_json::to_string(&system_content).unwrap_or_default(),
        );

        let user_message = CHSignalRunMessage::new(
            project_id,
            run_id,
            user_time,
            serde_json::to_string(&user_content).unwrap_or_default(),
        );

        // For Gemini API: system instruction has role: None
        let system_instruction_content = Content {
            role: None,
            ..system_content.clone()
        };

        (
            vec![user_content],
            Some(system_instruction_content),
            vec![system_message, user_message],
        )
    } else {
        let mut contents = Vec::new();
        let mut system_instruction = None;

        for msg in existing_messages {
            // Parse as Content object (all messages are now stored in this format)
            let content: Content = serde_json::from_str(&msg.message).map_err(|e| {
                HandlerError::Permanent(anyhow::anyhow!(
                    "Failed to parse message as Content: {}",
                    e
                ))
            })?;

            match content.role.as_deref() {
                Some("system") => {
                    // System instruction: convert role to None for Gemini API
                    system_instruction = Some(Content {
                        role: None,
                        parts: content.parts,
                    });
                }
                Some("model") | Some("user") => {
                    // Model (assistant) or user messages go into contents
                    contents.push(content);
                }
                other => {
                    log::warn!("Unknown message role: {:?}, skipping", other);
                }
            }
        }

        (contents, system_instruction, vec![])
    };

    // 2. Build tool definitions
    let tools = vec![build_tool_definitions(structured_output_schema)];

    // 3. Create GenerateContentRequest
    let request = InlineRequestItem {
        request: GenerateContentRequest {
            contents: contents.clone(),
            generation_config: Some(GenerationConfig {
                temperature: Some(1.0),
                ..Default::default()
            }),
            system_instruction: system_instruction.clone(),
            tools: Some(tools),
        },
        metadata: Some(serde_json::json!({
            "run_id": run.run_id,
            "trace_id": run.trace_id,
        })),
    };

    // Emit internal tracing span
    let mut contents_with_sys = contents.clone();
    if let Some(mut sys) = system_instruction.clone() {
        sys.role = Some("system".to_string());
        contents_with_sys.insert(0, sys);
    }
    emit_internal_span(
        queue.clone(),
        InternalSpan {
            name: format!("step_{}.submit_request", run.step),
            trace_id: internal_trace_id,
            job_id,
            run_id,
            signal_name: signal_name.to_string(),
            parent_span_id: Some(internal_span_id),
            span_type: SpanType::LLM,
            start_time: processing_start_time,
            input: Some(serde_json::json!(contents_with_sys)),
            output: None,
            input_tokens: None,
            output_tokens: None,
            model: message.model.clone(),
            provider: message.provider.clone(),
            internal_project_id,
        },
    )
    .await;

    Ok((request, new_messages))
}
