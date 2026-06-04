//! Consumer for the checkpoints queue.
//!
//! Checkpoints capture the "shape" of an LLM call at the start of a
//! conversation — the raw system prompt, the tool-definitions hash, and the
//! model. The producer (`traces/producer.rs`) emits one per qualifying LLM
//! span (exactly two input messages, including a system prompt). The handler
//! is a no-op for now.

use std::sync::Arc;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use super::{subagent, system_prompt, version};
use crate::{
    cache::Cache,
    db::DB,
    worker::{HandlerError, MessageHandler},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckpointsQueueMessage {
    pub system_prompt: String,
    pub tool_definitions_hash: String,
    pub model: String,
    pub span_ids_path: Vec<String>,
}

/// No-op handler for checkpoint messages.
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
            // 1. Extract non-dynamic system prompt
            let non_dynamic_system_prompt =
                system_prompt::extract_non_dynamic_system_prompt(&message.system_prompt);

            // 2. Check if agent version has changed
            let version_changed =
                version::agent_version_changed(message, &non_dynamic_system_prompt).await;

            // 3. Check if subagent
            let is_subagent = subagent::is_subagent(message);

            // 4. Bump main agent version if subagent version changed
            if is_subagent && version_changed {
                version::bump_main_agent_version(message).await;
            }
        }

        Ok(())
    }
}
