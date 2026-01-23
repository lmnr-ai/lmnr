//! This module reads LLM batch submissions from RabbitMQ and processes them:
//! - Makes batch API calls to LLMs (Gemini, etc.)
//! - Pushes results to the LLM Batch Pending Queue for polling

use async_trait::async_trait;
use chrono::Utc;
use std::sync::Arc;

use crate::{
    ch::signal_run_messages::{
        CHSignalRunMessage, get_signal_run_messages, insert_signal_run_messages,
    },
    db::{DB, spans::SpanType},
    mq::MessageQueue,
    signals::{
        SignalJobPendingBatchMessage, SignalJobSubmissionBatchMessage, SignalRunMessage,
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

pub struct LLMBatchSubmissionsHandler {
    pub db: Arc<DB>,
    pub queue: Arc<MessageQueue>,
    pub clickhouse: clickhouse::Client,
    pub gemini: Arc<GeminiClient>,
}

impl LLMBatchSubmissionsHandler {
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
impl MessageHandler for LLMBatchSubmissionsHandler {
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
        )
        .await
    }
}

async fn process(
    msg: SignalJobSubmissionBatchMessage,
    _db: Arc<DB>,
    clickhouse: clickhouse::Client,
    queue: Arc<MessageQueue>,
    gemini: Arc<GeminiClient>,
) -> Result<(), HandlerError> {
    let project_id = msg.project_id;
    let job_id = msg.job_id;
    let prompt = &msg.prompt;
    let structured_output_schema = &msg.structured_output_schema;

    let mut requests: Vec<InlineRequestItem> = Vec::with_capacity(msg.runs.len());
    let mut all_new_messages: Vec<CHSignalRunMessage> = Vec::new();

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
        )
        .await
        {
            Ok((request, new_messages)) => {
                requests.push(request);
                all_new_messages.extend(new_messages);
            }
            Err(e) => {
                log::error!("[SIGNAL JOB] Failed to process run {}: {:?}", run.run_id, e);
            }
        }
    }

    if requests.is_empty() {
        log::error!("[SIGNAL JOB] No requests to submit");
        return Err(HandlerError::permanent(anyhow::anyhow!(
            "No requests to submit"
        )));
    }

    // Insert new messages into ClickHouse
    if !all_new_messages.is_empty() {
        insert_signal_run_messages(clickhouse, &all_new_messages)
            .await
            .map_err(|e| {
                HandlerError::Transient(anyhow::anyhow!("Failed to insert messages: {}", e))
            })?;
    }

    // Submit batch to Gemini API
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
                HandlerError::Permanent(anyhow::anyhow!("Failed to extract batch ID: {}", e))
            })?;

            let pending_message = SignalJobPendingBatchMessage {
                project_id,
                job_id,
                signal_id: msg.signal_id,
                prompt: msg.prompt,
                signal_name: msg.signal_name,
                structured_output_schema: msg.structured_output_schema,
                model: msg.model,
                provider: msg.provider,
                runs: msg.runs,
                batch_id,
            };

            push_to_pending_queue(queue, &pending_message)
                .await
                .map_err(|e| HandlerError::transient(e))?;
        }
        Err(e) => {
            log::error!("[SIGNAL JOB] Failed to submit batch to Gemini: {:?}", e);
            if e.is_retryable() {
                return Err(HandlerError::transient(e));
            } else {
                return Err(HandlerError::permanent(e));
            }
        }
    }

    Ok(())
}

async fn process_run(
    message: &SignalJobSubmissionBatchMessage,
    run: &SignalRunMessage,
    project_id: uuid::Uuid,
    job_id: uuid::Uuid,
    prompt: &str,
    signal_name: &str,
    structured_output_schema: &serde_json::Value,
    clickhouse: clickhouse::Client,
    queue: Arc<MessageQueue>,
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
            parts: vec![Part {
                text: Some(system_prompt.clone()),
                ..Default::default()
            }],
        };

        let user_content = Content {
            role: Some("user".to_string()),
            parts: vec![Part {
                text: Some(user_prompt.clone()),
                ..Default::default()
            }],
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

    // Internal tracing span with resulting content
    let mut contents_with_sys = contents.clone();
    if let Some(mut sys) = system_instruction.clone() {
        sys.role = Some("system".to_string());
        contents_with_sys.insert(0, sys);
    }
    emit_internal_span(
        &format!("step_{}.submit_request", run.step),
        internal_trace_id,
        job_id,
        run_id,
        signal_name,
        Some(internal_span_id),
        SpanType::LLM,
        processing_start_time,
        Some(serde_json::json!(contents_with_sys)),
        None,
        None,
        None,
        Some(message.model.clone()),
        Some(message.provider.clone()),
        queue.clone(),
    )
    .await;

    Ok((request, new_messages))
}
