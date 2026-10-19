//! Direct LLM extraction of the user's task — the fallback when the prompt's
//! version carries no regex yet, or has no version at all.
//!
//! Deliberately regex-free. It runs once per trace whose cohort has no regex,
//! which is the same event that fills the accumulator, so the two costs are one
//! cost. Output is plain text: an empty reply IS the "pure scaffolding, no user
//! request" verdict, which removes the JSON schema (and its malformed-response
//! failure mode) that a structured `{found, text}` would need.
//!
//! Results are cached briefly by text ([`cached_direct_result`]): identical
//! texts arrive in bursts (fan-outs, retry storms, cron jobs), and the result
//! depends on the text alone.
//!
//! This is not a stopgap — nothing re-extracts a trace once a real regex lands,
//! so it is the permanent extraction path for the early traces of every version.

use std::sync::Arc;

use uuid::Uuid;

use super::generate::call_llm;
use super::regex::ApplyRegexResult;
use super::self_tracing::SpanScope;
use crate::cache::keys::USER_TASK_DIRECT_RESULT_CACHE_KEY;
use crate::cache::{Cache, CacheTrait};
use crate::llm::models::{
    ProviderContent, ProviderGenerationConfig, ProviderPart, ProviderRequest, ProviderResponse,
};
use crate::llm::{LlmClient, LlmFeature, LlmRoute};

/// Self-tracing span name; must be one of the literals
/// `self_tracing::SpanBuilder::llm` matches on.
const EXTRACT_SPAN_NAME: &str = "extract_user_task";

/// Generous enough for a long pasted document to be echoed back verbatim — the
/// prompt asks for a copy of the instruction, not a summary.
const MAX_OUTPUT_TOKENS: i32 = 8192;

/// Repeats of one text are mostly seconds apart, so a short TTL catches nearly
/// all of them without holding a cache entry per extracted text for long.
const DIRECT_RESULT_CACHE_TTL_SECONDS: u64 = 5 * 60;

const DIRECT_EXTRACTION_SYSTEM_PROMPT: &str = r#"# Task

You are shown ONE message that was sent as input to an AI agent. Reply with the instruction the agent was asked to carry out, and nothing else.

# The template model

Messages like this one are produced by templates. A harness takes an instruction (written by a person, a parent agent, a ticket, a bot) and assembles the final message by inserting it — together with injected material such as environment info, file contents, tool inventories, reminders, and metadata — into a fixed layout.

Return ONLY the instruction, copied VERBATIM from the message. Do not summarize it, rephrase it, translate it, shorten it, or wrap it in quotes, labels, or commentary.

# What to discard

Injected blocks are delimited in whatever syntax the harness happened to pick, and the syntax itself carries no meaning. XML-like tags, delimiter lines ("=== ENVIRONMENT ==="), markdown headings, ALL-CAPS labels, bracketed section headers, and JSON envelopes all play the same role. Classify every marker by its FUNCTION — does it delimit injected material, or the instruction? — never by its syntax.

Two traps are easy to fall into, because both kinds of text change from message to message:
- Content the requester provided for the agent to work on — a pasted document, quoted text, embedded data they want processed — is part of the instruction. KEEP it.
- Injected DYNAMIC STATE — a live current-state summary, a snapshot of some external system, tool output, "current page contents", a data dump attached for the agent's situational awareness — was never authored by the requester. DISCARD it, however large or specific it looks.

Do not use "changes per message" as a proxy for "is the instruction". Ask instead: did the requester write or provide this themselves as part of what they want done, or did the harness attach it as background the agent might need?

Markup living INSIDE the instruction (HTML or markdown in a quoted PR body, bot comment, or pasted document) is part of its content, not scaffolding.

The message may carry "== lmnr_part_separator ==" lines separating sibling message parts. Ignore them and do not reproduce them.

# Output

Reply with the instruction text alone — no preamble, no explanation, no code fence, no surrounding quotes.

If the message is genuinely pure scaffolding with no instruction anywhere in it, reply with nothing at all. That is rare: the message was sent to an agent, so it almost always carries an instruction. Look inside the injected blocks before concluding there is none."#;

/// Extract the user's task in one call. `None` means the call failed outright
/// (retry budget exhausted or a non-retryable provider error) — the caller must
/// then publish NOTHING, leaving `lmnr_user_task` absent, which is the encoding
/// for "extraction never ran". Writing an empty string there instead would claim
/// the message had no user request.
pub async fn extract_user_task_directly(
    llm_client: &Arc<LlmClient>,
    signposted_text: &str,
    scope: &SpanScope,
) -> Option<ApplyRegexResult> {
    let request = build_request(signposted_text, scope.source_project_id);
    let response = match call_llm(llm_client, &request, scope, EXTRACT_SPAN_NAME).await {
        Ok(response) => response,
        Err(e) => {
            log::warn!("user-task: direct extraction failed: {e:?}");
            return None;
        }
    };

    Some(match response_text(&response).trim() {
        "" => ApplyRegexResult::NoUserRequest,
        task => ApplyRegexResult::Extracted(task.to_string()),
    })
}

fn direct_result_cache_key(project_id: Uuid, signposted_text: &str) -> String {
    let hash = hex::encode(blake3::hash(signposted_text.as_bytes()).as_bytes());
    format!(
        "{USER_TASK_DIRECT_RESULT_CACHE_KEY}:{project_id}:{}",
        &hash[..32]
    )
}

