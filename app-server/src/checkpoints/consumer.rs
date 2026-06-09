//! Consumer for the checkpoints queue.
//!
//! Checkpoints capture the "shape" of an LLM call at the start of a
//! conversation — the raw system prompt, the tool-definitions hash, and the
//! model. The producer (`traces/producer.rs`) emits one per qualifying LLM
//! span (exactly two input messages, including a system prompt).
//!
//! The consumer turns each checkpoint into agent-versioning state: it detects
//! whether an agent's prompt/tools/model "shape" is new, modified, or
//! unchanged, and persists the result to the `agents` / `agent_versions` tables.

use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use super::{
    classifier::{self, AgentClassification},
    llm, system_prompt, version,
};
use crate::{
    cache::{
        Cache, CacheTrait,
        keys::{AGENT_CLASSIFY_LOCK_CACHE_KEY, AGENT_VERSION_HASH_CACHE_KEY},
    },
    ch::deduped_content,
    db::{DB, agents},
    llm::LlmClient,
    mq::MessageQueue,
    traces::metadata::publish_trace_metadata_patch,
    worker::{HandlerError, MessageHandler},
};

/// TTL on the per-project classify lock. Must comfortably exceed the worst-case
/// classify-and-write latency (multiple LLM round-trips) so the lock doesn't
/// expire mid-flight, but short enough that a crashed holder frees the project
/// promptly.
const AGENT_CLASSIFY_LOCK_TTL_SECONDS: u64 = 60;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckpointsQueueMessage {
    pub project_id: Uuid,
    pub trace_id: Uuid,
    pub span_id: Uuid,
    pub system_prompt: String,
    pub tool_definitions_hash: String,
    pub model: String,
    /// Skeleton hash precomputed on ingest (`lmnr.span.prompt_hash`).
    pub prompt_hash: String,
}

pub struct CheckpointsHandler {
    pub db: Arc<DB>,
    pub cache: Arc<Cache>,
    pub clickhouse: clickhouse::Client,
    pub llm_client: Option<Arc<LlmClient>>,
    pub queue: Arc<MessageQueue>,
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
    fn internal_project_id() -> Option<Uuid> {
        std::env::var("CHECKPOINTS_INTERNAL_PROJECT_ID")
            .ok()
            .and_then(|s| s.parse().ok())
    }

    async fn process_checkpoint(&self, message: &CheckpointsQueueMessage) -> anyhow::Result<()> {
        // Lazy root: emits a `checkpoint` trace only if some LLM call runs.
        let root = llm::CheckpointRoot::new(
            Self::internal_project_id(),
            message.project_id,
            message.trace_id,
            message.span_id,
        );
        self.process_checkpoint_inner(message, &root).await
    }

    async fn process_checkpoint_inner(
        &self,
        message: &CheckpointsQueueMessage,
        root: &llm::CheckpointRoot,
    ) -> anyhow::Result<()> {
        let system_prompt_text =
            crate::traces::prompt_hash::strip_claude_code_billing_header(&message.system_prompt);

        // Extract the stable part of the system prompt (no dynamic content).
        let stable_system_prompt = system_prompt::extract_stable_system_prompt(
            &system_prompt_text,
            &message.prompt_hash,
            message.project_id,
            self.cache.clone(),
            self.llm_client.clone(),
            root,
        )
        .await;

        // Compute a single version hash over (stable system prompt, tool
        // definitions hash, model). This is the agent version's identity.
        let version_hash = version::compute_version_hash(
            &stable_system_prompt,
            &message.tool_definitions_hash,
            &message.model,
        );

        // Known shape: skip minting, but still tag the trace below.
        let agent_id = if let Some(agent_id) = self
            .get_known_agent_id(message.project_id, &version_hash)
            .await?
        {
            Some(agent_id)
        } else {
            // A genuinely new shape. Classification compares against ALL of the
            // project's existing agents, and stable-prompt extraction is itself an
            // LLM call that can yield different hashes for the same real agent — so
            // the read→classify→write critical section must be serialized PER
            // PROJECT, otherwise two workers each miss the other's in-flight agent
            // and mint duplicates. Acquire a per-project lock; if another worker
            // holds it, drop this span. The shape isn't cached, so a later span of
            // the same shape re-triggers once the lock frees — at worst a tiny delay.
            let lock_key = Self::classify_lock_key(message.project_id);
            let acquired = self
                .cache
                .try_acquire_lock(&lock_key, AGENT_CLASSIFY_LOCK_TTL_SECONDS)
                .await
                .unwrap_or_else(|e| {
                    log::warn!("Failed to acquire agent classify lock {lock_key}: {e:?}");
                    false
                });
            if !acquired {
                log::debug!(
                    "Agent classify lock held for project {}; dropping checkpoint (will re-trigger)",
                    message.project_id
                );
                return Ok(());
            }

            // Run the critical section, then ALWAYS release the lock — including
            // on error — so a failed classify/write can't freeze the project
            // until TTL.
            let result = self
                .process_new_version_locked(message, &stable_system_prompt, &version_hash, root)
                .await;

            if let Err(e) = self.cache.release_lock(&lock_key).await {
                log::warn!("Failed to release agent classify lock {lock_key}: {e:?}");
            }

            result?
        };

        if let Some(agent_id) = agent_id {
            self.tag_trace_with_agent(message, agent_id, &version_hash)
                .await;
        }

        Ok(())
    }

