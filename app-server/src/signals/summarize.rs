use std::collections::HashMap;
use std::fmt::Write;
use std::sync::Arc;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha3::{Digest, Sha3_256};
use uuid::Uuid;

use crate::cache::keys::SYS_PROMPT_SUMMARY_CACHE_KEY;
use crate::cache::{Cache, CacheTrait};
use crate::db::spans::SpanType;
use crate::mq::MessageQueue;
use crate::signals::prompts::BATCH_SUMMARIZATION_PROMPT;
use crate::signals::provider::models::{
    ProviderContent, ProviderFunctionDeclaration, ProviderGenerationConfig, ProviderPart,
    ProviderRequest, ProviderTool,
};
use crate::signals::provider::{LlmClient, ProviderThinkingConfig, ProviderThinkingLevel};
use crate::signals::spans::ExtractedSystemPrompt;
use crate::signals::utils::{
    InternalSpan, emit_internal_span, request_to_span_input, request_to_tools_attr,
    structural_skeleton_hash,
};

const SUMMARY_CACHE_TTL_SECONDS: u64 = 30 * 24 * 60 * 60; // 30 days

pub fn hash_signal_prompt(signal_prompt: &str) -> String {
    let digest = Sha3_256::digest(signal_prompt.as_bytes());
    format!("{:x}", digest)[..8].to_string()
}

fn combined_prompts_hash(prompt_hashes: &[&str]) -> String {
    let mut sorted: Vec<&str> = prompt_hashes.to_vec();
    sorted.sort();
    let joined = sorted.join(":");
    let digest = Sha3_256::digest(joined.as_bytes());
    format!("{:x}", digest)[..8].to_string()
}

fn cache_key(
    project_id: Uuid,
    signal_id: Uuid,
    signal_prompt_hash: &str,
    prompts_hash: &str,
) -> String {
    format!(
        "{SYS_PROMPT_SUMMARY_CACHE_KEY}:{project_id}:{signal_id}:{signal_prompt_hash}:{prompts_hash}"
    )
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SummarizationResult {
    pub summaries: HashMap<String, String>,
    /// Hash of the main agent's compressed summary text (stable across dynamic prompt content)
    pub fingerprint: Option<String>,
}

fn build_prompts_section(extracted: &HashMap<String, ExtractedSystemPrompt>) -> String {
    let mut out = String::new();
    for (hash, prompt) in extracted {
        let _ = writeln!(out, "<prompt id=\"sp_{hash}\" path=\"{}\">", prompt.path);
        let _ = writeln!(out, "{}", prompt.text);
        let _ = writeln!(out, "</prompt>");
        let _ = writeln!(out);
    }
    out
}

fn build_summarization_tool() -> Vec<ProviderTool> {
    vec![ProviderTool {
        function_declarations: vec![ProviderFunctionDeclaration {
            name: "summarize_system_prompts".to_string(),
            description: concat!(
                "Submit compressed summaries for all system prompts and identify which one ",
                "belongs to the main/core agent. Exactly one prompt must be marked as the main agent prompt."
            )
            .to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "summaries": {
                        "type": "array",
                        "description": "One entry per system prompt. Must include all prompts provided.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "prompt_id": {
                                    "type": "string",
                                    "description": "The prompt ID (e.g. 'sp_abc12345') as provided in the input."
                                },
                                "summary": {
                                    "type": "string",
                                    "description": "Compressed summary retaining only signal-relevant information."
                                },
                                "is_main_agent_prompt": {
                                    "type": "boolean",
                                    "description": "True for exactly one prompt — the core/primary agent orchestrating the trace."
                                }
                            },
                            "required": ["prompt_id", "summary", "is_main_agent_prompt"]
                        }
                    }
                },
                "required": ["summaries"]
            }),
        }],
    }]
}

fn parse_summarization_response(
    response: &crate::signals::provider::models::ProviderResponse,
    extracted: &HashMap<String, ExtractedSystemPrompt>,
) -> SummarizationResult {
    let mut summaries = HashMap::new();
    let mut main_agent_summary: Option<String> = None;

    let parts = response
        .candidates
        .as_ref()
        .and_then(|c| c.first())
        .and_then(|c| c.content.as_ref())
        .and_then(|c| c.parts.as_ref());

    if let Some(parts) = parts {
        for part in parts {
            let Some(fc) = &part.function_call else {
                continue;
            };
            if fc.name != "summarize_system_prompts" {
                continue;
            }
            let Some(args) = &fc.args else {
                continue;
            };
            let Some(arr) = args.get("summaries").and_then(|s| s.as_array()) else {
                continue;
            };
            for item in arr {
                let prompt_id = item
                    .get("prompt_id")
                    .and_then(|p| p.as_str())
                    .unwrap_or_default();
                let summary = item
                    .get("summary")
                    .and_then(|s| s.as_str())
                    .unwrap_or_default();
                let is_main = item
                    .get("is_main_agent_prompt")
                    .and_then(|b| b.as_bool())
                    .unwrap_or(false);

                let hash = prompt_id.strip_prefix("sp_").unwrap_or(prompt_id);
                if !extracted.contains_key(hash) || summary.is_empty() {
                    continue;
                }
                if is_main {
                    main_agent_summary = Some(summary.to_string());
                }
                summaries.insert(hash.to_string(), summary.to_string());
            }
        }
    }

    let fingerprint = main_agent_summary.map(|s| structural_skeleton_hash(&s));

    SummarizationResult {
        summaries,
        fingerprint,
    }
}

