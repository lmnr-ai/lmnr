//! Consumer for the checkpoints queue.
//!
//! Checkpoints capture the "shape" of an LLM call at the start of a
//! conversation — the raw system prompt, the tool-definitions hash, and the
//! model. The producer (`traces/producer.rs`) emits one per qualifying LLM
//! span (exactly two input messages, including a system prompt).
//!
//! The consumer turns each checkpoint into agent-versioning state: it detects
//! whether an agent's prompt/tools/model "shape" is new, modified, or
//! unchanged, persists the result to the `agents` / `agent_versions` tables,
//! and propagates version bumps up the subagent → parent chain.

use std::sync::Arc;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{
    classifier::{self, AgentClassification},
    subagent, system_prompt,
    version::{self, AgentFingerprint},
};
use crate::{
    cache::Cache,
    db::DB,
    worker::{HandlerError, MessageHandler},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckpointsQueueMessage {
    pub project_id: Uuid,
    pub system_prompt: String,
    pub tool_definitions_hash: String,
    pub model: String,
    pub span_ids_path: Vec<String>,
}

pub struct CheckpointsHandler {
    pub db: Arc<DB>,
    pub cache: Arc<Cache>,
    pub clickhouse: clickhouse::Client,
}

#[async_trait]
impl MessageHandler for CheckpointsHandler {
    type Message = Vec<CheckpointsQueueMessage>;

    async fn handle(&self, messages: Self::Message) -> Result<(), HandlerError> {
        log::debug!("Received {} checkpoint message(s)", messages.len());

        for message in &messages {
            // Per-message best effort: one bad checkpoint must not poison the
            // rest of the batch (and we don't want to requeue analytics work).
            if let Err(e) = self.process_checkpoint(message).await {
                log::error!("Failed to process checkpoint: {e:?}");
            }
        }

        Ok(())
    }
}

impl CheckpointsHandler {
    async fn process_checkpoint(&self, message: &CheckpointsQueueMessage) -> anyhow::Result<()> {
        // 1. Extract the non-dynamic (stable) part of the system prompt.
        let non_dynamic_system_prompt =
            system_prompt::extract_non_dynamic_system_prompt(&message.system_prompt);

        // 2. Hash the non-dynamic system prompt.
        let sys_prompt_hash = system_prompt::hash_system_prompt(&non_dynamic_system_prompt);

        let fingerprint = AgentFingerprint {
            sys_prompt_hash,
            tool_def_hash: message.tool_definitions_hash.clone(),
            model: message.model.clone(),
        };

        // 3 & 4. Look for an exact (sys_prompt_hash, tool_def_hash, model)
        // match in the project. An exact match means nothing changed — quit.
        if version::find_matching_agent_version(&self.db, message.project_id, &fingerprint)
            .await?
            .is_some()
        {
            return Ok(());
        }

        // 5. No exact match — ask the LLM whether this is a brand-new agent or
        // a modified version of an existing one, using the project's existing
        // agent system prompts as context.
        let existing_agents = version::list_existing_agents(&self.db, message.project_id).await?;
        let classification =
            classifier::classify_agent(&non_dynamic_system_prompt, &existing_agents).await?;

        // 6. Create the new agent, or bump the matched agent's version.
        let agent_id = match classification {
            AgentClassification::NewAgent => {
                version::create_agent(
                    &self.db,
                    message.project_id,
                    &fingerprint,
                    &non_dynamic_system_prompt,
                )
                .await?
            }
            AgentClassification::ExistingAgent { agent_id, diff } => {
                version::bump_agent_version(
                    &self.db,
                    message.project_id,
                    agent_id,
                    &fingerprint,
                    diff,
                )
                .await?;
                agent_id
            }
        };

        // 7. If this checkpoint belongs to a subagent, bump every parent
        // agent's version too. Empty parent set == main agent == quit.
        let parent_agent_ids = subagent::get_parent_agent_ids(&self.db, message, agent_id).await?;
        for parent_id in parent_agent_ids {
            version::bump_parent_agent_version(&self.db, message.project_id, parent_id, agent_id)
                .await?;
        }

        Ok(())
    }
}