    /// Critical section, run under the per-project classify lock: re-check the
    /// hash, classify against existing agents, and write the new agent/version.
    async fn process_new_version_locked(
        &self,
        message: &CheckpointsQueueMessage,
        stable_system_prompt: &str,
        version_hash: &str,
        root: &llm::CheckpointRoot,
    ) -> anyhow::Result<Option<Uuid>> {
        // Re-check under the lock: another worker may have just written this
        // exact shape between our fast-path miss and acquiring the lock.
        if let Some(agent_id) = self
            .get_known_agent_id(message.project_id, version_hash)
            .await?
        {
            return Ok(Some(agent_id));
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
        let classification = classifier::classify_agent(
            &stable_system_prompt,
            &existing_agents,
            self.llm_client.clone(),
            root,
        )
        .await?;

        // Create the new agent, or bump the matched agent's version.
        let agent_id = match classification {
            AgentClassification::NewAgent { name } => {
                agents::create_agent(
                    &self.db.pool,
                    message.project_id,
                    &name,
                    version_hash,
                    stable_system_prompt,
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
                    version_hash,
                    stable_system_prompt,
                    &tool_definitions,
                    &message.model,
                )
                .await?;
                agent_id
            }
        };

        // Cache the freshly-written shape so the next identical checkpoint
        // short-circuits at the read-through above instead of hitting the DB.
        self.cache_version_hash(message.project_id, version_hash, agent_id)
            .await;

        Ok(Some(agent_id))
    }

    /// Best-effort: write `agent_id` + `version_hash` to the trace's metadata.
    async fn tag_trace_with_agent(
        &self,
        message: &CheckpointsQueueMessage,
        agent_id: Uuid,
        version_hash: &str,
    ) {
        let metadata = HashMap::from([
            ("agent_id".to_string(), Value::String(agent_id.to_string())),
            (
                "version_hash".to_string(),
                Value::String(version_hash.to_string()),
            ),
        ]);
        if let Err(e) = publish_trace_metadata_patch(
            message.trace_id,
            message.project_id,
            metadata,
            self.queue.clone(),
            self.db.clone(),
            self.cache.clone(),
        )
        .await
        {
            log::error!(
                "[CHECKPOINTS] Failed to tag trace {} with agent metadata: {e:?}",
                message.trace_id
            );
        }
    }

    /// `agent_id` for a known `(project_id, version_hash)` shape, else `None`.
    /// Reads through the cache; a DB hit back-fills it (the mapping is immutable).
    async fn get_known_agent_id(
        &self,
        project_id: Uuid,
        version_hash: &str,
    ) -> anyhow::Result<Option<Uuid>> {
        let cache_key = Self::version_hash_cache_key(project_id, version_hash);
        if let Some(agent_id) = self.cache.get::<Uuid>(&cache_key).await.unwrap_or_else(|e| {
            log::warn!("Failed to read agent version-hash cache {cache_key}: {e:?}");
            None
        }) {
            return Ok(Some(agent_id));
        }

        if let Some(agent_id) =
            agents::get_agent_by_version_hash(&self.db.pool, project_id, version_hash).await?
        {
            self.cache_version_hash(project_id, version_hash, agent_id)
                .await;
            return Ok(Some(agent_id));
        }

        Ok(None)
    }

    /// Best-effort write of the `(project_id, version_hash) → agent_id`
    /// mapping. No TTL — the mapping never changes. Cache failures must not
    /// fail the checkpoint, so errors are logged and swallowed.
    async fn cache_version_hash(&self, project_id: Uuid, version_hash: &str, agent_id: Uuid) {
        let cache_key = Self::version_hash_cache_key(project_id, version_hash);
        if let Err(e) = self.cache.insert::<Uuid>(&cache_key, agent_id).await {
            log::warn!("Failed to write agent version-hash cache {cache_key}: {e:?}");
        }
    }

    fn version_hash_cache_key(project_id: Uuid, version_hash: &str) -> String {
        format!("{AGENT_VERSION_HASH_CACHE_KEY}:{project_id}:{version_hash}")
    }

    /// Per-project lock key serializing the classify-and-write critical section.
    fn classify_lock_key(project_id: Uuid) -> String {
        format!("{AGENT_CLASSIFY_LOCK_CACHE_KEY}:{project_id}")
    }
}
