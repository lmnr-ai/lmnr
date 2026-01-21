//! This module reads LLM batch submissions from RabbitMQ and processes them:
//! - Makes batch API calls to LLMs (Gemini, etc.)
//! - Pushes results to the LLM Batch Pending Queue for polling

use async_trait::async_trait;
use chrono::Utc;
use std::sync::Arc;

use crate::{
    ch::trace_analysis_messages::{
        CHTraceAnalysisMessage, get_trace_analysis_messages_for_task,
        insert_trace_analysis_messages,
    },
    db::DB,
    mq::MessageQueue,
    trace_analysis::{
        RabbitMqLLMBatchPendingMessage, RabbitMqLLMBatchSubmissionMessage, Task,
        gemini::{
            Content, GeminiClient, GenerateContentRequest, GenerationConfig, InlineRequestItem,
            Part,
        },
        prompts::{IDENTIFICATION_PROMPT, SYSTEM_PROMPT},
        push_to_pending_queue,
        spans::get_trace_structure_as_string,
        tools::build_tool_definitions,
        utils::extract_batch_id_from_operation,
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
    type Message = RabbitMqLLMBatchSubmissionMessage;

    async fn handle(&self, message: Self::Message) -> Result<(), HandlerError> {
        log::debug!(
            "[TRACE_ANALYSIS] Processing submission message. job_id: {}, tasks: {}",
            message.job_id,
            message.tasks.len(),
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
    msg: RabbitMqLLMBatchSubmissionMessage,
    _db: Arc<DB>,
    clickhouse: clickhouse::Client,
    queue: Arc<MessageQueue>,
    gemini: Arc<GeminiClient>,
) -> Result<(), HandlerError> {
    let project_id = msg.project_id;
    let job_id = msg.job_id;
    let prompt = &msg.prompt;
    let structured_output_schema = &msg.structured_output_schema;

    let mut requests: Vec<InlineRequestItem> = Vec::new();
    let mut all_new_messages: Vec<CHTraceAnalysisMessage> = Vec::new();

    for task in msg.tasks.iter() {
        match process_task(
            task,
            project_id,
            job_id,
            prompt,
            structured_output_schema,
            clickhouse.clone(),
        )
        .await
        {
            Ok((request, new_messages)) => {
                requests.push(request);
                all_new_messages.extend(new_messages);
            }
            Err(e) => {
                log::error!(
                    "[TRACE_ANALYSIS] Failed to process task {}: {:?}",
                    task.task_id,
                    e
                );
            }
        }
    }

    // Submit batch to Gemini API
    match gemini
        .create_batch(
            &msg.model,
            requests,
            Some(format!("trace_analysis_job_{}", job_id)),
        )
        .await
    {
        Ok(operation) => {
            log::debug!(
                "[TRACE_ANALYSIS] Batch submitted successfully. Operation name: {}",
                operation.name
            );

            let batch_id = extract_batch_id_from_operation(&operation.name).map_err(|e| {
                HandlerError::Permanent(anyhow::anyhow!("Failed to extract batch ID: {}", e))
            })?;

            let pending_message = RabbitMqLLMBatchPendingMessage {
                project_id,
                job_id,
                event_definition_id: msg.event_definition_id,
                prompt: msg.prompt,
                event_name: msg.event_name,
                structured_output_schema: msg.structured_output_schema,
                model: msg.model,
                provider: msg.provider,
                tasks: msg.tasks,
                batch_id,
            };

            push_to_pending_queue(queue, &pending_message)
                .await
                .map_err(|e| HandlerError::transient(e))?;
        }
        Err(e) => {
            log::error!("[TRACE_ANALYSIS] Failed to submit batch to Gemini: {:?}", e);
            if e.is_retryable() {
                return Err(HandlerError::transient(e));
            } else {
                return Err(HandlerError::permanent(e));
            }
        }
    }

    if !all_new_messages.is_empty() {
        insert_trace_analysis_messages(clickhouse, &all_new_messages)
            .await
            .map_err(|e| {
                HandlerError::Transient(anyhow::anyhow!("Failed to insert messages: {}", e))
            })?;
    }

    Ok(())
}

async fn process_task(
    task: &Task,
    project_id: uuid::Uuid,
    job_id: uuid::Uuid,
    prompt: &str,
    structured_output_schema: &serde_json::Value,
    clickhouse: clickhouse::Client,
) -> Result<(InlineRequestItem, Vec<CHTraceAnalysisMessage>), HandlerError> {
    let task_id = task.task_id;
    let trace_id = task.trace_id;

    // 1. Query existing messages for this task
    let existing_messages =
        get_trace_analysis_messages_for_task(clickhouse.clone(), project_id, job_id, task_id)
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
        let system_message = CHTraceAnalysisMessage::new(
            project_id,
            job_id,
            task_id,
            now,
            serde_json::to_string(&system_content).unwrap_or_default(),
        );

        let user_message = CHTraceAnalysisMessage::new(
            project_id,
            job_id,
            task_id,
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
            contents,
            generation_config: Some(GenerationConfig {
                temperature: Some(1.0),
                ..Default::default()
            }),
            system_instruction,
            tools: Some(tools),
        },
        metadata: Some(serde_json::json!({ "task_id": task.task_id })),
    };

    Ok((request, new_messages))
}
