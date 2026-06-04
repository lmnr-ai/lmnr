//! LLM-based agent classification for checkpoints (step 5).

use uuid::Uuid;

use super::version::ExistingAgent;

/// Result of the LLM classification: is the incoming system prompt a brand-new
/// agent, or a modified version of an existing one?
#[derive(Debug, Clone)]
pub enum AgentClassification {
    /// No existing agent matches — create a new one.
    NewAgent,
    /// A modified version of an existing agent.
    ExistingAgent {
        agent_id: Uuid,
        /// Structured diff describing what changed vs. the previous version,
        /// stored in `agent_versions.diff`.
        diff: Option<serde_json::Value>,
    },
}

/// Step 5: ask the LLM whether `non_dynamic_system_prompt` represents a new
/// agent or a modification of one of `existing_agents`.
///
/// TODO: thread an LLM client through here when implementing — the handler
/// will need to be given one (gated on the LLM provider being configured).
pub async fn classify_agent(
    non_dynamic_system_prompt: &str,
    existing_agents: &[ExistingAgent],
) -> anyhow::Result<AgentClassification> {
    let _ = (non_dynamic_system_prompt, existing_agents);
    Ok(AgentClassification::NewAgent)
}
