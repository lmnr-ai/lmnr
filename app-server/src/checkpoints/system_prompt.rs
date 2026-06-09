//! Strip a system prompt's dynamic values via an LLM-derived regex (cached per
//! template) so the remainder is a stable fingerprint of the agent's prompt.

use std::sync::Arc;

use regex::Regex;
use uuid::Uuid;

use crate::{
    cache::{Cache, CacheTrait, keys::AGENT_STABLE_PROMPT_REGEX_CACHE_KEY},
    checkpoints::llm::{CheckpointRoot, run_llm},
    llm::{
        LlmClient, ModelSize, ProviderContent, ProviderFunctionDeclaration,
        ProviderGenerationConfig, ProviderPart, ProviderRequest, ProviderTool,
    },
};

const DYNAMIC_REGEX_TTL_SECONDS: u64 = 7 * 24 * 3600;

const REGEX_TOOL_NAME: &str = "extract_dynamic_regex";

const STABLE_PROMPT_INSTRUCTION: &str = r#"You separate an AI agent's system prompt into its STABLE template and the DYNAMIC values that change between runs. Call the extract_dynamic_regex tool with ONE regular expression (Rust `regex` crate syntax) that matches every dynamic value — and nothing else — so that deleting the matches leaves the rest of the prompt byte-for-byte identical.

Dynamic values are run-specific tokens such as: current date/time and timestamps, user names, session/request/run IDs, hashes, counters, hostnames, OS names, language/SDK version numbers, file paths, and environment names (development/staging/production).

Strict rules — follow them exactly so the output is identical on every run of the same template:
- Match ONLY the variable value itself. NEVER include surrounding structure in the match: leave XML/HTML tags, attribute names, JSON keys, field labels (e.g. `Model:`, `os=`), punctuation, quotes, and ALL whitespace and newlines untouched.
- For `<tag>VALUE</tag>` match only `VALUE`, so the result is `<tag></tag>`. For `key: VALUE` match only `VALUE`, so the result is `key: `.
- NEVER match an entire line, element, or block, and never delete a tag, key, or its indentation — strip only the value sitting between them. Emptying a tag is correct; collapsing or removing the whole element is wrong.
- Describe each value by its general FORMAT (e.g. an ISO-8601 timestamp pattern, or a hex string of a given length), not by its literal text, so it generalizes across runs.
- Use only features the Rust `regex` crate supports: NO look-around ((?=...), (?<=...)) and NO backreferences. An invalid pattern is discarded, leaving the dynamic values in place.
- Return an empty string only if the prompt contains no dynamic values at all.

Example input:
<runtime>
  <run_id>4f8c2a1b4d6e0f3a</run_id>
  <date>2026-06-09T10:26:50Z</date>
</runtime>
os=Darwin version=3.13.9

Correct regex:
[a-f0-9]{16}|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z|Darwin|Linux|Windows|\d+\.\d+\.\d+

Deleting its matches yields (tags, keys, and indentation preserved — only the values are gone):
<runtime>
  <run_id></run_id>
  <date></date>
</runtime>
os= version="#;

/// Stable portion of a system prompt; returns it unchanged on any LLM/regex failure.
pub async fn extract_stable_system_prompt(
    system_prompt: &str,
    prompt_hash: &str,
    project_id: Uuid,
    cache: Arc<Cache>,
    llm_client: Option<Arc<LlmClient>>,
    root: &CheckpointRoot,
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
        root,
    )
    .await
    else {
        return system_prompt.to_string();
    };

    if pattern.is_empty() {
        return system_prompt.to_string();
    }

    let Ok(re) = Regex::new(&pattern) else {
        return system_prompt.to_string();
    };
    apply_dynamic_regex(&re, system_prompt)
}

/// Cached regex keyed by the skeleton hash, derived via the LLM on a miss.
async fn resolve_dynamic_regex(
    cache: &Cache,
    llm_client: &LlmClient,
    project_id: Uuid,
    system_prompt: &str,
    prompt_hash: &str,
    root: &CheckpointRoot,
) -> Option<String> {
    if prompt_hash.is_empty() {
        return generate_dynamic_regex(llm_client, system_prompt, root).await;
    }

    let key = format!("{AGENT_STABLE_PROMPT_REGEX_CACHE_KEY}:{project_id}:{prompt_hash}");

    if let Ok(Some(cached)) = cache.get::<String>(&key).await {
        return Some(cached);
    }

    let pattern = generate_dynamic_regex(llm_client, system_prompt, root).await?;

    // Don't pin a broken regex for a week.
    if pattern.is_empty() || Regex::new(&pattern).is_ok() {
        let _ = cache.insert_with_ttl(&key, &pattern, DYNAMIC_REGEX_TTL_SECONDS).await;
    }

    Some(pattern)
}

async fn generate_dynamic_regex(
    llm_client: &LlmClient,
    system_prompt: &str,
    root: &CheckpointRoot,
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

    let response = match run_llm(root, llm_client, &request, || {
        tracing::info_span!(target: "lmnr::internal", "extract_stable_system_prompt")
    })
    .await
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
                prompt's dynamic values. Always call this tool; never respond with plain text."
                .to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "regex": {
                        "type": "string",
                        "description": "A single Rust `regex` crate pattern matching every dynamic VALUE (dates, times, ids, hashes, version numbers, hostnames, file paths, environment names, etc.) and NOTHING else. Match only the value, never the surrounding tags/keys/labels/punctuation/whitespace, so `<tag>VALUE</tag>` becomes `<tag></tag>` and `key: VALUE` becomes `key: `. Never match a whole line, element, or block. Describe values by general format, not literal text. No look-around or backreferences. Empty string only if there are no dynamic values."
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

    /// A value-only regex empties each tag but leaves scaffolding/indentation intact.
    #[test]
    fn value_only_regex_preserves_scaffolding() {
        let re = Regex::new(
            r"[a-f0-9]{32}|[a-f0-9]{16}|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|development|production|staging|[a-zA-Z0-9.-]+\.local|Darwin|Linux|Windows|\d+\.\d+\.\d+",
        )
        .unwrap();
        let prompt = concat!(
            "  <runtime_context>\n",
            "    <run_id>793bd57841817dc3aaa2c60cf6af39cc</run_id>\n",
            "    <timestamp_utc>2026-06-09T10:26:50Z</timestamp_utc>\n",
            "    <weekday>Tuesday</weekday>\n",
            "    <environment>development</environment>\n",
            "    <python>3.13.9</python>\n",
            "  </runtime_context>",
        );
        let expected = concat!(
            "  <runtime_context>\n",
            "    <run_id></run_id>\n",
            "    <timestamp_utc></timestamp_utc>\n",
            "    <weekday></weekday>\n",
            "    <environment></environment>\n",
            "    <python></python>\n",
            "  </runtime_context>",
        );
        assert_eq!(apply_dynamic_regex(&re, prompt), expected);
    }
}
