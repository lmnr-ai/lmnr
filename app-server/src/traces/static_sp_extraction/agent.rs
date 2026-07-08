//! Agent loop for the static system prompt extractor.
//!
//! Runs a tool-calling conversation against the LLM: the model hypothesizes
//! removal regexes, tests them with the harness-side `regex` tool (the raw
//! examples never travel through the model), and finishes by answering with a
//! JSON array of the final ordered regex patterns.

use std::time::Duration;

use backoff::ExponentialBackoffBuilder;
use serde_json::{Value, json};
use tracing::{Instrument, info_span};

use uuid::Uuid;

use super::prompt::{SYSTEM_INSTRUCTIONS, build_user_message};
use super::tool::{REGEX_TOOL_NAME, RegexToolInput, regex_tool, run_regex_tool};
use crate::instrumentation::spans::{self, InternalSpan, SpanContextCarrier, SpanType};
use crate::llm::models::ModelSize;
use crate::llm::{
    self, LlmClient, ProviderContent, ProviderError, ProviderGenerationConfig, ProviderPart,
    ProviderRequest,
};

/// Agent-loop step cap (one step = one LLM call, which may contain tool
/// calls). Large example families need more refinement iterations — the loop
/// was hitting the cap ending on a tool call (no final answer), falling back
/// to the last tool-verified regex list instead of a converged one.
const MAX_STEPS: usize = 20;
/// Exponential-backoff bounds for retrying a transient LLM failure
const LLM_RETRY_INITIAL_BACKOFF: Duration = Duration::from_secs(2);
const LLM_RETRY_MAX_ELAPSED: Duration = Duration::from_secs(120);
/// Cap on output tokens per LLM call. Must be large enough that a reasoning
/// model (e.g. Claude Sonnet-5 adaptive thinking) can finish its thinking AND
/// still emit the tool call / final answer in one response. The provider
/// default (4096) truncated mid-thinking on large inputs — the model spent the
/// whole budget reasoning and never emitted a `tool_use` block, so the agent
/// saw zero function calls and every retry produced an empty answer.
const MAX_OUTPUT_TOKENS: i32 = 32_000;

#[derive(Debug, Clone)]
pub struct ExtractionConfig {
    /// Provider override on the request (e.g. `"bedrock"`, `"gemini"`);
    /// `None` uses the default `LLM_PROVIDER`. Defaults from
    /// `SYSTEM_EXTRACTION_LLM_PROVIDER` (see `ExtractionConfig::default`).
    pub provider: Option<String>,
    pub model_size: Option<ModelSize>,
    pub max_steps: usize,
    pub include_diff: bool,
}

impl Default for ExtractionConfig {
    fn default() -> Self {
        Self {
            provider: extraction_provider(),
            model_size: Some(ModelSize::Medium),
            max_steps: MAX_STEPS,
            include_diff: true,
        }
    }
}

/// Provider override from `SYSTEM_EXTRACTION_LLM_PROVIDER`. Unset/empty ⇒
/// `None` (uses the default `LLM_PROVIDER`).
fn extraction_provider() -> Option<String> {
    // `mod env` shadows `std::env`, hence the fully-qualified read.
    std::env::var(crate::env::static_sp::SP_EXTRACTION_LLM_PROVIDER)
        .ok()
        .map(|v| v.trim().to_lowercase())
        .filter(|v| !v.is_empty())
}

/// Internal self-tracing routing for an extraction run. With `project_id: None`
/// (the `Default`) every span is unroutable and the exporter drops it, so
/// tracing is effectively off.
#[derive(Debug, Clone, Default)]
pub struct ExtractionTracing {
    /// Destination project for the run's internal spans.
    pub project_id: Option<Uuid>,
    /// The project the prompts came from (NOT the internal routing target
    /// above), stamped as trace metadata on the root span for debugging.
    pub source_project_id: Option<Uuid>,
    /// Re-root the run under an out-of-process caller's span; `None` starts
    /// a fresh trace.
    pub parent: Option<SpanContextCarrier>,
    /// Naive signature (`lmnr.span.prompt_hash`) of the prompt family, stamped
    /// as trace metadata on the root span. `None` on the ad-hoc route (no
    /// signature there).
    pub prompt_hash: Option<String>,
}

