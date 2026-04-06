use chrono::Utc;
use std::{collections::HashMap, sync::Arc};
use uuid::Uuid;

use crate::{
    cache::Cache,
    ch::{
        signal_run_messages::{CHSignalRunMessage, get_signal_run_messages},
        signal_runs::{CHSignalRun, insert_signal_runs},
    },
    db::{DB, signal_jobs::update_signal_job_stats},
    signals::{
        SignalRun, llm_model,
        prompts::{IDENTIFICATION_PROMPT, SYSTEM_PROMPT},
        provider::{
            ProviderClient, ProviderThinkingConfig, ProviderThinkingLevel,
            models::{
                ProviderContent as Content, ProviderGenerationConfig, ProviderPart as Part,
                ProviderRequest, ProviderRequestItem,
            },
        },
        spans::{build_trace_structure_string, extract_system_prompts, get_trace_ch_spans},
        summarize::{generate_and_cache_summaries, lookup_cached_summaries},
        tools::build_tool_definitions,
    },
    worker::HandlerError,
};

pub struct ProcessRunResult {
    pub request: ProviderRequestItem,
    pub new_messages: Vec<CHSignalRunMessage>,
    pub request_start_time: chrono::DateTime<chrono::Utc>,
}

pub async fn handle_failed_runs(
    clickhouse: clickhouse::Client,
    db: Arc<DB>,
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

    // Update job statistics - group by job_id since runs may belong to different jobs
    let mut failed_by_job: HashMap<Uuid, i32> = HashMap::new();
    for run in &failed_runs {
        if let Some(job_id) = run.job_id {
            *failed_by_job.entry(job_id).or_insert(0) += 1;
        }
    }
    for (job_id, failed_count) in failed_by_job {
        if let Err(e) = update_signal_job_stats(&db.pool, job_id, 0, failed_count).await {
            log::error!("Failed to update job statistics for job {}: {}", job_id, e);
        }
    }
}

pub async fn process_run(
    project_id: Uuid,
    trace_id: Uuid,
    run_id: Uuid,
    signal_id: Uuid,
    prompt: &str,
    structured_output_schema: &serde_json::Value,
    clickhouse: clickhouse::Client,
    cache: Arc<Cache>,
    llm_client: Arc<ProviderClient>,
) -> Result<ProcessRunResult, HandlerError> {
    let processing_start_time = Utc::now();

    // 1. Query existing messages for this run
    let existing_messages = get_signal_run_messages(clickhouse.clone(), project_id, run_id)
        .await
        .map_err(|e| {
            HandlerError::Transient(anyhow::anyhow!("Failed to query existing messages: {}", e))
        })?;

    let (contents, system_instruction, new_messages) = if existing_messages.is_empty() {
        // Fetch spans and build compressed trace with system prompt summarization
        let ch_spans = get_trace_ch_spans(clickhouse.clone(), project_id, trace_id)
            .await
            .map_err(|e| {
                HandlerError::Transient(anyhow::anyhow!("Failed to get trace spans: {}", e))
            })?;

        let extracted = extract_system_prompts(&ch_spans);
        let system_prompt_summaries = if extracted.is_empty() {
            HashMap::new()
        } else {
            let hashes: Vec<String> = extracted.keys().cloned().collect();
            let mut summaries =
                lookup_cached_summaries(&cache, project_id, signal_id, prompt, &hashes).await;

            let uncached: HashMap<String, String> = extracted
                .iter()
                .filter(|(h, _)| !summaries.contains_key(*h))
                .map(|(h, t)| (h.clone(), t.clone()))
                .collect();

            if !uncached.is_empty() {
                let model = llm_model();
                let generated = generate_and_cache_summaries(
                    &cache,
                    &llm_client,
                    &model,
                    project_id,
                    signal_id,
                    prompt,
                    &uncached,
                )
                .await;
                summaries.extend(generated);
            }

            summaries
        };

        let trace_structure =
            build_trace_structure_string(&ch_spans, trace_id, &system_prompt_summaries);

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
            serde_json::to_string(&system_content)
                .map_err(|e| log::error!("Failed to serialize system content: {}", e))
                .unwrap_or_default(),
        );

        let user_message = CHSignalRunMessage::new(
            project_id,
            run_id,
            user_time,
            serde_json::to_string(&user_content)
                .map_err(|e| log::error!("Failed to serialize user content: {}", e))
                .unwrap_or_default(),
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
            // Parse as Content object (all messages are stored in this format)
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

    // 3. Create ProviderRequest
    let request = ProviderRequestItem {
        request: ProviderRequest {
            contents: contents.clone(),
            system_instruction: system_instruction.clone(),
            tools: Some(tools),
            generation_config: Some(ProviderGenerationConfig {
                temperature: Some(1.0),
                thinking_config: Some(ProviderThinkingConfig {
                    include_thoughts: Some(true),
                    thinking_level: Some(ProviderThinkingLevel::Medium),
                }),
                ..Default::default()
            }),
        },
        metadata: Some(serde_json::json!({
            "run_id": run_id,
            "trace_id": trace_id,
        })),
    };

    Ok(ProcessRunResult {
        request,
        new_messages,
        request_start_time: processing_start_time,
    })
}
