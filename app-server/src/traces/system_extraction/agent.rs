//! Agent loop for the static system prompt extractor.
//!
//! Runs a tool-calling conversation against the LLM: the model hypothesizes
//! removal regexes, tests them with the harness-side `regex` tool (the raw
//! examples never travel through the model), and finishes by answering with a
//! JSON array of the final ordered regex patterns. A retry ladder over
//! temperatures re-runs the whole episode when the final answer parses to an
//! empty list or the episode errors (provider failure or step timeout).

use std::time::Duration;

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

/// Retry ladder: the next temperature is tried only if the episode's final
/// answer parses to an empty regex list or the episode errors.
const TEMPERATURE_LADDER: [f32; 3] = [0.0, 0.4, 0.7];
/// Agent-loop cap per episode (one step = one LLM call, which may contain
/// tool calls). Large example families need more refinement iterations —
/// episodes were hitting the cap ending on a tool call (no final answer),
/// falling back to the last tool-verified regex list instead of a converged one.
const MAX_STEPS: usize = 20;
/// Per-LLM-call timeout; a hung provider call aborts the episode and the
/// temperature ladder advances. Large example families (100k+ input tokens)
/// with a reasoning model can legitimately run past 3 min, so this is
/// generous.
const STEP_TIMEOUT: Duration = Duration::from_millis(300_000);
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
    /// `None` uses the default `LLM_PROVIDER`.
    pub provider: Option<String>,
    pub model_size: Option<ModelSize>,
    pub temperatures: Vec<f32>,
    pub max_steps: usize,
    pub include_diff: bool,
}

impl Default for ExtractionConfig {
    fn default() -> Self {
        Self {
            provider: None,
            model_size: Some(ModelSize::Medium),
            temperatures: TEMPERATURE_LADDER.to_vec(),
            max_steps: MAX_STEPS,
            include_diff: true,
        }
    }
}

/// Internal self-tracing routing for an extraction run. With `project_id: None`
/// (the `Default`) every span is unroutable and the exporter drops it, so
/// tracing is effectively off.
#[derive(Debug, Clone, Copy, Default)]
pub struct ExtractionTracing {
    /// Destination project for the run's internal spans.
    pub project_id: Option<Uuid>,
    /// Re-root the run under an out-of-process caller's span; `None` starts
    /// a fresh trace.
    pub parent: Option<SpanContextCarrier>,
}

#[derive(Debug)]
pub struct ExtractionResult {
    /// Ordered removal regexes; empty when every temperature episode failed
    /// to produce a usable answer.
    pub regexes: Vec<String>,
    /// Total `regex`-tool invocations across all retry attempts.
    pub tool_calls: usize,
}

/// What one temperature episode produced.
struct EpisodeOutcome {
    /// Parsed final answer; empty escalates the temperature ladder.
    regexes: Vec<String>,
    tool_calls: usize,
    /// Latest tool-call input whose RESULT met the tool's full success
    /// criteria (valid, collapsed, no shared removed text) — the fallback
    /// candidate.
    tool_verified: Option<Vec<String>>,
}

/// The tool's full success criteria: every pattern compiled and ran, all
/// examples collapsed to one residual, AND nothing identical was deleted from
/// every example — per the tool description, collapse with a non-empty
/// `sharedRemoved` is over-removal (static template text swept), not success.
fn tool_output_verified(output: &Value) -> bool {
    output["isValid"] == Value::Bool(true)
        && output["isResultInAllIdenticalOutput"] == Value::Bool(true)
        && output["sharedRemoved"]
            .as_array()
            .is_some_and(|shared| shared.is_empty())
}

