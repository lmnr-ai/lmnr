//! Agent versioning for checkpoints.

use super::consumer::CheckpointsQueueMessage;

/// Step 2: Determine whether the agent version has changed.
///
/// Compares the incoming checkpoint's fingerprint (non-dynamic system prompt +
/// tool definitions + model) against the latest known version for this agent.
pub async fn agent_version_changed(
    message: &CheckpointsQueueMessage,
    non_dynamic_system_prompt: &str,
) -> bool {
    // TODO: look up the latest stored version and compare against the
    // current fingerprint.
    let _ = (message, non_dynamic_system_prompt);
    false
}

/// Step 4: Bump the main agent's version when a subagent's version changed.
pub async fn bump_main_agent_version(message: &CheckpointsQueueMessage) {
    // TODO: persist a new main-agent version derived from the changed subagent.
    let _ = message;
}
