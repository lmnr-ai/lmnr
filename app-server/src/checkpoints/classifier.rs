//! LLM-based agent classification for checkpoints.

use std::{collections::HashMap, sync::Arc};

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

#[derive(Debug, thiserror::Error)]
enum ClassifyError {
    #[error("classify_agent transport failure: {0}")]
    Transport(anyhow::Error),
    #[error("classify_agent rejected: {0}")]
    Rejected(anyhow::Error),
}

const CLASSIFY_INSTRUCTION: &str = "You classify AI agent system prompts. Given an incoming agent's system prompt and a list of \
     existing agents (each with an id and one or more known versions of its system prompt, since \
     several versions of one agent can run at the same time), decide whether the incoming prompt is \
     a completely new agent or another version of one of the existing agents. Matching ANY ONE of an \
     agent's listed versions means the incoming prompt belongs to that agent.\n\n\
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

/// Decide whether `non_dynamic_system_prompt` is a new agent or another version
/// of an existing one. `existing_versions` carries EVERY known version of the
/// project's agents (newest first, capped by the caller), not just each agent's
/// latest — see [`crate::db::agents::list_recent_agent_versions`]. With no LLM
/// provider, or on a transport failure, falls back to the most recently created
/// version's agent (`fallback_classification`, which errors rather than mint a
/// nameless agent). A rejected verdict (e.g. new agent with no name) is NOT
/// eligible for fallback and propagates so the checkpoint is dropped.
pub async fn classify_agent(
    non_dynamic_system_prompt: &str,
    existing_versions: &[AgentVersion],
    llm_client: Option<Arc<LlmClient>>,
    root: &CheckpointRoot,
) -> anyhow::Result<AgentClassification> {
    let Some(llm_client) = llm_client else {
        return fallback_classification(existing_versions);
    };

    match classify_with_llm(
        &llm_client,
        non_dynamic_system_prompt,
        existing_versions,
        root,
    )
    .await
    {
        Ok(classification) => Ok(classification),
        Err(ClassifyError::Transport(e)) => {
            log::warn!("[CHECKPOINTS] Agent classification failed, falling back: {e:?}");
            fallback_classification(existing_versions)
        }
        Err(ClassifyError::Rejected(e)) => {
            log::warn!("[CHECKPOINTS] Agent classification rejected, dropping checkpoint: {e:?}");
            Err(e)
        }
    }
}