/// Extract the static-template removal regexes for a family of system
/// prompts. Episode errors (provider failure, step timeout) are logged and
/// escalate the temperature ladder instead of aborting the run.
pub async fn extract_static_regexes(
    llm_client: &LlmClient,
    examples: &[String],
    config: &ExtractionConfig,
    tracing_ctx: &ExtractionTracing,
) -> ExtractionResult {
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

    let user_message = build_user_message(examples, config.include_diff);
    let result = async {
        let mut regexes: Vec<String> = Vec::new();
        let mut tool_calls = 0;
        let mut tool_verified: Option<Vec<String>> = None;

        for &temperature in &config.temperatures {
            match run_episode(
                llm_client,
                examples,
                &user_message,
                temperature,
                config,
                tracing_ctx,
            )
            .await
            {
                Ok(outcome) => {
                    tool_calls += outcome.tool_calls;
                    if outcome.tool_verified.is_some() {
                        tool_verified = outcome.tool_verified;
                    }
                    if !outcome.regexes.is_empty() {
                        regexes = outcome.regexes;
                        break;
                    }
                }
                Err(e) => {
                    log::warn!(
                        "system_extraction episode at temperature {temperature} failed: {e}"
                    );
                }
            }
        }

        // Fallback: models sometimes "improve" a pattern AFTER its last
        // successful test, or make transcription typos like `(??<=`. Trust
        // the tool over the transcript.
        if !collapses_shown(&regexes, examples)
            && let Some(verified) = &tool_verified
            && collapses_shown(verified, examples)
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

/// One agent-loop episode at a fixed temperature.
async fn run_episode(
    llm_client: &LlmClient,
    examples: &[String],
    user_message: &str,
    temperature: f32,
    config: &ExtractionConfig,
    tracing_ctx: &ExtractionTracing,
) -> Result<EpisodeOutcome, ProviderError> {
    let episode_span = info_span!(target: "lmnr::internal", "episode");
    let episode_span = InternalSpan::wrap(episode_span, SpanType::Default)
        .project(tracing_ctx.project_id)
        .build();
    spans::set_attr_str(&episode_span, "temperature", &temperature.to_string());

    let result = run_episode_inner(
        llm_client,
        examples,
        user_message,
        temperature,
        config,
        tracing_ctx,
    )
    .instrument(episode_span.clone())
    .await;

    match &result {
        Ok(outcome) => spans::set_output(&episode_span, &json!(outcome.regexes)),
        Err(e) => spans::record_error(&episode_span, e.to_string()),
    }
    result
}

async fn run_episode_inner(
    llm_client: &LlmClient,
    examples: &[String],
    user_message: &str,
    temperature: f32,
    config: &ExtractionConfig,
    tracing_ctx: &ExtractionTracing,
) -> Result<EpisodeOutcome, ProviderError> {
    let mut contents = vec![text_content(Some("user"), user_message)];
    let mut tool_calls = 0;
    let mut tool_verified: Option<Vec<String>> = None;

    for step in 0..config.max_steps {
        let request = ProviderRequest {
            contents: contents.clone(),
            system_instruction: Some(text_content(None, SYSTEM_INSTRUCTIONS)),
            tools: Some(vec![regex_tool()]),
            generation_config: Some(ProviderGenerationConfig {
                temperature: Some(temperature),
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

        let response = tokio::time::timeout(STEP_TIMEOUT, llm_client.generate_content(&request))
            .instrument(llm_span.clone())
            .await
            .unwrap_or(Err(ProviderError::RequestError(format!(
                "LLM call timed out after {}ms",
                STEP_TIMEOUT.as_millis()
            ))));
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
            return Ok(EpisodeOutcome {
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
            return Ok(EpisodeOutcome {
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

    Ok(EpisodeOutcome {
        regexes: Vec::new(),
        tool_calls,
        tool_verified,
    })
}

/// True iff `regexes` is non-empty and meets the tool's full success
/// criteria against the shown examples ([`tool_output_verified`]).
fn collapses_shown(regexes: &[String], examples: &[String]) -> bool {
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
/// `[`…`]` span. Anything unparseable yields an empty list, which escalates
/// the temperature ladder.
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
    fn collapses_shown_gates_regex_lists() {
        let examples = vec![
            "static\ndate: 2026-01-01\ntail".to_string(),
            "static\ndate: 2026-01-02\ntail".to_string(),
        ];
        // Collapses all examples to the same residual.
        assert!(collapses_shown(&["^date: .*\\n?".to_string()], &examples));
        // Valid patterns, but residuals still differ.
        assert!(!collapses_shown(&["tail".to_string()], &examples));
        // Non-compiling pattern.
        assert!(!collapses_shown(&["(unclosed".to_string()], &examples));
        // Empty list never counts as collapsing.
        assert!(!collapses_shown(&[], &examples));
    }

    #[test]
    fn collapses_shown_rejects_over_broad_sweeps() {
        let footer = "## Rules\nAlways answer politely and cite every source you used in the end.";
        let examples = vec![
            format!("intro\nDATA: a1\n{footer}"),
            format!("intro\nDATA: b2\n{footer}"),
        ];
        // Collapses, but eats the static footer — non-empty `sharedRemoved`
        // means over-removal, not success.
        assert!(!collapses_shown(
            &["DATA: [\\s\\S]*".to_string()],
            &examples
        ));
        // Bounded sweep removes only the dynamic value.
        assert!(collapses_shown(&["(?<=DATA: )\\S+".to_string()], &examples));
    }

    #[test]
    fn rejects_mixed_arrays_and_garbage() {
        assert!(parse_final_answer(r#"["a", 42]"#).is_empty());
        assert!(parse_final_answer("").is_empty());
        assert!(parse_final_answer("[]").is_empty());
        assert!(parse_final_answer("no brackets at all").is_empty());
    }
}
