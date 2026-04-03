use std::collections::HashMap;
use std::sync::Arc;

use uuid::Uuid;

use crate::cache::keys::SYS_PROMPT_SUMMARY_CACHE_KEY;
use crate::cache::{Cache, CacheTrait};
use crate::signals::provider::models::{
    ProviderContent, ProviderGenerationConfig, ProviderPart, ProviderRequest,
};
use crate::signals::provider::{LanguageModelClient, ProviderClient};
use crate::signals::provider::{ProviderThinkingConfig, ProviderThinkingLevel};

const SUMMARY_CACHE_TTL_SECONDS: u64 = 30 * 24 * 60 * 60; // 30 days

const SUMMARIZATION_PROMPT: &str = r#"Given this signal description that a developer wants to detect in traces:
<signal_description>
{{signal_prompt}}
</signal_description>

Compress the following system prompt from an LLM application. Retain only information relevant to detecting the above signal. Keep essential rules, constraints, and behavioral instructions that relate to the signal. Remove boilerplate, examples, formatting, and irrelevant details. Every sentence must be complete — never cut off mid-sentence or mid-word. Output ONLY the compressed text, nothing else.

<system_prompt>
{{system_prompt}}
</system_prompt>"#;

fn cache_key(project_id: Uuid, signal_id: Uuid, prompt_hash: &str) -> String {
    format!("{SYS_PROMPT_SUMMARY_CACHE_KEY}:{project_id}:{signal_id}:{prompt_hash}")
}

/// Look up cached summaries for a set of system prompt hashes.
/// Returns a map of `hash -> summary` for all hits.
pub async fn lookup_cached_summaries(
    cache: &Arc<Cache>,
    project_id: Uuid,
    signal_id: Uuid,
    hashes: &[String],
) -> HashMap<String, String> {
    let mut result = HashMap::new();
    for hash in hashes {
        let key = cache_key(project_id, signal_id, hash);
        match cache.get::<String>(&key).await {
            Ok(Some(summary)) => {
                result.insert(hash.clone(), summary);
            }
            Ok(None) => {}
            Err(e) => {
                log::warn!(
                    "Cache read error for system prompt summary {}: {:?}",
                    hash,
                    e
                );
            }
        }
    }
    log::info!("Lookup cached summaries: {:?}", result);
    result
}

/// Generate summaries for uncached system prompts and store them in cache.
/// Returns the generated summaries as `hash -> summary`.
pub async fn generate_and_cache_summaries(
    cache: &Arc<Cache>,
    llm_client: &Arc<ProviderClient>,
    model: &str,
    project_id: Uuid,
    signal_id: Uuid,
    signal_prompt: &str,
    uncached: &HashMap<String, String>, // hash -> full system prompt text
) -> HashMap<String, String> {
    let mut result = HashMap::new();
    for (hash, sys_prompt_text) in uncached {
        match generate_summary(llm_client, model, signal_prompt, sys_prompt_text).await {
            Ok(summary) => {
                let key = cache_key(project_id, signal_id, hash);
                if let Err(e) = cache
                    .insert_with_ttl(&key, summary.clone(), SUMMARY_CACHE_TTL_SECONDS)
                    .await
                {
                    log::warn!("Failed to cache system prompt summary {}: {:?}", hash, e);
                }
                result.insert(hash.clone(), summary);
            }
            Err(e) => {
                log::error!(
                    "Failed to generate system prompt summary for {}: {:?}",
                    hash,
                    e
                );
            }
        }
    }
    result
}

async fn generate_summary(
    llm_client: &Arc<ProviderClient>,
    model: &str,
    signal_prompt: &str,
    system_prompt_text: &str,
) -> anyhow::Result<String> {
    let user_prompt = SUMMARIZATION_PROMPT
        .replace("{{signal_prompt}}", signal_prompt)
        .replace("{{system_prompt}}", system_prompt_text);

    let request = ProviderRequest {
        contents: vec![ProviderContent {
            role: Some("user".to_string()),
            parts: Some(vec![ProviderPart {
                text: Some(user_prompt),
                ..Default::default()
            }]),
        }],
        system_instruction: None,
        tools: None,
        generation_config: Some(ProviderGenerationConfig {
            temperature: Some(0.0),
            max_output_tokens: Some(2048),
            thinking_config: Some(ProviderThinkingConfig {
                include_thoughts: Some(false),
                thinking_level: Some(ProviderThinkingLevel::Minimal),
            }),
            ..Default::default()
        }),
    };

    let response = llm_client
        .generate_content(model, &request)
        .await
        .map_err(|e| anyhow::anyhow!("LLM call failed for system prompt summary: {}", e))?;

    let text = response
        .candidates
        .as_ref()
        .and_then(|c| c.first())
        .and_then(|c| c.content.as_ref())
        .and_then(|c| c.parts.as_ref())
        .and_then(|p| p.iter().find_map(|part| part.text.as_deref()))
        .unwrap_or("")
        .trim()
        .to_string();

    if text.is_empty() {
        anyhow::bail!("LLM returned empty summary");
    }

    Ok(text)
}
