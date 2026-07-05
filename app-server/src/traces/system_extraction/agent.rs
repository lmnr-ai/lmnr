//! Agent loop for the static system prompt extractor.
//!
//! Runs a tool-calling conversation against the LLM: the model hypothesizes
//! removal regexes, tests them with the harness-side `regex` tool (the raw
//! examples never travel through the model), and finishes by answering with a
//! JSON array of the final ordered regex patterns. A retry ladder over
//! temperatures re-runs the whole episode only when the final answer parses
//! to an empty list.

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

/// Retry ladder: the next temperature is tried ONLY if the episode's final
/// answer parses to an empty regex list.
const TEMPERATURE_LADDER: [f32; 3] = [0.0, 0.4, 0.7];
/// Agent-loop cap per episode (one step = one LLM call, which may contain
/// tool calls).
const MAX_STEPS: usize = 12;

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

/// Extract the static-template removal regexes for a family of system
/// prompts. Returns the ordered regex list; empty when every temperature
/// episode failed to produce a non-empty parseable answer.
pub async fn extract_static_regexes(
    llm_client: &LlmClient,
    examples: &[String],
    config: &ExtractionConfig,
    tracing_ctx: &ExtractionTracing,
) -> Result<Vec<String>, ProviderError> {
    if examples.is_empty() {
        return Ok(Vec::new());
    }

    let root_span = info_span!(target: "lmnr::internal", parent: None, "system_extraction");
    let root_span = InternalSpan::wrap(root_span, SpanType::Default)
        .parent(tracing_ctx.parent)
        .project(tracing_ctx.project_id)
        .span_path_root("system_extraction")
        .input(&json!({ "examples": examples }))
        .build();

    let user_message = build_user_message(examples, config.include_diff);
    let result: Result<Vec<String>, ProviderError> = async {
        for &temperature in &config.temperatures {
            let regexes = run_episode(
                llm_client,
                examples,
                &user_message,
                temperature,
                config,
                tracing_ctx,
            )
            .await?;
            if !regexes.is_empty() {
                return Ok(regexes);
            }
        }
        Ok(Vec::new())
    }
    .instrument(root_span.clone())
    .await;

    match &result {
        Ok(regexes) => spans::set_output(&root_span, &json!(regexes)),
        Err(e) => spans::record_error(&root_span, e.to_string()),
    }
    result
}

