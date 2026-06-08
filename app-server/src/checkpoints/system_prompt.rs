//! System-prompt processing for checkpoints: strip dynamic fragments via an
//! LLM-derived regex (cached per template) so the remainder is a stable
//! fingerprint of the agent's prompt.

use std::sync::Arc;

use regex::Regex;
use uuid::Uuid;

use crate::{
    cache::{Cache, CacheTrait, keys::AGENT_STABLE_PROMPT_REGEX_CACHE_KEY},
    checkpoints::observe::{CheckpointObserver, run_llm},
    llm::{
        LlmClient, ModelSize, ProviderContent, ProviderFunctionDeclaration,
        ProviderGenerationConfig, ProviderPart, ProviderRequest, ProviderTool,
    },
};

const DYNAMIC_REGEX_TTL_SECONDS: u64 = 30 * 24 * 3600;

const REGEX_TOOL_NAME: &str = "extract_dynamic_regex";

const STABLE_PROMPT_INSTRUCTION: &str =
    "You analyze an AI agent's system prompt. Some parts are dynamic — they change \
     between runs (current date or time, user names, session/request IDs, injected \
     runtime context, environment details, counters, file paths, etc.) — while the \
     rest is the stable template. Call the extract_dynamic_regex tool with a single \
     regular expression that matches every dynamic fragment, matching general \
     patterns (e.g. date formats) rather than literal values.";

/// Extract the non-dynamic (stable) portion of a system prompt. Best-effort:
/// with no LLM provider, or on any LLM / regex failure, returns it unchanged.
/// `prompt_hash` is the ingest-time skeleton hash keying the dynamic-regex cache.
pub async fn extract_stable_system_prompt(
    system_prompt: &str,
    prompt_hash: &str,
    project_id: Uuid,
    cache: Arc<Cache>,
    llm_client: Option<Arc<LlmClient>>,
    observer: Option<&CheckpointObserver>,
) -> String {
    let Some(llm_client) = llm_client else {
        return system_prompt.to_string();
    };

    let Some(pattern) = resolve_dynamic_regex(
        &cache,
        &llm_client,
        project_id,
        system_prompt,
        prompt_hash,
        observer,
    )
    .await
    else {
        return system_prompt.to_string();
    };

    // Empty pattern == no dynamic fragments.
    if pattern.is_empty() {
        return system_prompt.to_string();
    }

    let Ok(re) = Regex::new(&pattern) else {
        return system_prompt.to_string();
    };
    apply_dynamic_regex(&re, system_prompt)
}

/// Cached regex keyed by the template-stable skeleton hash, derived once via
/// the LLM on a miss.
async fn resolve_dynamic_regex(
    cache: &Cache,
    llm_client: &LlmClient,
    project_id: Uuid,
    system_prompt: &str,
    prompt_hash: &str,
    observer: Option<&CheckpointObserver>,
) -> Option<String> {
    if prompt_hash.is_empty() {
        return generate_dynamic_regex(llm_client, system_prompt, observer).await;
    }

    let key = format!("{AGENT_STABLE_PROMPT_REGEX_CACHE_KEY}:{project_id}:{prompt_hash}");

    if let Ok(Some(cached)) = cache.get::<String>(&key).await {
        return Some(cached);
    }

    let pattern = generate_dynamic_regex(llm_client, system_prompt, observer).await?;

    // Don't pin a broken regex for a month.
    if pattern.is_empty() || Regex::new(&pattern).is_ok() {
        let _ = cache.insert_with_ttl(&key, &pattern, DYNAMIC_REGEX_TTL_SECONDS).await;
    }

    Some(pattern)
}

