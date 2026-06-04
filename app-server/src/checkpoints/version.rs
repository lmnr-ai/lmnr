//! Agent + agent-version persistence for checkpoints (steps 3, 4, 6, 7).
//!
//! Backed by the `agents` and `agent_versions` tables. All functions here are
//! templates — DB wiring is intentionally left unimplemented.

use uuid::Uuid;

use crate::db::DB;

/// The combination that identifies an agent version's "shape". Mirrors the
/// `(sys_prompt_hash, tool_def_hash, model)` columns on `agent_versions`.
#[derive(Debug, Clone)]
pub struct AgentFingerprint {
    pub sys_prompt_hash: String,
    pub tool_def_hash: String,
    pub model: String,
}

/// An existing agent's latest non-dynamic system prompt — context for the LLM
/// classifier (step 5).
#[derive(Debug, Clone)]
pub struct ExistingAgent {
    pub agent_id: Uuid,
    pub system_prompt: String,
}

/// Step 3 & 4: Look for an agent version whose fingerprint exactly matches the
/// incoming checkpoint. `Some(agent_id)` means nothing changed (caller quits).
pub async fn find_matching_agent_version(
    db: &DB,
    project_id: Uuid,
    fingerprint: &AgentFingerprint,
) -> anyhow::Result<Option<Uuid>> {
    // TODO: SELECT from agent_versions (joined to agents) WHERE project_id,
    // sys_prompt_hash, tool_def_hash, model all match.
    let _ = (db, project_id, fingerprint);
    Ok(None)
}

/// List the project's existing agents (with their latest non-dynamic system
/// prompts) so the classifier can compare against them.
pub async fn list_existing_agents(
    db: &DB,
    project_id: Uuid,
) -> anyhow::Result<Vec<ExistingAgent>> {
    // TODO: SELECT distinct agents + their latest agent_versions row.
    let _ = (db, project_id);
    Ok(Vec::new())
}

/// Step 6 (new agent): create a new `agents` row plus its first
/// `agent_versions` row. Returns the new agent id.
pub async fn create_agent(
    db: &DB,
    project_id: Uuid,
    fingerprint: &AgentFingerprint,
    non_dynamic_system_prompt: &str,
) -> anyhow::Result<Uuid> {
    // TODO: INSERT into agents (parent_id null — linked later if it turns out
    // to be a subagent) and the first agent_versions row.
    let _ = (db, project_id, fingerprint, non_dynamic_system_prompt);
    Ok(Uuid::nil())
}

/// Step 6 (existing agent): append a new `agent_versions` row for an existing
/// agent whose shape changed.
pub async fn bump_agent_version(
    db: &DB,
    project_id: Uuid,
    agent_id: Uuid,
    fingerprint: &AgentFingerprint,
    diff: Option<serde_json::Value>,
) -> anyhow::Result<()> {
    // TODO: INSERT a new agent_versions row (with the computed version string
    // + diff) for this agent.
    let _ = (db, project_id, agent_id, fingerprint, diff);
    Ok(())
}

/// Step 7: bump a parent agent's version because one of its subagents changed.
///
/// The parent's own prompt/tools/model are unchanged, so this carries the
/// parent's current fingerprint forward and records a diff noting which
/// subagent triggered the bump.
pub async fn bump_parent_agent_version(
    db: &DB,
    project_id: Uuid,
    parent_id: Uuid,
    changed_child_id: Uuid,
) -> anyhow::Result<()> {
    // TODO: load the parent's current fingerprint, then INSERT a new
    // agent_versions row referencing `changed_child_id` in its diff.
    let _ = (db, project_id, parent_id, changed_child_id);
    Ok(())
}
