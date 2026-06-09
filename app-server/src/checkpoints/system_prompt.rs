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
    traces::prompt_hash::structural_skeleton_hash,
};

const DYNAMIC_REGEX_TTL_SECONDS: u64 = 7 * 24 * 3600;

const REGEX_TOOL_NAME: &str = "extract_dynamic_regex";

const STABLE_PROMPT_INSTRUCTION: &str = r#"You separate an AI agent's system prompt into its STABLE template and the DYNAMIC values that change between runs. Call the extract_dynamic_regex tool with ONE regular expression (Rust `regex` crate syntax) that matches every dynamic value — and nothing else — so that deleting the matches leaves the rest of the prompt byte-for-byte identical.

Dynamic values are run-specific tokens such as: current date/time and timestamps, user names, session/request/run IDs, hashes, counters, hostnames, OS names, language/SDK version numbers, file paths, and environment names (development/staging/production).

Strict rules — follow them exactly so the output is identical on every run of the same template:
- MOST IMPORTANT — HARD BAN, no exceptions: every alternative in the regex MUST contain at least one literal anchor character that is NOT a letter, digit, or `_` — i.e. a literal substring of the surrounding text (a label like `cch=`, `=`, `:`, `/`, `-`, `.`, or a tag like `<id>`), OR a `\b` word boundary at each end. A pattern made only of character classes and quantifiers (e.g. `[a-z0-9]{5}`, `[a-f0-9]+`, `\w{6}`, `[a-z0-9]+` as a trailing segment) is FORBIDDEN — it matches inside ordinary words such as `needed`, `added`, `decade`, `tokens`, corrupting stable text. To strip a bare token/hash/id, anchor it to its label and put the variable part in a group, e.g. `cch=([a-f0-9]+)` or `\brun_[a-f0-9]+\b` — never the unanchored class alone. If a value has no stable neighboring literal you can anchor to, LEAVE IT IN rather than emit an unanchored class.
- Do NOT decompose a dotted/structured value into a fixed prefix plus a bare `[a-z0-9]+` tail (e.g. `\d+\.\d+\.\d+\.[a-z0-9]+`): the trailing unanchored class still matches inside words. Match the whole value with a single anchored pattern, or leave it.
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
os=Darwin version=3.13.9 cch=785c4; entrypoint=sdk-py

Correct regex (every alternative is anchored to a literal or a word boundary):
\brun_id>[a-f0-9]{16}|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z|\bos=Darwin|\bos=Linux|\bos=Windows|version=\d+\.\d+\.\d+|cch=[a-f0-9]+|entrypoint=sdk-py

Counter-examples (NEVER do any of these — each matches inside ordinary words):
- `[a-z0-9]{5}` → matches `eeded` in `needed`, `dable` in `findable`.
- `[a-f0-9]+` (bare) → matches `added`, `deed`, `face`.
- `\d+\.\d+\.\d+\.[a-z0-9]+` → the trailing `[a-z0-9]+` matches inside words.
- `sdk-py` is fine (it contains the literal `-`); `[a-z0-9]{5}` next to it is not.
Anchor the hash/id/token to its label instead (`cch=[a-f0-9]+`, `entrypoint=sdk-py`), or leave it in."#;

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
    let key = dynamic_regex_cache_key(project_id, system_prompt, prompt_hash);

    if let Ok(Some(cached)) = cache.get::<String>(&key).await {
        return Some(cached);
    }

    let mut pattern = generate_dynamic_regex(llm_client, system_prompt, root).await?;

    if !pattern.is_empty() && Regex::new(&pattern).is_err() {
        pattern = String::new();
    }
    let _ = cache.insert_with_ttl(&key, &pattern, DYNAMIC_REGEX_TTL_SECONDS).await;

    Some(pattern)
}

fn dynamic_regex_cache_key(project_id: Uuid, system_prompt: &str, prompt_hash: &str) -> String {
    let prompt_hash = if prompt_hash.is_empty() {
        structural_skeleton_hash(system_prompt)
    } else {
        prompt_hash.to_string()
    };
    format!("{AGENT_STABLE_PROMPT_REGEX_CACHE_KEY}:{project_id}:{prompt_hash}")
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