#[derive(Debug)]
pub struct ExtractionResult {
    /// Ordered removal regexes; empty when the agent loop failed to produce a
    /// usable answer.
    pub regexes: Vec<String>,
    /// Total `regex`-tool invocations across all retry attempts.
    pub tool_calls: usize,
}

/// What the agent loop produced.
struct AgentOutcome {
    /// Parsed final answer; empty falls back to the tool-verified candidate.
    regexes: Vec<String>,
    tool_calls: usize,
    /// Latest tool-call input whose RESULT had `isValid` and
    /// `isResultInAllIdenticalOutput` — the fallback candidate.
    tool_verified: Option<Vec<String>>,
}

/// The tool's full success criteria: every pattern compiled and ran, all
/// examples collapsed to one residual
fn tool_output_verified(output: &Value) -> bool {
    output["isValid"] == Value::Bool(true)
        && output["isResultInAllIdenticalOutput"] == Value::Bool(true)
}

/// Extract the static-template removal regexes for a family of system
/// prompts. Agent-loop errors (provider failure, step timeout) are logged and
/// yield an empty result instead of aborting the run.
pub async fn extract_static_regexes(
    llm_client: &LlmClient,
    examples: &[String],
    config: &ExtractionConfig,
    tracing_ctx: &ExtractionTracing,
) -> ExtractionResult {
    log::debug!(
        "[STATIC_SP] Extracting static-template removal regexes for {} examples",
        examples.len()
    );
    if examples.is_empty() {
        return ExtractionResult {
            regexes: Vec::new(),
            tool_calls: 0,
        };
    }

    let root_span = info_span!(target: "lmnr::internal", parent: None, "system_extraction");
    let root_span = InternalSpan::wrap(root_span, SpanType::Default)
        .parent(tracing_ctx.parent)
        .project(tracing_ctx.project_id)
        .span_path_root("system_extraction")
        .input(&json!({ "examples": examples }))
        .build();
    if let Some(prompt_hash) = &tracing_ctx.prompt_hash {
        spans::set_metadata_str(&root_span, "lmnr_prompt_hash", prompt_hash);
    }
    if let Some(source_project_id) = &tracing_ctx.source_project_id {
        spans::set_metadata_str(
            &root_span,
            "lmnr_project_id",
            &source_project_id.to_string(),
        );
    }

    let user_message = build_user_message(examples, config.include_diff);
    let result = async {
        let mut regexes: Vec<String> = Vec::new();
        let mut tool_calls = 0;
        let mut tool_verified: Option<Vec<String>> = None;

        match run_agent_loop(llm_client, examples, &user_message, config, tracing_ctx).await {
            Ok(outcome) => {
                tool_calls = outcome.tool_calls;
                tool_verified = outcome.tool_verified;
                // Only accept a final answer that actually collapses the shown
                // examples without deleting shared static text. A merely-non-empty
                // answer can be over-broad or non-collapsing; leave `regexes`
                // empty so we fall back to the tool-verified candidate rather
                // than caching a bad one for 7 days.
                if regexes_collapse_examples(&outcome.regexes, examples) {
                    regexes = outcome.regexes;
                }
            }
            Err(e) => {
                log::warn!("system_extraction agent loop failed: {e}");
            }
        }

        // Fallback: the final answer didn't collapse the examples (models
        // sometimes "improve" a pattern AFTER its last successful test, or make
        // transcription typos like `(??<=`). Trust the tool over the transcript
        // and use the latest fully-verified candidate when we have one. If
        // there's none, `regexes` stays empty and the consumer treats the run
        // as a failure (retry after the lock TTL) rather than caching garbage.
        if regexes.is_empty()
            && let Some(verified) = &tool_verified
            && regexes_collapse_examples(verified, examples)
        {
            regexes = verified.clone();
        }

        ExtractionResult {
            regexes,
            tool_calls,
        }
    }
    .instrument(root_span.clone())
    .await;

    spans::set_output(
        &root_span,
        &json!({ "regexes": result.regexes, "toolCalls": result.tool_calls }),
    );
    result
}

