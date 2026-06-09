//! LLM-based agent classification for checkpoints.

use std::sync::Arc;

use serde_json::Value;
use uuid::Uuid;

use crate::{
    checkpoints::llm::{CheckpointRoot, run_llm},
    db::agents::AgentVersion,
    llm::{
        LlmClient, ModelSize, ProviderContent, ProviderFunctionDeclaration,
        ProviderGenerationConfig, ProviderPart, ProviderRequest, ProviderTool,
    },
};

/// Result of the LLM classification: is the incoming system prompt a brand-new
/// agent, or a modified version of an existing one?
#[derive(Debug, Clone)]
pub enum AgentClassification {
    /// No existing agent matches — create a new one. `name` is an
    /// LLM-generated display name for the new agent.
    NewAgent { name: String },
    /// A modified version of an existing agent.
    ExistingAgent { agent_id: Uuid },
}

const CLASSIFY_TOOL_NAME: &str = "classify_agent";

const CLASSIFY_INSTRUCTION: &str =
    "You classify AI agent system prompts. Given an incoming agent's system prompt and a list of \
     existing agents (each with an id and its system prompt), decide whether the incoming prompt is \
     a completely new agent or a modified version of one of the existing agents.\n\n\
     Base your decision ONLY on the agent's specific ROLE and PURPOSE — the sentence(s) describing \
     who the agent is and what job it does (e.g. 'senior research analyst gathering data' vs \
     'portfolio manager orchestrating subagents'). IGNORE shared boilerplate that appears in most \
     prompts and carries no role information: billing/header lines, 'You are a Claude agent built \
     on Anthropic's Claude Agent SDK', environment/<env> blocks, git status, OS/shell/model/version \
     details, and generic formatting or tool-use conventions. Two prompts that differ ONLY in such \
     boilerplate are the SAME agent; two prompts with the same boilerplate but a different role are \
     DIFFERENT agents.\n\n\
     Do not be misled by surface word overlap or shared domain vocabulary. An agent that PERFORMS a \
     task is a DIFFERENT agent from one that ORCHESTRATES or DELEGATES that task, even if both \
     mention the same domain (e.g. a 'research analyst' that does the research is not the same as a \
     'portfolio manager' that delegates research to subagents). When the core role or purpose is \
     unrelated, classify as a new agent. Respond ONLY by calling the classify_agent tool.";

const INCOMING_PROMPT_LIMIT: usize = 4000;
const EXISTING_PROMPT_LIMIT: usize = 1000;

/// Decide whether `non_dynamic_system_prompt` is a new agent or a variant of an
/// existing one. Best-effort: with no LLM provider, or on any failure, falls
/// back to a heuristic.
pub async fn classify_agent(
    non_dynamic_system_prompt: &str,
    existing_agents: &[AgentVersion],
    llm_client: Option<Arc<LlmClient>>,
    root: &CheckpointRoot,
) -> anyhow::Result<AgentClassification> {
    let Some(llm_client) = llm_client else {
        return Ok(fallback_classification(existing_agents));
    };

    match classify_with_llm(
        &llm_client,
        non_dynamic_system_prompt,
        existing_agents,
        root,
    )
    .await
    {
        Ok(classification) => Ok(classification),
        Err(e) => {
            log::warn!("[CHECKPOINTS] Agent classification failed, falling back: {e:?}");
            Ok(fallback_classification(existing_agents))
        }
    }
}