async fn generate_dynamic_regex(
    llm_client: &LlmClient,
    system_prompt: &str,
    observer: Option<&CheckpointObserver>,
) -> Option<String> {
    let request = ProviderRequest {
        contents: vec![ProviderContent {
            role: Some("user".to_string()),
            parts: Some(vec![ProviderPart {
                text: Some(system_prompt.to_string()),
                ..Default::default()
            }]),
        }],
        system_instruction: Some(ProviderContent {
            role: None,
            parts: Some(vec![ProviderPart {
                text: Some(STABLE_PROMPT_INSTRUCTION.to_string()),
                ..Default::default()
            }]),
        }),
        tools: Some(vec![build_regex_tool()]),
        generation_config: Some(ProviderGenerationConfig {
            temperature: Some(0.0),
            ..Default::default()
        }),
        provider: None,
        model_size: Some(ModelSize::Small),
    };

    let response = match run_llm(observer, llm_client, "extract_stable_system_prompt", &request).await
    {
        Ok(response) => response,
        Err(e) => {
            log::warn!("[CHECKPOINTS] Dynamic-regex generation failed: {e:?}");
            return None;
        }
    };

    let regex = response
        .candidates
        .and_then(|c| c.into_iter().next())
        .and_then(|c| c.content)
        .and_then(|content| content.parts)
        .and_then(|parts| {
            parts
                .into_iter()
                .find_map(|p| p.function_call.filter(|fc| fc.name == REGEX_TOOL_NAME))
        })
        .and_then(|fc| fc.args)
        .and_then(|args| args.get("regex").and_then(|v| v.as_str()).map(String::from))
        .unwrap_or_default();

    Some(sanitize_regex(&regex))
}

fn build_regex_tool() -> ProviderTool {
    ProviderTool {
        function_declarations: vec![ProviderFunctionDeclaration {
            name: REGEX_TOOL_NAME.to_string(),
            description: "REQUIRED: submit a single Rust `regex` crate pattern matching the system \
                prompt's dynamic fragments. Always call this tool; never respond with plain text."
                .to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "regex": {
                        "type": "string",
                        "description": "A single regular expression (Rust regex syntax) matching every dynamic fragment (dates, times, ids, injected context, counters, file paths, etc.) so that removing the matches leaves the stable template. Match general patterns, not literal values. Empty string if there are no dynamic fragments."
                    }
                },
                "required": ["regex"]
            }),
        }],
    }
}

/// Strip code fences / surrounding backticks the model may wrap the regex in.
fn sanitize_regex(raw: &str) -> String {
    let trimmed = raw.trim();
    let trimmed = trimmed
        .strip_prefix("```regex")
        .or_else(|| trimmed.strip_prefix("```"))
        .unwrap_or(trimmed);
    let trimmed = trimmed.strip_suffix("```").unwrap_or(trimmed);
    trimmed.trim().trim_matches('`').trim().to_string()
}

fn apply_dynamic_regex(re: &Regex, system_prompt: &str) -> String {
    let stripped = re.replace_all(system_prompt, "");
    // Guard against a regex (e.g. `.*`) that would erase the whole prompt.
    if stripped.trim().is_empty() {
        return system_prompt.to_string();
    }
    stripped.into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_strips_fences_and_backticks() {
        assert_eq!(sanitize_regex("```regex\n\\d{4}-\\d{2}-\\d{2}\n```"), r"\d{4}-\d{2}-\d{2}");
        assert_eq!(sanitize_regex("`\\d+`"), r"\d+");
        assert_eq!(sanitize_regex("   \\w+  "), r"\w+");
        assert_eq!(sanitize_regex(""), "");
    }

    #[test]
    fn apply_strips_dynamic_fragments() {
        let re = Regex::new(r"\d{4}-\d{2}-\d{2}").unwrap();
        let out = apply_dynamic_regex(&re, "Today is 2024-01-15. Be helpful.");
        assert_eq!(out, "Today is . Be helpful.");
    }

    #[test]
    fn apply_falls_back_when_everything_stripped() {
        let re = Regex::new(r".*").unwrap();
        let prompt = "You are a helpful assistant.";
        assert_eq!(apply_dynamic_regex(&re, prompt), prompt);
    }
}
