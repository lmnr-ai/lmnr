//! System-prompt processing for checkpoints: strip dynamic fragments via an
//! LLM-derived regex (cached per template) so the remainder is a stable
//! fingerprint of the agent's prompt.

use std::sync::Arc;

use regex::Regex;
use uuid::Uuid;

use crate::{
    cache::{Cache, CacheTrait, keys::AGENT_STABLE_PROMPT_REGEX_CACHE_KEY},
    llm::{LlmClient, ModelSize, ProviderContent, ProviderGenerationConfig, ProviderPart, ProviderRequest},
    traces::prompt_hash::structural_skeleton_hash,
};

const DYNAMIC_REGEX_TTL_SECONDS: u64 = 30 * 24 * 3600;

const STABLE_PROMPT_INSTRUCTION: &str =
    "You analyze the system prompt of an AI agent. Some parts are dynamic — they \
     change between runs (current date or time, user names, session/request IDs, \
     injected runtime context, environment details, counters, file paths, etc.) — \
     while the rest is the stable template. Produce a single regular expression in \
     Rust `regex` crate syntax that matches every dynamic fragment, so that removing \
     the matches leaves only the stable template. Match the general patterns (e.g. \
     date formats), not the specific literal values. Respond with ONLY the regular \
     expression on a single line: no explanation, no code fences. If there are no \
     dynamic fragments, respond with an empty string.";

/// Extract the non-dynamic (stable) portion of a system prompt. Best-effort:
/// with no LLM provider, or on any LLM / regex failure, returns it unchanged.
pub async fn extract_stable_system_prompt(
    system_prompt: &str,
    project_id: Uuid,
    cache: Arc<Cache>,
    llm_client: Option<Arc<LlmClient>>,
) -> String {
    let Some(llm_client) = llm_client else {
        return system_prompt.to_string();
    };

    let Some(pattern) = resolve_dynamic_regex(&cache, &llm_client, project_id, system_prompt).await
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
) -> Option<String> {
    let key = format!(
        "{AGENT_STABLE_PROMPT_REGEX_CACHE_KEY}:{project_id}:{}",
        structural_skeleton_hash(system_prompt)
    );

    if let Ok(Some(cached)) = cache.get::<String>(&key).await {
        return Some(cached);
    }

    let pattern = generate_dynamic_regex(llm_client, system_prompt).await?;

    // Don't pin a broken regex for a month.
    if pattern.is_empty() || Regex::new(&pattern).is_ok() {
        let _ = cache.insert_with_ttl(&key, &pattern, DYNAMIC_REGEX_TTL_SECONDS).await;
    }

    Some(pattern)
}

async fn generate_dynamic_regex(llm_client: &LlmClient, system_prompt: &str) -> Option<String> {
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
        tools: None,
        generation_config: Some(ProviderGenerationConfig {
            temperature: Some(0.0),
            ..Default::default()
        }),
        provider: None,
        model_size: Some(ModelSize::Small),
    };

    let response = match llm_client.generate_content(&request).await {
        Ok(response) => response,
        Err(e) => {
            log::warn!("[CHECKPOINTS] Dynamic-regex generation failed: {e:?}");
            return None;
        }
    };

    let text = response
        .candidates
        .and_then(|c| c.into_iter().next())
        .and_then(|c| c.content)
        .and_then(|content| content.parts)
        .and_then(|parts| parts.into_iter().find_map(|p| p.text))
        .unwrap_or_default();

    Some(sanitize_regex(&text))
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