async fn classify_with_llm(
    llm_client: &LlmClient,
    system_prompt: &str,
    existing_agents: &[AgentVersion],
    root: &CheckpointRoot,
) -> anyhow::Result<AgentClassification> {
    let request = ProviderRequest {
        contents: vec![ProviderContent {
            role: Some("user".to_string()),
            parts: Some(vec![ProviderPart {
                text: Some(build_context(system_prompt, existing_agents)),
                ..Default::default()
            }]),
        }],
        system_instruction: Some(ProviderContent {
            role: None,
            parts: Some(vec![ProviderPart {
                text: Some(CLASSIFY_INSTRUCTION.to_string()),
                ..Default::default()
            }]),
        }),
        tools: Some(vec![build_classify_tool()]),
        generation_config: Some(ProviderGenerationConfig {
            temperature: Some(0.0),
            ..Default::default()
        }),
        provider: None,
        model_size: Some(ModelSize::Small),
    };

    let response = run_llm(root, llm_client, &request, || {
        tracing::info_span!(target: "lmnr::internal", "classify_agent")
    })
    .await
    .map_err(|e| anyhow::anyhow!("classify_agent LLM call failed: {e:?}"))?;

    let args = response
        .candidates
        .and_then(|c| c.into_iter().next())
        .and_then(|c| c.content)
        .and_then(|content| content.parts)
        .and_then(|parts| {
            parts.into_iter().find_map(|p| {
                p.function_call
                    .filter(|fc| fc.name == CLASSIFY_TOOL_NAME)
                    .and_then(|fc| fc.args)
            })
        });

    Ok(match args {
        Some(args) => parse_classification(&args, existing_agents),
        None => fallback_classification(existing_agents),
    })
}

/// Map the tool-call arguments to a classification. An "existing" verdict only
/// holds when the model returns a known agent id; otherwise treat it as new.
fn parse_classification(args: &Value, existing_agents: &[AgentVersion]) -> AgentClassification {
    let is_new = args
        .get("is_new_agent")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    if !is_new {
        if let Some(agent_id) = args
            .get("agent_id")
            .and_then(|v| v.as_str())
            .and_then(|s| Uuid::parse_str(s).ok())
        {
            if existing_agents.iter().any(|a| a.agent_id == agent_id) {
                return AgentClassification::ExistingAgent { agent_id };
            }
        }
    }

    let name = args
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .trim()
        .to_string();
    AgentClassification::NewAgent { name }
}

/// No LLM (or it failed): an empty project is a new agent, otherwise attribute
/// to the most recent existing agent. `list_latest_agent_versions` orders rows
/// by `agent_id` (a `DISTINCT ON` requirement), not by recency, so pick by the
/// latest-version `created_at` rather than relying on list order.
fn fallback_classification(existing_agents: &[AgentVersion]) -> AgentClassification {
    match existing_agents.iter().max_by_key(|a| a.created_at) {
        None => AgentClassification::NewAgent {
            name: String::new(),
        },
        Some(agent) => AgentClassification::ExistingAgent {
            agent_id: agent.agent_id,
        },
    }
}

fn build_context(system_prompt: &str, existing_agents: &[AgentVersion]) -> String {
    let mut ctx = format!(
        "Incoming agent system prompt:\n{}\n\nExisting agents in this project:\n",
        truncate_chars(system_prompt, INCOMING_PROMPT_LIMIT)
    );
    if existing_agents.is_empty() {
        ctx.push_str("(none)\n");
    } else {
        for agent in existing_agents {
            ctx.push_str(&format!(
                "\n[agent_id={}]\n{}\n",
                agent.agent_id,
                truncate_chars(&agent.system_prompt, EXISTING_PROMPT_LIMIT)
            ));
        }
    }
    ctx
}

fn build_classify_tool() -> ProviderTool {
    ProviderTool {
        function_declarations: vec![ProviderFunctionDeclaration {
            name: CLASSIFY_TOOL_NAME.to_string(),
            description: "REQUIRED: report whether the incoming system prompt is a new agent or a \
                variant of an existing one. Always call this tool; never respond with plain text."
                .to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "is_new_agent": {
                        "type": "boolean",
                        "description": "true if the incoming prompt is a completely different agent (different role/purpose) than every existing agent; false if it is a variant or modified version of one of them."
                    },
                    "agent_id": {
                        "type": "string",
                        "description": "When is_new_agent is false, the id of the existing agent this prompt is a variant of. Must be exactly one of the provided existing agent ids."
                    },
                    "name": {
                        "type": "string",
                        "description": "When is_new_agent is true, a short human-readable name (2-4 words) describing the new agent's role."
                    }
                },
                "required": ["is_new_agent"]
            }),
        }],
    }
}

fn truncate_chars(s: &str, max: usize) -> String {
    match s.char_indices().nth(max) {
        Some((idx, _)) => format!("{}…", &s[..idx]),
        None => s.to_string(),
    }
}
