//! Subagent detection for checkpoints.

use uuid::Uuid;

use super::consumer::CheckpointsQueueMessage;
use crate::db::DB;

/// Resolve the parent agent(s) of `agent_id` when this checkpoint belongs to a
/// subagent. Returns an empty vec when this is a main agent
/// (caller then quits without bumping anything).
///
/// Parentage is inferred from `message.span_ids_path` (the span hierarchy)
/// and resolved against the `agents` table.
pub async fn get_parent_agent_ids(
    db: &DB,
    message: &CheckpointsQueueMessage,
    agent_id: Uuid,
) -> anyhow::Result<Vec<Uuid>> {
    // TODO: walk span_ids_path up the hierarchy, map ancestor spans to agents,
    // and return their ids (parent chain).
    let _ = (db, message, agent_id);
    Ok(Vec::new())
}