/// Run the tool-calling agent loop: alternately ask the model for regexes and
/// run the `regex` tool on its calls, until it emits a final answer or hits the
/// step cap. Child `llm_call` / `tool_call` spans parent contextually to the
/// enclosing `system_extraction` span.
async fn run_agent_loop(
    llm_client: &LlmClient,
    examples: &[String],
    user_message: &str,
    config: &ExtractionConfig,
    tracing_ctx: &ExtractionTracing,
) -> Result<AgentOutcome, ProviderError> {
    let mut contents = vec![text_content(Some("user"), user_message)];
    let mut tool_calls = 0;
    let mut tool_verified: Option<Vec<String>> = None;

    for step in 0..config.max_steps {
        let request = ProviderRequest {
            contents: contents.clone(),
            system_instruction: Some(text_content(None, SYSTEM_INSTRUCTIONS)),
            tools: Some(vec![regex_tool()]),
            generation_config: Some(ProviderGenerationConfig {
                max_output_tokens: Some(MAX_OUTPUT_TOKENS),
                ..Default::default()
            }),
            service_tier: None,
            provider: config.provider.clone(),
            model_size: config.model_size,
        };

        let (model, provider) = llm_client.resolve_model_provider(&request);
        let llm_span = info_span!(target: "lmnr::internal", "llm_call");
        let llm_span = InternalSpan::wrap(llm_span, SpanType::LLM)
            .project(tracing_ctx.project_id)
            .input(&llm::request_to_span_input(&request))
            .tools(llm::request_to_tools_attr(&request).as_ref())
            .model(&provider, &model)
            .step(step)
            .build();

        let retry_backoff = ExponentialBackoffBuilder::new()
            .with_initial_interval(LLM_RETRY_INITIAL_BACKOFF)
            .with_max_elapsed_time(Some(LLM_RETRY_MAX_ELAPSED))
            .build();
        let response = backoff::future::retry(retry_backoff, || async {
            match llm_client
                .generate_content(&request)
                .instrument(llm_span.clone())
                .await
            {
                Ok(response) => Ok(response),
                Err(e) if e.is_retryable() => {
                    log::warn!("[STATIC_PROMPT] LLM call failed, will retry: {e}");
                    Err(backoff::Error::transient(e))
                }
                Err(e) => Err(backoff::Error::permanent(e)),
            }
        })
        .await;
        let response = match response {
            Ok(response) => response,
            Err(e) => {
                spans::record_error(&llm_span, e.to_string());
                return Err(e);
            }
        };

        if let Some(model_version) = &response.model_version {
            spans::set_model(&llm_span, &provider, model_version);
        }
        if let Some(usage) = &response.usage_metadata {
            spans::set_usage(
                &llm_span,
                usage.prompt_token_count,
                usage.cache_read_input_tokens,
                usage.candidates_token_count,
            );
        }

        let Some(content) = response
            .candidates
            .and_then(|candidates| candidates.into_iter().next())
            .and_then(|candidate| candidate.content)
        else {
            return Ok(AgentOutcome {
                regexes: Vec::new(),
                tool_calls,
                tool_verified,
            });
        };
        let parts = content.parts.clone().unwrap_or_default();
        spans::set_output(
            &llm_span,
            &json!(ProviderContent {
                role: Some("model".to_string()),
                parts: Some(parts.clone()),
            }),
        );
        drop(llm_span);

        let function_calls: Vec<_> = parts
            .iter()
            .filter_map(|part| part.function_call.clone())
            .collect();

        if function_calls.is_empty() {
            let text = parts
                .iter()
                .filter(|part| part.thought != Some(true))
                .filter_map(|part| part.text.as_deref())
                .collect::<Vec<_>>()
                .join("");
            return Ok(AgentOutcome {
                regexes: parse_final_answer(&text),
                tool_calls,
                tool_verified,
            });
        }

        contents.push(ProviderContent {
            role: Some("model".to_string()),
            parts: Some(parts.clone()),
        });

        let mut response_parts: Vec<ProviderPart> = Vec::with_capacity(function_calls.len());
        for fc in function_calls {
            let tool_span = info_span!(target: "lmnr::internal", "tool_call");
            let tool_span = InternalSpan::wrap(tool_span, SpanType::Tool)
                .project(tracing_ctx.project_id)
                .input(&json!({ "name": fc.name, "args": fc.args }))
                .step(step)
                .build();
            let output = tool_span.in_scope(|| match fc.name.as_str() {
                REGEX_TOOL_NAME => {
                    tool_calls += 1;
                    match serde_json::from_value::<RegexToolInput>(
                        fc.args.clone().unwrap_or(Value::Null),
                    ) {
                        Ok(input) => {
                            let output = run_regex_tool(&input.regexes, examples);
                            if tool_output_verified(&output) {
                                tool_verified = Some(input.regexes);
                            }
                            output
                        }
                        Err(e) => {
                            serde_json::json!({ "error": format!("Invalid tool input: {e}") })
                        }
                    }
                }
                other => serde_json::json!({ "error": format!("Unknown tool: {other}") }),
            });
            spans::set_output(&tool_span, &output);
            response_parts.push(ProviderPart {
                function_response: Some(crate::llm::models::ProviderFunctionResponse {
                    id: fc.id,
                    name: fc.name,
                    response: output,
                }),
                ..Default::default()
            });
        }

        contents.push(ProviderContent {
            role: Some("user".to_string()),
            parts: Some(response_parts),
        });
    }

    Ok(AgentOutcome {
        regexes: Vec::new(),
        tool_calls,
        tool_verified,
    })
}

