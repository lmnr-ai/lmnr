//! LLM-based agent classification for checkpoints.

use std::sync::Arc;

use uuid::Uuid;

use crate::{db::agents::AgentVersion, llm::LlmClient};

/// Result of the LLM classification: is the incoming system prompt a brand-new
/// agent, or a modified version of an existing one?
#[derive(Debug, Clone)]
pub enum AgentClassification {
    /// No existing agent matches — create a new one.
    NewAgent,
    /// A modified version of an existing agent.
    ExistingAgent { agent_id: Uuid },
}

/// Ask the LLM whether `non_dynamic_system_prompt` represents a new agent or a
/// modification of one of `existing_agents`.
///
/// TODO: thread an LLM client through here when implementing — the handler
/// will need to be given one (gated on the LLM provider being configured).
pub async fn classify_agent(
    non_dynamic_system_prompt: &str,
    existing_agents: &[AgentVersion],
    llm_client: Option<Arc<LlmClient>>,
) -> anyhow::Result<AgentClassification> {
    // TODO: implement

    let _ = (non_dynamic_system_prompt, existing_agents, llm_client);
    if existing_agents.is_empty() {
        return Ok(AgentClassification::NewAgent);
    }

    Ok(AgentClassification::ExistingAgent {
        agent_id: (existing_agents[0].agent_id),
    })
}