async fn classify_with_llm(
    llm_client: &LlmClient,
    system_prompt: &str,
    existing_versions: &[AgentVersion],
    root: &CheckpointRoot,
) -> Result<AgentClassification, ClassifyError> {
    let request = ProviderRequest {
        contents: vec![ProviderContent {
            role: Some("user".to_string()),
            parts: Some(vec![ProviderPart {
                text: Some(build_context(system_prompt, existing_versions)),
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
        service_tier: None,
        provider: None,
        model_size: Some(ModelSize::Small),
    };

    let response = run_llm(
        root,
        llm_client,
        &request,
        || tracing::info_span!(target: "lmnr::internal", "classify_agent"),
    )
    .await
    .map_err(|e| {
        ClassifyError::Transport(anyhow::anyhow!("classify_agent LLM call failed: {e:?}"))
    })?;

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

    match args {
        // An invalid verdict is a rejection (drop), not a transport failure.
        Some(args) => {
            parse_classification(&args, existing_versions).map_err(ClassifyError::Rejected)
        }
        // No tool call: nothing usable, let the caller fall back.
        None => Err(ClassifyError::Transport(anyhow::anyhow!(
            "classify_agent returned no tool call"
        ))),
    }
}

/// Map the tool-call arguments to a classification. An "existing" verdict only
/// holds when the model returns a known agent id; a "new" verdict requires a
/// non-empty name — an omitted/blank name is an error rather than a nameless
/// agent, so the checkpoint is dropped (and re-triggered later) instead.
fn parse_classification(
    args: &Value,
    existing_versions: &[AgentVersion],
) -> anyhow::Result<AgentClassification> {
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
            if existing_versions.iter().any(|v| v.agent_id == agent_id) {
                return Ok(AgentClassification::ExistingAgent { agent_id });
            }
        }
    }

    let name = args
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .trim()
        .to_string();
    if name.is_empty() {
        anyhow::bail!("classify_agent returned a new agent with no name");
    }
    Ok(AgentClassification::NewAgent { name })
}

fn fallback_classification(
    existing_versions: &[AgentVersion],
) -> anyhow::Result<AgentClassification> {
    match existing_versions.iter().max_by_key(|v| v.created_at) {
        None => anyhow::bail!(
            "cannot classify a new agent without an LLM provider (no existing agents to attribute to)"
        ),
        Some(version) => Ok(AgentClassification::ExistingAgent {
            agent_id: version.agent_id,
        }),
    }
}

/// Render the incoming prompt plus every existing version, grouped under its
/// agent. Versions of one agent are listed together so the model sees that
/// concurrently-live variants (A/B tests, subversions) belong to the same agent
/// instead of treating each as an unrelated candidate. Versions whose prompt is
/// identical after truncation collapse into one entry — they'd differ only in
/// tools/model, which classification ignores.
fn build_context(system_prompt: &str, existing_versions: &[AgentVersion]) -> String {
    let mut ctx = format!(
        "Incoming agent system prompt:\n{}\n\nExisting agents in this project:\n",
        crate::utils::truncate_chars(system_prompt, INCOMING_PROMPT_LIMIT)
    );
    if existing_versions.is_empty() {
        ctx.push_str("(none)\n");
        return ctx;
    }

    // First-seen order wins. The caller orders rank-within-agent first, so
    // agents appear in order of their newest version and each agent's versions
    // stay newest-first.
    let mut order: Vec<Uuid> = Vec::new();
    let mut prompts_by_agent: HashMap<Uuid, Vec<String>> = HashMap::new();
    for version in existing_versions {
        let prompts = prompts_by_agent.entry(version.agent_id).or_insert_with(|| {
            order.push(version.agent_id);
            Vec::new()
        });
        let prompt = crate::utils::truncate_chars(&version.system_prompt, EXISTING_PROMPT_LIMIT);
        if !prompts.contains(&prompt) {
            prompts.push(prompt);
        }
    }

    for agent_id in order {
        ctx.push_str(&format!("\n[agent_id={agent_id}]\n"));
        let prompts = &prompts_by_agent[&agent_id];
        for (i, prompt) in prompts.iter().enumerate() {
            if prompts.len() > 1 {
                ctx.push_str(&format!("(version {} of {})\n", i + 1, prompts.len()));
            }
            ctx.push_str(prompt);
            ctx.push('\n');
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_project_no_llm_errors_instead_of_blank_agent() {
        assert!(fallback_classification(&[]).is_err());
    }

    #[test]
    fn new_agent_with_blank_name_is_error() {
        let args = serde_json::json!({ "is_new_agent": true, "name": "  " });
        assert!(parse_classification(&args, &[]).is_err());
    }

    #[test]
    fn new_agent_with_missing_name_is_error() {
        let args = serde_json::json!({ "is_new_agent": true });
        assert!(parse_classification(&args, &[]).is_err());
    }

    fn version(agent_id: Uuid, system_prompt: &str) -> AgentVersion {
        AgentVersion {
            project_id: Uuid::nil(),
            agent_id,
            version_hash: system_prompt.to_string(),
            system_prompt: system_prompt.to_string(),
            tool_definitions: String::new(),
            model: "model".to_string(),
            created_at: chrono::Utc::now(),
        }
    }

    #[test]
    fn context_groups_concurrent_versions_under_one_agent() {
        let a = Uuid::new_v4();
        let b = Uuid::new_v4();
        let ctx = build_context(
            "incoming",
            &[
                version(a, "researcher v2"),
                version(b, "planner"),
                version(a, "researcher v1"),
            ],
        );

        // Both of agent A's live versions are listed once, under a single id.
        assert_eq!(ctx.matches(&format!("[agent_id={a}]")).count(), 1);
        assert!(ctx.contains("researcher v2"));
        assert!(ctx.contains("researcher v1"));
        assert!(ctx.contains("(version 1 of 2)"));
        // A single-version agent gets no version labels.
        assert_eq!(ctx.matches("(version 1 of 1)").count(), 0);
        assert!(ctx.contains(&format!("[agent_id={b}]")));
    }

    #[test]
    fn context_collapses_duplicate_prompts_of_one_agent() {
        let a = Uuid::new_v4();
        let ctx = build_context("incoming", &[version(a, "same"), version(a, "same")]);
        assert_eq!(ctx.matches("same").count(), 1);
        assert_eq!(ctx.matches("(version").count(), 0);
    }

    #[test]
    fn new_agent_with_valid_name_is_ok() {
        let args = serde_json::json!({ "is_new_agent": true, "name": "Portfolio Manager" });
        match parse_classification(&args, &[]).unwrap() {
            AgentClassification::NewAgent { name } => assert_eq!(name, "Portfolio Manager"),
            _ => panic!("expected NewAgent"),
        }
    }
}
