//! Publishes system prompts whose naive signature has no cached static-part
//! regex yet to the static-prompt queue.

use std::collections::HashSet;
use std::sync::Arc;

use uuid::Uuid;

use super::{
    STATIC_PROMPT_EXCHANGE, STATIC_PROMPT_ROUTING_KEY, consumer::StaticPromptQueueMessage,
    static_regex_cache_key,
};
use crate::{
    cache::{Cache, CacheTrait},
    mq::{MessageQueue, MessageQueueTrait},
    traces::input_extraction::llm_client_available,
};

/// An LLM span's system prompt paired with its naive signature
/// (`lmnr.span.prompt_hash`), collected on the ingest producer.
pub struct StaticPromptCandidate {
    pub project_id: Uuid,
    pub prompt_hash: String,
    pub system_prompt: String,
}

/// Publish candidates whose signature has no cached static-part regex.
/// Best-effort: cache/publish failures are logged and never propagated —
/// a later span with the same signature re-triggers.
pub async fn publish_static_prompt_candidates(
    candidates: Vec<StaticPromptCandidate>,
    cache: Arc<Cache>,
    queue: Arc<MessageQueue>,
) {
    // Without the shared LLM client the consumer can only drain the queue —
    // extraction never runs, the regex cache never fills, and every ingest
    // batch would re-publish the same signatures forever.
    if !llm_client_available() {
        return;
    }

    // Spans emitted by our own extraction self-tracing land in this project;
    // feeding them back into extraction would loop indefinitely.
    let internal_project_id =
        std::env::var(crate::env::connections::STATIC_PROMPT_INTERNAL_PROJECT_ID)
            .ok()
            .and_then(|s| Uuid::parse_str(&s).ok());

    let mut seen: HashSet<(Uuid, String)> = HashSet::new();
    let mut messages: Vec<StaticPromptQueueMessage> = Vec::new();

    for candidate in candidates {
        if internal_project_id == Some(candidate.project_id) {
            continue;
        }

        if !seen.insert((candidate.project_id, candidate.prompt_hash.clone())) {
            continue;
        }

        let regex_key = static_regex_cache_key(candidate.project_id, &candidate.prompt_hash);
        let cached = cache.exists(&regex_key).await.unwrap_or_else(|e| {
            log::warn!("[STATIC_PROMPT] Failed to read regex cache {regex_key}: {e:?}");
            // On cache errors, skip publishing rather than flooding the
            // queue with prompts that may already have a regex.
            true
        });
        if cached {
            continue;
        }

        messages.push(StaticPromptQueueMessage {
            project_id: candidate.project_id,
            prompt_hash: candidate.prompt_hash,
            system_prompt: candidate.system_prompt,
        });
    }

    if messages.is_empty() {
        return;
    }

    let payload = match serde_json::to_vec(&messages) {
        Ok(p) => p,
        Err(e) => {
            log::error!("[STATIC_PROMPT] Failed to serialize queue messages: {e:?}");
            return;
        }
    };

    if let Err(e) = queue
        .publish(
            &payload,
            STATIC_PROMPT_EXCHANGE,
            STATIC_PROMPT_ROUTING_KEY,
            None,
        )
        .await
    {
        log::error!("[STATIC_PROMPT] Failed to publish queue messages: {e:?}");
    }
}