/// True iff `regexes` is non-empty, every pattern compiles and runs, and
/// applying them collapses every example to the same residual.
fn regexes_collapse_examples(regexes: &[String], examples: &[String]) -> bool {
    if regexes.is_empty() {
        return false;
    }
    tool_output_verified(&run_regex_tool(regexes, examples))
}

fn text_content(role: Option<&str>, text: &str) -> ProviderContent {
    ProviderContent {
        role: role.map(str::to_string),
        parts: Some(vec![ProviderPart {
            text: Some(text.to_string()),
            ..Default::default()
        }]),
    }
}

/// Parse the model's final answer into an ordered regex list. Defensive, in
/// order: bare JSON array → first fenced block (optional `json` tag) → first
/// `[`…`]` span. Anything unparseable yields an empty list, which falls back
/// to the tool-verified candidate.
fn parse_final_answer(text: &str) -> Vec<String> {
    let trimmed = text.trim();
    if let Some(regexes) = parse_string_array(trimmed) {
        return regexes;
    }
    if let Some(fenced) = extract_fenced_block(trimmed)
        && let Some(regexes) = parse_string_array(fenced.trim())
    {
        return regexes;
    }
    if let (Some(start), Some(end)) = (trimmed.find('['), trimmed.rfind(']'))
        && start < end
        && let Some(regexes) = parse_string_array(&trimmed[start..=end])
    {
        return regexes;
    }
    Vec::new()
}

/// `Some` only when `text` is a JSON array of strings.
fn parse_string_array(text: &str) -> Option<Vec<String>> {
    let Ok(Value::Array(items)) = serde_json::from_str::<Value>(text) else {
        return None;
    };
    items
        .iter()
        .map(|v| v.as_str().map(str::to_string))
        .collect()
}

