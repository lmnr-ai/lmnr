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
    subagent, system_prompt, version,
};
use crate::{
    cache::Cache,
    ch::deduped_content,
    db::{DB, agents},
    llm::LlmClient,
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
    pub llm_client: Option<Arc<LlmClient>>,
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
        // Extract the stable part of the system prompt (no dynamic content).
        let stable_system_prompt = system_prompt::extract_stable_system_prompt(
            &message.system_prompt,
            self.cache.clone(),
            self.llm_client.clone(),
        )
        .await;

        // Compute a single version hash over (stable system prompt, tool
        // definitions hash, model). This is the agent version's identity.
        let version_hash = version::compute_version_hash(
            &stable_system_prompt,
            &message.tool_definitions_hash,
            &message.model,
        );

        // An exact (project_id, version_hash) match means this shape has
        // already been seen — nothing changed, quit.
        if agents::get_agent_by_version_hash(&self.db.pool, message.project_id, &version_hash)
            .await?
            .is_some()
        {
            return Ok(());
        }

        // A new version is being recorded — resolve the original tool
        // definitions from ClickHouse to store alongside it
        let tool_definitions = if message.tool_definitions_hash.is_empty() {
            String::new()
        } else {
            deduped_content::get_content_by_hash(
                &self.clickhouse,
                message.project_id,
                &message.tool_definitions_hash,
            )
            .await?
            .unwrap_or_default()
        };

        // No exact match — ask the LLM whether this is a brand-new agent or
        // a modified version of an existing one, using the project's existing
        // agent system prompts as context.
        let existing_agents =
            agents::list_latest_agent_versions(&self.db.pool, message.project_id).await?;
        let classification =
            classifier::classify_agent(&stable_system_prompt, &existing_agents, self.llm_client.clone())
                .await?;

        // Create the new agent, or bump the matched agent's version.
        let agent_id = match classification {
            AgentClassification::NewAgent => {
                agents::create_agent(
                    &self.db.pool,
                    message.project_id,
                    &version_hash,
                    &stable_system_prompt,
                    &tool_definitions,
                    &message.model,
                )
                .await?
            }
            AgentClassification::ExistingAgent { agent_id } => {
                agents::create_new_agent_version(
                    &self.db.pool,
                    message.project_id,
                    agent_id,
                    &version_hash,
                    &stable_system_prompt,
                    &tool_definitions,
                    &message.model,
                )
                .await?;
                agent_id
            }
        };

        // If this checkpoint belongs to a subagent, bump every parent
        // agent's version too. Empty parent set == main agent == quit.
        // TODO: implement later, currently no op
        let parent_agent_ids = subagent::get_parent_agent_ids(&self.db, message, agent_id).await?;
        for parent_id in parent_agent_ids {
            agents::bump_parent_agent_version(
                &self.db.pool,
                message.project_id,
                parent_id,
                agent_id,
            )
            .await?;
        }

        Ok(())
    }
}