/// One agent-loop episode at a fixed temperature. Returns an empty list when
/// the loop exhausts `max_steps` or the final answer doesn't parse.
async fn run_episode(
    llm_client: &LlmClient,
    examples: &[String],
    user_message: &str,
    temperature: f32,
    config: &ExtractionConfig,
    tracing_ctx: &ExtractionTracing,
) -> Result<Vec<String>, ProviderError> {
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
        Ok(regexes) => spans::set_output(&episode_span, &json!(regexes)),
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
) -> Result<Vec<String>, ProviderError> {
    let mut contents = vec![text_content("user", user_message)];

    for step in 0..config.max_steps {
        let request = ProviderRequest {
            contents: contents.clone(),
            system_instruction: Some(text_content_no_role(SYSTEM_INSTRUCTIONS)),
            tools: Some(vec![regex_tool()]),
            generation_config: Some(ProviderGenerationConfig {
                temperature: Some(temperature),
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

        let response = llm_client
            .generate_content(&request)
            .instrument(llm_span.clone())
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
            return Ok(Vec::new());
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
            let regexes = parse_final_answer(&text);
            // The model is instructed to only return a tool-verified list, but
            // that isn't guaranteed — re-verify harness-side and discard
            // answers that don't compile or don't collapse all examples
            // (escalates the temperature ladder).
            if !regexes.is_empty() && !verify_regexes(&regexes, examples) {
                return Ok(Vec::new());
            }
            return Ok(regexes);
        }

        contents.push(ProviderContent {
            role: Some("model".to_string()),
            parts: Some(parts.clone()),
        });

        let response_parts: Vec<ProviderPart> = function_calls
            .into_iter()
            .map(|fc| {
                let tool_span = info_span!(target: "lmnr::internal", "tool_call");
                let tool_span = InternalSpan::wrap(tool_span, SpanType::Tool)
                    .project(tracing_ctx.project_id)
                    .input(&json!({ "name": fc.name, "args": fc.args }))
                    .step(step)
                    .build();
                let output = tool_span.in_scope(|| match fc.name.as_str() {
                    REGEX_TOOL_NAME => match serde_json::from_value::<RegexToolInput>(
                        fc.args.clone().unwrap_or(Value::Null),
                    ) {
                        Ok(input) => run_regex_tool(&input.regexes, examples),
                        Err(e) => {
                            serde_json::json!({ "error": format!("Invalid tool input: {e}") })
                        }
                    },
                    other => serde_json::json!({ "error": format!("Unknown tool: {other}") }),
                });
                spans::set_output(&tool_span, &output);
                ProviderPart {
                    function_response: Some(crate::llm::models::ProviderFunctionResponse {
                        id: fc.id,
                        name: fc.name,
                        response: output,
                    }),
                    ..Default::default()
                }
            })
            .collect();

        contents.push(ProviderContent {
            role: Some("user".to_string()),
            parts: Some(response_parts),
        });
    }

    Ok(Vec::new())
}

/// Final-answer gate: all patterns compile and run, and every example
/// collapses to the same residual.
fn verify_regexes(regexes: &[String], examples: &[String]) -> bool {
    let result = run_regex_tool(regexes, examples);
    result["isValid"] == Value::Bool(true)
        && result["isResultInAllIdenticalOutput"] == Value::Bool(true)
}

fn text_content(role: &str, text: &str) -> ProviderContent {
    ProviderContent {
        role: Some(role.to_string()),
        parts: Some(vec![ProviderPart {
            text: Some(text.to_string()),
            ..Default::default()
        }]),
    }
}

fn text_content_no_role(text: &str) -> ProviderContent {
    ProviderContent {
        role: None,
        parts: Some(vec![ProviderPart {
            text: Some(text.to_string()),
            ..Default::default()
        }]),
    }
}

/// Parse the model's final answer into an ordered regex list. Tolerates
/// markdown code fences despite the instructions; anything unparseable
/// yields an empty list (which escalates the temperature ladder).
fn parse_final_answer(text: &str) -> Vec<String> {
    let trimmed = text.trim();
    let trimmed = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```"))
        .map(|s| s.strip_suffix("```").unwrap_or(s))
        .unwrap_or(trimmed)
        .trim();

    let Ok(Value::Array(items)) = serde_json::from_str::<Value>(trimmed) else {
        return Vec::new();
    };
    let regexes: Vec<String> = items
        .iter()
        .filter_map(|v| v.as_str())
        .map(str::to_string)
        .collect();
    // A mixed-type array is malformed, not a partial answer.
    if regexes.len() != items.len() {
        return Vec::new();
    }
    regexes
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
    fn verify_regexes_gates_final_answer() {
        let examples = vec![
            "static\ndate: 2026-01-01\ntail".to_string(),
            "static\ndate: 2026-01-02\ntail".to_string(),
        ];
        // Collapses all examples to the same residual.
        assert!(verify_regexes(&["^date: .*\\n?".to_string()], &examples));
        // Valid patterns, but residuals still differ.
        assert!(!verify_regexes(&["tail".to_string()], &examples));
        // Non-compiling pattern.
        assert!(!verify_regexes(&["(unclosed".to_string()], &examples));
    }

    #[test]
    fn rejects_prose_and_mixed_arrays() {
        assert!(parse_final_answer("Here are your regexes: [\"a\"]").is_empty());
        assert!(parse_final_answer(r#"["a", 42]"#).is_empty());
        assert!(parse_final_answer("").is_empty());
        assert!(parse_final_answer("[]").is_empty());
    }
}
