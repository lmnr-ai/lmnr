//! Subagent detection for checkpoints.

use super::consumer::CheckpointsQueueMessage;

/// Step 3: Determine whether this checkpoint belongs to a subagent.
pub fn is_subagent(message: &CheckpointsQueueMessage) -> bool {
    // TODO: classify the checkpoint as a subagent vs. the main agent.
    let _ = message;
    false
}