/// A recent direct extraction of this exact text. Stored as the reply text, so
/// an empty entry is the "no user request" verdict, as in the LLM reply itself.
pub async fn cached_direct_result(
    cache: &Cache,
    project_id: Uuid,
    signposted_text: &str,
) -> Option<ApplyRegexResult> {
    let key = direct_result_cache_key(project_id, signposted_text);
    let task = cache.get::<String>(&key).await.ok().flatten()?;
    Some(if task.is_empty() {
        ApplyRegexResult::NoUserRequest
    } else {
        ApplyRegexResult::Extracted(task)
    })
}

/// Best-effort — a failed write only costs the next identical text a call.
pub async fn cache_direct_result(
    cache: &Cache,
    project_id: Uuid,
    signposted_text: &str,
    result: &ApplyRegexResult,
) {
    let task = match result {
        ApplyRegexResult::Extracted(task) => task.as_str(),
        ApplyRegexResult::NoUserRequest => "",
        ApplyRegexResult::NoMatch => return,
    };
    let key = direct_result_cache_key(project_id, signposted_text);
    if let Err(e) = cache
        .insert_with_ttl(&key, task, DIRECT_RESULT_CACHE_TTL_SECONDS)
        .await
    {
        log::warn!("user-task: failed to cache direct extraction result: {e:?}");
    }
}

/// Concatenated answer text, skipping thought parts (a thinking model would
/// otherwise have its reasoning stored as the user's task).
fn response_text(response: &ProviderResponse) -> String {
    response
        .candidates
        .iter()
        .flatten()
        .filter_map(|candidate| candidate.content.as_ref())
        .filter_map(|content| content.parts.as_deref())
        .flatten()
        .filter(|part| !part.thought.unwrap_or(false))
        .filter_map(|part| part.text.as_deref())
        .collect::<Vec<_>>()
        .join("")
}

fn build_request(signposted_text: &str, project_id: Uuid) -> ProviderRequest {
    ProviderRequest {
        contents: vec![ProviderContent {
            role: Some("user".to_string()),
            parts: Some(vec![ProviderPart {
                text: Some(signposted_text.to_string()),
                ..Default::default()
            }]),
        }],
        system_instruction: Some(ProviderContent {
            role: None,
            parts: Some(vec![ProviderPart {
                text: Some(DIRECT_EXTRACTION_SYSTEM_PROMPT.to_string()),
                ..Default::default()
            }]),
        }),
        tools: None,
        generation_config: Some(ProviderGenerationConfig {
            temperature: Some(1.0),
            max_output_tokens: Some(MAX_OUTPUT_TOKENS),
            ..Default::default()
        }),
        service_tier: None,
        // Its own feature so it can be routed to a cheap model: this fires per
        // trace until a cohort's regex lands, so it is the recurring cost of
        // the pipeline.
        route: LlmRoute::feature(LlmFeature::InputExtractionDirect, Some(project_id)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::llm::models::{ProviderCandidate, ProviderContent};

    fn response_with(parts: Vec<ProviderPart>) -> ProviderResponse {
        ProviderResponse {
            candidates: Some(vec![ProviderCandidate {
                content: Some(ProviderContent {
                    role: Some("model".to_string()),
                    parts: Some(parts),
                }),
                finish_reason: None,
            }]),
            usage_metadata: None,
            model_version: None,
        }
    }

    fn text_part(text: &str) -> ProviderPart {
        ProviderPart {
            text: Some(text.to_string()),
            ..Default::default()
        }
    }

    #[test]
    fn response_text_concatenates_answer_parts() {
        let response = response_with(vec![text_part("do the "), text_part("thing")]);
        assert_eq!(response_text(&response), "do the thing");
    }

    #[test]
    fn response_text_skips_thoughts() {
        let mut thought = text_part("let me reason about this");
        thought.thought = Some(true);
        let response = response_with(vec![thought, text_part("the real task")]);
        assert_eq!(response_text(&response), "the real task");
    }

    #[test]
    fn empty_response_is_the_no_user_request_verdict() {
        let response = response_with(vec![text_part("   ")]);
        assert_eq!(response_text(&response).trim(), "");
    }

    fn make_cache() -> Cache {
        Cache::InMemory(crate::cache::in_memory::InMemoryCache::new(None))
    }

    #[tokio::test]
    async fn cached_results_round_trip() {
        let cache = make_cache();
        let project_id = Uuid::new_v4();
        for (text, result) in [
            (
                "fix the bug",
                ApplyRegexResult::Extracted("fix the bug".to_string()),
            ),
            ("<scaffolding/>", ApplyRegexResult::NoUserRequest),
        ] {
            cache_direct_result(&cache, project_id, text, &result).await;
            assert_eq!(
                cached_direct_result(&cache, project_id, text).await,
                Some(result)
            );
        }
    }

    #[tokio::test]
    async fn cached_results_are_scoped_to_project_and_text() {
        let cache = make_cache();
        let project_id = Uuid::new_v4();
        let result = ApplyRegexResult::Extracted("task".to_string());
        cache_direct_result(&cache, project_id, "task", &result).await;
        assert_eq!(
            cached_direct_result(&cache, project_id, "task 2").await,
            None
        );
        assert_eq!(
            cached_direct_result(&cache, Uuid::new_v4(), "task").await,
            None
        );
    }

    #[tokio::test]
    async fn no_match_is_not_cached() {
        let cache = make_cache();
        let project_id = Uuid::new_v4();
        cache_direct_result(&cache, project_id, "text", &ApplyRegexResult::NoMatch).await;
        assert_eq!(cached_direct_result(&cache, project_id, "text").await, None);
    }
}