/// Contents of the first triple-backtick-fenced block, tolerating an
/// optional `json` language tag.
fn extract_fenced_block(text: &str) -> Option<&str> {
    let after_open = &text[text.find("```")? + 3..];
    let after_open = after_open.strip_prefix("json").unwrap_or(after_open);
    Some(&after_open[..after_open.find("```")?])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_plain_json_array() {
        let parsed = parse_final_answer(r#"["^Current date: .*$", "(?<=id: )\\d+"]"#);
        assert_eq!(parsed, vec!["^Current date: .*$", r"(?<=id: )\d+"]);
    }

    #[test]
    fn parses_fenced_json_array() {
        let parsed = parse_final_answer("```json\n[\"a\", \"b\"]\n```");
        assert_eq!(parsed, vec!["a", "b"]);
    }

    #[test]
    fn parses_bracket_span_inside_prose() {
        let parsed = parse_final_answer("Here are your regexes: [\"a\", \"b\"] — done!");
        assert_eq!(parsed, vec!["a", "b"]);
    }

    #[test]
    fn regexes_collapse_examples_gates_regex_lists() {
        let examples = vec![
            "static\ndate: 2026-01-01\ntail".to_string(),
            "static\ndate: 2026-01-02\ntail".to_string(),
        ];
        // Collapses all examples to the same residual.
        assert!(regexes_collapse_examples(
            &["^date: .*\\n?".to_string()],
            &examples
        ));
        // Valid patterns, but residuals still differ.
        assert!(!regexes_collapse_examples(&["tail".to_string()], &examples));
        // Non-compiling pattern.
        assert!(!regexes_collapse_examples(
            &["(unclosed".to_string()],
            &examples
        ));
        // Empty list never counts as collapsing.
        assert!(!regexes_collapse_examples(&[], &examples));
    }

    #[test]
    fn regexes_collapse_examples_accepts_over_broad_sweeps() {
        let footer = "## Rules\nAlways answer politely and cite every source you used in the end.";
        let examples = vec![
            format!("intro\nDATA: a1\n{footer}"),
            format!("intro\nDATA: b2\n{footer}"),
        ];
        // The `sharedRemoved` acceptance gate was intentionally dropped from
        // `tool_output_verified` (too strict — it often rejected every
        // candidate, yielding no regex). An over-broad sweep that collapses all
        // examples to the same residual now counts as collapsing, even though
        // it eats the static footer. Don't re-add the gate here.
        assert!(regexes_collapse_examples(
            &["DATA: [\\s\\S]*".to_string()],
            &examples
        ));
        // A bounded sweep collapses too.
        assert!(regexes_collapse_examples(
            &["(?<=DATA: )\\S+".to_string()],
            &examples
        ));
    }

    #[test]
    fn non_collapsing_final_answer_falls_back_to_verified_candidate() {
        // Mirrors the selection logic in `extract_static_regexes`: a final
        // answer that does NOT collapse the examples must not be returned when
        // a fully-verified candidate exists.
        let examples = vec![
            "static\ndate: 2026-01-01\ntail".to_string(),
            "static\ndate: 2026-01-02\ntail".to_string(),
        ];
        // Valid pattern, but residuals still differ (the date line survives).
        let non_collapsing = vec!["tail".to_string()];
        let verified = vec!["^date: .*\\n?".to_string()];

        assert!(!regexes_collapse_examples(&non_collapsing, &examples));
        assert!(regexes_collapse_examples(&verified, &examples));

        let mut regexes: Vec<String> = Vec::new();
        if regexes_collapse_examples(&non_collapsing, &examples) {
            regexes = non_collapsing.clone();
        }
        if regexes.is_empty() && regexes_collapse_examples(&verified, &examples) {
            regexes = verified.clone();
        }
        assert_eq!(regexes, verified);
    }

    #[test]
    fn non_collapsing_final_answer_with_no_fallback_returns_empty() {
        let examples = vec![
            "static\ndate: 2026-01-01\ntail".to_string(),
            "static\ndate: 2026-01-02\ntail".to_string(),
        ];
        let non_collapsing = vec!["tail".to_string()];

        // No verified fallback available → the run yields an empty list, which
        // the consumer treats as a failure instead of caching a non-collapsing
        // pattern.
        let mut regexes: Vec<String> = Vec::new();
        if regexes_collapse_examples(&non_collapsing, &examples) {
            regexes = non_collapsing.clone();
        }
        let tool_verified: Option<Vec<String>> = None;
        if regexes.is_empty()
            && let Some(verified) = &tool_verified
            && regexes_collapse_examples(verified, &examples)
        {
            regexes = verified.clone();
        }
        assert!(regexes.is_empty());
    }

    #[test]
    fn rejects_mixed_arrays_and_garbage() {
        assert!(parse_final_answer(r#"["a", 42]"#).is_empty());
        assert!(parse_final_answer("").is_empty());
        assert!(parse_final_answer("[]").is_empty());
        assert!(parse_final_answer("no brackets at all").is_empty());
    }
}
