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
        LLM_MODEL, LLM_PROVIDER, RunStatus, SignalRun, SignalWorkerConfig,
        gemini::{
            Content, GeminiClient, GenerateContentRequest, GenerationConfig, InlineRequestItem,
            Part,
        },
        prompts::{IDENTIFICATION_PROMPT, SYSTEM_PROMPT},
        queue::{
            SignalJobPendingBatchMessage, SignalJobSubmissionBatchMessage, SignalMessage,
            push_to_pending_queue,
        },
        spans::get_trace_structure_as_string,
        tools::build_tool_definitions,
        utils::{InternalSpan, emit_internal_span, extract_batch_id_from_operation},
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
            "[SIGNAL JOB] Processing submission message. runs: {}",
            message.messages.len(),
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
    let mut requests: Vec<InlineRequestItem> = Vec::with_capacity(msg.messages.len());
    let mut all_new_messages: Vec<CHSignalRunMessage> = Vec::new();
    let mut failed_runs: Vec<SignalRun> = Vec::new();
    let mut successful_messages: Vec<SignalMessage> = Vec::new();

    for message in msg.messages.iter() {
        let project_id = message.project_id;
        let signal = &message.signal;
        let trace_id = message.trace_id;
        let metadata = &message.run_metadata;

        match process_run(
            project_id,
            trace_id,
            metadata.run_id,
            metadata.step,
            metadata.internal_trace_id,
            metadata.internal_span_id,
            metadata.job_id,
            &signal.prompt,
            &signal.name,
            &signal.structured_output_schema,
            &LLM_MODEL,
            &LLM_PROVIDER,
            clickhouse.clone(),
            queue.clone(),
            config.internal_project_id,
        )
        .await
        {
            Ok((request, new_messages)) => {
                requests.push(request);
                all_new_messages.extend(new_messages);
                successful_messages.push(message.clone());
            }
            Err(e) => {
                log::error!(
                    "[SIGNAL JOB] Failed to process run {}: {:?}",
                    metadata.run_id,
                    e
                );
                failed_runs.push(SignalRun {
                    run_id: metadata.run_id,
                    project_id,
                    job_id: metadata.job_id,
                    trigger_id: Uuid::nil(),
                    signal_id: signal.id,
                    trace_id,
                    status: RunStatus::Failed,
                    step: metadata.step,
                    internal_trace_id: metadata.internal_trace_id,
                    internal_span_id: metadata.internal_span_id,
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
        handle_failed_runs(clickhouse, db, failed_runs).await;
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
    let batch_result =
        submit_batch_to_gemini(&LLM_MODEL, gemini, requests, successful_messages, queue).await;

    match batch_result {
        Ok(()) => {
            // Batch submitted successfully, handle any runs that failed during processing
            handle_failed_runs(clickhouse, db, failed_runs).await;
            Ok(())
        }
        Err((batch_failed_runs, handler_error)) => {
            // Only handle failed runs for permanent errors (transient errors will be retried)
            if matches!(handler_error, HandlerError::Permanent(_)) {
                failed_runs.extend(batch_failed_runs);
                handle_failed_runs(clickhouse, db, failed_runs).await;
            }
            Err(handler_error)
        }
    }
}

/// Submit batch to Gemini API and push to pending queue on success.
/// On failure, returns the failed runs and the handler error.
async fn submit_batch_to_gemini(
    model: &str,
    gemini: Arc<GeminiClient>,
    requests: Vec<InlineRequestItem>,
    messages: Vec<SignalMessage>,
    queue: Arc<MessageQueue>,
) -> Result<(), (Vec<SignalRun>, HandlerError)> {
    match gemini
        .create_batch(
            model,
            requests,
            Some(format!("signal_batch_{}", Uuid::new_v4())),
        )
        .await
    {
        Ok(operation) => {
            log::debug!(
                "[SIGNAL JOB] Batch submitted successfully. Operation name: {}",
                operation.name
            );

            let batch_id = extract_batch_id_from_operation(&operation.name).map_err(|e| {
                // If we can't extract batch ID, mark all runs as failed
                let batch_failed_runs = create_failed_runs_from_messages(
                    &messages,
                    format!("Failed to extract batch ID: {}", e),
                );
                (
                    batch_failed_runs,
                    HandlerError::Permanent(anyhow::anyhow!("Failed to extract batch ID: {}", e)),
                )
            })?;

            let pending_message = SignalJobPendingBatchMessage {
                messages: messages.clone(),
                batch_id,
            };

            push_to_pending_queue(queue, &pending_message)
                .await
                .map_err(|e| {
                    // If we can't push to pending queue, mark all runs as failed
                    let batch_failed_runs = create_failed_runs_from_messages(
                        &messages,
                        format!("Failed to push to pending queue: {}", e),
                    );
                    (batch_failed_runs, HandlerError::transient(e))
                })?;

            Ok(())
        }
        Err(e) => {
            log::error!("[SIGNAL JOB] Failed to submit batch to Gemini: {:?}", e);

            let batch_failed_runs = create_failed_runs_from_messages(
                &messages,
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

/// Create failed SignalRun instances from SignalMessage list
fn create_failed_runs_from_messages(
    messages: &[SignalMessage],
    error_message: String,
) -> Vec<SignalRun> {
    messages
        .iter()
        .map(|message| {
            let metadata = &message.run_metadata;
            SignalRun {
                run_id: metadata.run_id,
                project_id: message.project_id,
                job_id: metadata.job_id,
                trigger_id: Uuid::nil(),
                signal_id: message.signal.id,
                trace_id: message.trace_id,
                status: RunStatus::Failed,
                step: metadata.step,
                internal_trace_id: metadata.internal_trace_id,
                internal_span_id: metadata.internal_span_id,
                updated_at: Utc::now(),
                event_id: None,
                error_message: Some(error_message.clone()),
            }
        })
        .collect()
}

/// Insert failed runs into ClickHouse and delete their messages
async fn handle_failed_runs(
    clickhouse: clickhouse::Client,
    db: Arc<DB>,
    failed_runs: Vec<SignalRun>,
) {
    use std::collections::HashMap;

    if failed_runs.is_empty() {
        return;
    }

    // Insert failed runs into ClickHouse
    let failed_runs_ch: Vec<CHSignalRun> = failed_runs.iter().map(CHSignalRun::from).collect();
    if let Err(e) = insert_signal_runs(clickhouse.clone(), &failed_runs_ch).await {
        log::error!("[SIGNAL JOB] Failed to insert failed runs: {:?}", e);
    }

    // Delete messages for failed runs since they won't be processed further
    // Group by project_id since delete operation requires it
    let mut runs_by_project: HashMap<Uuid, Vec<Uuid>> = HashMap::new();
    for run in &failed_runs {
        runs_by_project
            .entry(run.project_id)
            .or_insert_with(Vec::new)
            .push(run.run_id);
    }

    for (project_id, run_ids) in runs_by_project {
        if let Err(e) = delete_signal_run_messages(clickhouse.clone(), project_id, &run_ids).await {
            log::error!(
                "[SIGNAL JOB] Failed to delete messages for failed runs in project {}: {:?}",
                project_id,
                e
            );
        }
    }

    // Update job statistics - group by job_id since runs may belong to different jobs
    let mut failed_by_job: HashMap<Uuid, i32> = HashMap::new();
    for run in &failed_runs {
        if !run.job_id.is_nil() {
            *failed_by_job.entry(run.job_id).or_insert(0) += 1;
        }
    }
    for (job_id, failed_count) in failed_by_job {
        if let Err(e) = update_signal_job_stats(&db.pool, job_id, 0, failed_count).await {
            log::error!("Failed to update job statistics for job {}: {}", job_id, e);
        }
    }
}

async fn process_run(
    project_id: Uuid,
    trace_id: Uuid,
    run_id: Uuid,
    step: usize,
    internal_trace_id: Uuid,
    internal_span_id: Uuid,
    job_id: Uuid,
    prompt: &str,
    signal_name: &str,
    structured_output_schema: &serde_json::Value,
    model: &str,
    provider: &str,
    clickhouse: clickhouse::Client,
    queue: Arc<MessageQueue>,
    internal_project_id: Option<Uuid>,
) -> Result<(InlineRequestItem, Vec<CHSignalRunMessage>), HandlerError> {
    let processing_start_time = Utc::now();

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
            "run_id": run_id,
            "trace_id": trace_id,
        })),
    };

    // Emit internal tracing span
    let mut contents_with_sys = contents.clone();
    if let Some(mut sys) = system_instruction.clone() {
        sys.role = Some("system".to_string());
        contents_with_sys.insert(0, sys);
    }
    let job_ids = if job_id.is_nil() {
        vec![]
    } else {
        vec![job_id]
    };
    emit_internal_span(
        queue.clone(),
        InternalSpan {
            name: format!("step_{}.submit_request", step),
            trace_id: internal_trace_id,
            run_id,
            signal_name: signal_name.to_string(),
            parent_span_id: Some(internal_span_id),
            span_type: SpanType::LLM,
            start_time: processing_start_time,
            input: Some(serde_json::json!(contents_with_sys)),
            output: None,
            input_tokens: None,
            output_tokens: None,
            model: model.to_string(),
            provider: provider.to_string(),
            internal_project_id,
            job_ids,
        },
    )
    .await;

    Ok((request, new_messages))
}
