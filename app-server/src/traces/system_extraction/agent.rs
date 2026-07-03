//! Agent loop for the static system prompt extractor.
//!
//! Runs a tool-calling conversation against the LLM: the model hypothesizes
//! removal regexes, tests them with the harness-side `regex` tool (the raw
//! examples never travel through the model), and finishes by answering with a
//! JSON array of the final ordered regex patterns. A retry ladder over
//! temperatures re-runs the whole episode only when the final answer parses
//! to an empty list.

use serde_json::Value;

use super::prompt::{SYSTEM_INSTRUCTIONS, build_user_message};
use super::tool::{REGEX_TOOL_NAME, RegexToolInput, regex_tool, run_regex_tool};
use crate::llm::models::ModelSize;
use crate::llm::{
    LlmClient, ProviderContent, ProviderError, ProviderGenerationConfig, ProviderPart,
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

/// Extract the static-template removal regexes for a family of system
/// prompts. Returns the ordered regex list; empty when every temperature
/// episode failed to produce a non-empty parseable answer.
pub async fn extract_static_regexes(
    llm_client: &LlmClient,
    examples: &[String],
    config: &ExtractionConfig,
) -> Result<Vec<String>, ProviderError> {
    if examples.is_empty() {
        return Ok(Vec::new());
    }

    let user_message = build_user_message(examples, config.include_diff);
    for &temperature in &config.temperatures {
        let regexes = run_episode(llm_client, examples, &user_message, temperature, config).await?;
        if !regexes.is_empty() {
            return Ok(regexes);
        }
    }
    Ok(Vec::new())
}

/// One agent-loop episode at a fixed temperature. Returns an empty list when
/// the loop exhausts `max_steps` or the final answer doesn't parse.
async fn run_episode(
    llm_client: &LlmClient,
    examples: &[String],
    user_message: &str,
    temperature: f32,
    config: &ExtractionConfig,
) -> Result<Vec<String>, ProviderError> {
    let mut contents = vec![text_content("user", user_message)];

    for _ in 0..config.max_steps {
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

        let response = llm_client.generate_content(&request).await?;

        let Some(content) = response
            .candidates
            .and_then(|candidates| candidates.into_iter().next())
            .and_then(|candidate| candidate.content)
        else {
            return Ok(Vec::new());
        };
        let parts = content.parts.clone().unwrap_or_default();

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
            return Ok(parse_final_answer(&text));
        }

        contents.push(ProviderContent {
            role: Some("model".to_string()),
            parts: Some(parts.clone()),
        });

        let response_parts: Vec<ProviderPart> = function_calls
            .into_iter()
            .map(|fc| {
                let output = match fc.name.as_str() {
                    REGEX_TOOL_NAME => match serde_json::from_value::<RegexToolInput>(
                        fc.args.clone().unwrap_or(Value::Null),
                    ) {
                        Ok(input) => run_regex_tool(&input.regexes, examples),
                        Err(e) => {
                            serde_json::json!({ "error": format!("Invalid tool input: {e}") })
                        }
                    },
                    other => serde_json::json!({ "error": format!("Unknown tool: {other}") }),
                };
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
    fn rejects_prose_and_mixed_arrays() {
        assert!(parse_final_answer("Here are your regexes: [\"a\"]").is_empty());
        assert!(parse_final_answer(r#"["a", 42]"#).is_empty());
        assert!(parse_final_answer("").is_empty());
        assert!(parse_final_answer("[]").is_empty());
    }
}
