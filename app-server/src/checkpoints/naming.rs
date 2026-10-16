//! One cheap LLM call per new agent for a human-readable name.

use serde_json::Value;
use uuid::Uuid;

use crate::llm::{
    LlmClient, LlmFeature, LlmRoute, ProviderContent, ProviderFunctionDeclaration,
    ProviderGenerationConfig, ProviderPart, ProviderRequest, ProviderTool,
};

const NAME_TOOL_NAME: &str = "name_agent";
const PROMPT_LIMIT: usize = 4000;
const NAME_LIMIT: usize = 100;

const NAMING_INSTRUCTION: &str = "You name AI agents. Given an agent's system prompt, \
     reply with a short human-readable name (2-4 words) for the agent's specific role and \
     purpose, e.g. 'Research Analyst' or 'Support Triage Bot'. Ignore boilerplate shared by \
     most prompts (SDK headers, environment blocks, formatting and tool-use conventions). \
     Respond ONLY by calling the name_agent tool.";

pub(super) async fn generate_agent_name(
    llm_client: &LlmClient,
    project_id: Uuid,
    system_prompt: &str,
) -> anyhow::Result<String> {
    let request = ProviderRequest {
        contents: vec![ProviderContent {
            role: Some("user".to_string()),
            parts: Some(vec![ProviderPart {
                text: Some(format!(
                    "Agent system prompt:\n{}",
                    crate::utils::truncate_chars(system_prompt, PROMPT_LIMIT)
                )),
                ..Default::default()
            }]),
        }],
        system_instruction: Some(ProviderContent {
            role: None,
            parts: Some(vec![ProviderPart {
                text: Some(NAMING_INSTRUCTION.to_string()),
                ..Default::default()
            }]),
        }),
        tools: Some(vec![name_tool()]),
        generation_config: Some(ProviderGenerationConfig {
            temperature: Some(0.0),
            ..Default::default()
        }),
        service_tier: None,
        route: LlmRoute::feature(LlmFeature::CheckpointsAgentNaming, Some(project_id)),
    };

    let response = llm_client
        .generate_content(&request)
        .await
        .map_err(|e| anyhow::anyhow!("name_agent LLM call failed: {e:?}"))?;

    let args = response
        .candidates
        .and_then(|c| c.into_iter().next())
        .and_then(|c| c.content)
        .and_then(|content| content.parts)
        .and_then(|parts| {
            parts.into_iter().find_map(|p| {
                p.function_call
                    .filter(|fc| fc.name == NAME_TOOL_NAME)
                    .and_then(|fc| fc.args)
            })
        })
        .ok_or_else(|| anyhow::anyhow!("name_agent returned no tool call"))?;
    parse_name(&args)
}

fn parse_name(args: &Value) -> anyhow::Result<String> {
    let name = args
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim();
    if name.is_empty() {
        anyhow::bail!("name_agent returned an empty name");
    }
    Ok(crate::utils::truncate_chars(name, NAME_LIMIT).to_string())
}

fn name_tool() -> ProviderTool {
    ProviderTool {
        function_declarations: vec![ProviderFunctionDeclaration {
            name: NAME_TOOL_NAME.to_string(),
            description: "REQUIRED: report the agent's name. Always call this tool; never \
                respond with plain text."
                .to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "A short human-readable name (2-4 words) describing the agent's role."
                    }
                },
                "required": ["name"]
            }),
        }],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blank_or_missing_name_is_an_error() {
        assert!(parse_name(&serde_json::json!({ "name": "  " })).is_err());
        assert!(parse_name(&serde_json::json!({})).is_err());
    }

    #[test]
    fn name_is_trimmed() {
        let name = parse_name(&serde_json::json!({ "name": " Research Analyst " })).unwrap();
        assert_eq!(name, "Research Analyst");
    }
}