/// Summarize all extracted system prompts and identify the main agent prompt.
/// Uses a single combined cache key. On hit, returns cached result.
/// On miss, makes one LLM call to summarize all prompts together.
pub async fn summarize_system_prompts(
    cache: &Arc<Cache>,
    llm_client: &Arc<LlmClient>,
    queue: Arc<MessageQueue>,
    internal_project_id: Option<Uuid>,
    project_id: Uuid,
    signal_id: Uuid,
    signal_prompt: &str,
    extracted: &HashMap<String, ExtractedSystemPrompt>,
) -> SummarizationResult {
    if extracted.is_empty() {
        log::info!("No system prompts extracted from trace, skipping summarization");
        return SummarizationResult {
            summaries: HashMap::new(),
            fingerprint: None,
        };
    }

    let sig_hash = hash_signal_prompt(signal_prompt);
    let skeleton_hashes: Vec<String> = extracted
        .values()
        .map(|p| structural_skeleton_hash(&p.text))
        .collect();
    let skeleton_refs: Vec<&str> = skeleton_hashes.iter().map(|s| s.as_str()).collect();
    let prompts_hash = combined_prompts_hash(&skeleton_refs);
    let key = cache_key(project_id, signal_id, &sig_hash, &prompts_hash);

    if let Ok(Some(cached)) = cache.get::<SummarizationResult>(&key).await {
        log::info!(
            "Using cached summarization result for {} prompts (skeleton={})",
            extracted.len(),
            prompts_hash,
        );
        return cached;
    }

    log::info!(
        "Summarization cache miss for {} prompts (skeleton={}), generating. project_id={}, signal_id={}",
        extracted.len(),
        prompts_hash,
        project_id,
        signal_id,
    );

    let start_time = Utc::now();

    let prompts_section = build_prompts_section(extracted);
    let user_prompt = BATCH_SUMMARIZATION_PROMPT
        .replace("{{signal_prompt}}", signal_prompt)
        .replace("{{prompts_section}}", &prompts_section);

    let request = ProviderRequest {
        contents: vec![ProviderContent {
            role: Some("user".to_string()),
            parts: Some(vec![ProviderPart {
                text: Some(user_prompt),
                ..Default::default()
            }]),
        }],
        system_instruction: None,
        tools: Some(build_summarization_tool()),
        generation_config: Some(ProviderGenerationConfig {
            temperature: Some(1.0),
            max_output_tokens: Some(4096),
            thinking_config: Some(ProviderThinkingConfig {
                include_thoughts: Some(false),
                thinking_level: Some(ProviderThinkingLevel::Medium),
            }),
            ..Default::default()
        }),
        provider: None,
        model_size: None,
    };

    let span_input = request_to_span_input(&request);
    let span_tools = request_to_tools_attr(&request);

    let (result, error) = match llm_client.generate_content(&request).await {
        Ok(response) => {
            let result = parse_summarization_response(&response, extracted);
            (Some((result, response.usage_metadata)), None)
        }
        Err(e) => {
            log::error!("LLM call failed for batch summarization: {}", e);
            (None, Some(format!("{}", e)))
        }
    };

    let usage = result.as_ref().and_then(|(_, u)| u.as_ref());

    emit_internal_span(
        queue,
        InternalSpan {
            name: "summarize_system_prompts".to_string(),
            trace_id: Uuid::new_v4(),
            run_id: Uuid::nil(),
            signal_name: String::new(),
            parent_span_id: None,
            span_type: SpanType::LLM,
            start_time,
            input: Some(span_input),
            output: result.as_ref().map(|(r, _)| serde_json::json!(r)),
            input_tokens: usage.and_then(|u| u.prompt_token_count),
            input_cached_tokens: usage.and_then(|u| u.cache_read_input_tokens),
            output_tokens: usage.and_then(|u| u.candidates_token_count),
            model: "gemini-3-flash-preview".to_string(),
            provider: "gemini".to_string(),
            internal_project_id,
            job_id: None,
            error,
            provider_batch_id: None,
            metadata: Some(
                serde_json::json!({
                    "project_id": project_id,
                    "signal_id": signal_id,
                })
                .as_object()
                .unwrap()
                .iter()
                .map(|(k, v)| (k.to_string(), v.clone()))
                .collect(),
            ),
            tools: span_tools,
        },
    )
    .await;

    let result = match result {
        Some((r, _)) => {
            if let Err(e) = cache
                .insert_with_ttl(&key, r.clone(), SUMMARY_CACHE_TTL_SECONDS)
                .await
            {
                log::warn!("Failed to cache summarization result: {:?}", e);
            }
            r
        }
        None => SummarizationResult {
            summaries: HashMap::new(),
            fingerprint: None,
        },
    };

    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::signals::provider::models::*;

    fn make_extracted(
        pairs: &[(&str, &str)],
    ) -> HashMap<String, ExtractedSystemPrompt> {
        pairs
            .iter()
            .map(|(text, path)| {
                let hash = structural_skeleton_hash(text);
                (
                    hash,
                    ExtractedSystemPrompt {
                        text: text.to_string(),
                        path: path.to_string(),
                    },
                )
            })
            .collect()
    }

    fn make_llm_response(summaries_json: serde_json::Value) -> ProviderResponse {
        ProviderResponse {
            candidates: Some(vec![ProviderCandidate {
                content: Some(ProviderContent {
                    role: Some("model".to_string()),
                    parts: Some(vec![ProviderPart {
                        function_call: Some(ProviderFunctionCall {
                            id: None,
                            name: "summarize_system_prompts".to_string(),
                            args: Some(summaries_json),
                        }),
                        ..Default::default()
                    }]),
                }),
                finish_reason: Some(ProviderFinishReason::Stop),
            }]),
            usage_metadata: None,
            model_version: None,
        }
    }

    #[test]
    fn test_dynamic_content_produces_same_hash() {
        let text_v1 = "You are a browser automation agent.\n<config>Model: gpt-4</config>";
        let text_v2 = "You are a browser automation agent.\n<config>Model: claude-3</config>";

        assert_eq!(
            structural_skeleton_hash(text_v1),
            structural_skeleton_hash(text_v2),
            "Same template with different dynamic content should produce the same hash"
        );

        let extracted_v1 = make_extracted(&[(text_v1, "agent.llm")]);
        let extracted_v2 = make_extracted(&[(text_v2, "agent.llm")]);

        assert_eq!(
            extracted_v1.keys().collect::<Vec<_>>(),
            extracted_v2.keys().collect::<Vec<_>>(),
            "Both traces should have the same extracted map keys"
        );
    }

    #[test]
    fn test_parse_response_and_cache_hit() {
        let text_v1 = "You are a browser automation agent.\n<config>Model: gpt-4</config>";
        let extracted_v1 = make_extracted(&[(text_v1, "agent.llm")]);
        let hash = structural_skeleton_hash(text_v1);

        let response = make_llm_response(serde_json::json!({
            "summaries": [{
                "prompt_id": format!("sp_{}", hash),
                "summary": "Browser automation agent that automates web tasks",
                "is_main_agent_prompt": true
            }]
        }));

        let result = parse_summarization_response(&response, &extracted_v1);
        assert_eq!(result.summaries.len(), 1);
        assert!(result.fingerprint.is_some());
        assert_eq!(
            result.summaries.get(&hash).unwrap(),
            "Browser automation agent that automates web tasks"
        );

        // Simulate cache hit for trace 2 with different config
        let text_v2 = "You are a browser automation agent.\n<config>Model: claude-3</config>";
        let hash_v2 = structural_skeleton_hash(text_v2);
        assert_eq!(hash, hash_v2, "Same skeleton hash");

        // The cached result works directly -- no remap needed
        assert!(
            result.summaries.contains_key(&hash_v2),
            "Cached summaries should be directly usable for trace 2"
        );
    }

    #[test]
    fn test_parse_response_multiple_prompts() {
        let main_text = "You are the main orchestrator agent.\n<tools>search</tools>";
        let sub_text = "You are a helper sub-agent.\n<rules>be concise</rules>";
        let extracted = make_extracted(&[
            (main_text, "agent.llm"),
            (sub_text, "agent.sub.llm"),
        ]);
        let main_hash = structural_skeleton_hash(main_text);
        let sub_hash = structural_skeleton_hash(sub_text);

        let response = make_llm_response(serde_json::json!({
            "summaries": [
                {
                    "prompt_id": format!("sp_{}", main_hash),
                    "summary": "Main orchestrator",
                    "is_main_agent_prompt": true
                },
                {
                    "prompt_id": format!("sp_{}", sub_hash),
                    "summary": "Helper sub-agent",
                    "is_main_agent_prompt": false
                }
            ]
        }));

        let result = parse_summarization_response(&response, &extracted);
        assert_eq!(result.summaries.len(), 2);
        assert!(result.fingerprint.is_some());
        assert_eq!(result.summaries.get(&main_hash).unwrap(), "Main orchestrator");
        assert_eq!(result.summaries.get(&sub_hash).unwrap(), "Helper sub-agent");
    }
}
