//! Publishes system prompts for classification.
//!
//! Single ingest entry point ([`publish_static_prompt_candidates`]): shared
//! guards (LLM availability, internal-project filter), then a feature-flag
//! dispatch. `Feature::SystemPromptVersioning` routes to this pipeline's
//! queue; the legacy skeleton-hash pipeline
//! (`static_sp_extraction::producer`) keeps receiving candidates until
//! `Feature::SignalsVersionedPrompts` makes the v2 registry the read path,
//! so during the observation window BOTH pipelines are fed.
//!
//! v2 messages are grouped by byte-identity within the batch: a memo hit
//! (prompt already classified) ships a slim message with the known version
//! hash and no body; a miss ships the raw prompt for consumer-side
//! classification.

use std::sync::Arc;

use indexmap::IndexMap;
use uuid::Uuid;

use super::{
    SP_VERSIONING_EXCHANGE, SP_VERSIONING_ROUTING_KEY, consumer::SpVersioningMessage, similarity,
    versions, window::SpanRef,
};
use crate::{
    cache::Cache,
    features::{Feature, is_feature_enabled},
    llm::llm_client_available,
    mq::{MessageQueue, MessageQueueTrait},
};

/// An LLM span's system prompt paired with its hashes, collected on the
/// ingest producer.
pub struct StaticPromptCandidate {
    pub project_id: Uuid,
    /// Source trace — the legacy accumulator keeps at most one sample per
    /// trace; v2 window entries key on it for raw refetch.
    pub trace_id: Uuid,
    pub span_id: Uuid,
    /// Naive signature (`lmnr.span.prompt_hash`), the legacy pipeline's key.
    pub prompt_hash: String,
    /// First-sentence hash (`lmnr.span.agent_hash`) — the v2 agent identity.
    pub agent_hash: String,
    pub system_prompt: String,
}

/// Spans emitted by our own extraction self-tracing land in these projects;
/// feeding them back into extraction would loop indefinitely.
pub(crate) fn internal_project_ids() -> Vec<Uuid> {
    [
        crate::env::connections::STATIC_SP_INTERNAL_PROJECT_ID,
        crate::env::connections::SIGNALS_INTERNAL_PROJECT_ID,
    ]
    .iter()
    .filter_map(|name| std::env::var(name).ok())
    .filter_map(|s| Uuid::parse_str(&s).ok())
    .collect()
}

/// Publish candidates to the active pipeline's queue. Best-effort:
/// cache/publish failures are logged and never propagated — a later span
/// with the same prompt re-triggers.
pub async fn publish_static_prompt_candidates(
    candidates: Vec<StaticPromptCandidate>,
    cache: Arc<Cache>,
    queue: Arc<MessageQueue>,
) {
    // Without the shared LLM client the extraction workers never spawn, the
    // regex caches never fill, and every ingest batch would re-publish the
    // same prompts forever.
    if !llm_client_available() {
        return;
    }

    let internal_ids = internal_project_ids();
    let candidates: Vec<StaticPromptCandidate> = candidates
        .into_iter()
        .filter(|c| !internal_ids.contains(&c.project_id))
        .collect();
    if candidates.is_empty() {
        return;
    }

    // The two flags gate PUBLISHING and READING independently, so the legacy
    // queue must keep being fed for as long as the legacy regex cache is what
    // signals reads. During the observation window (versioning on,
    // `SignalsVersionedPrompts` off) BOTH pipelines run: dispatching
    // exclusively on `SystemPromptVersioning` would stop filling the legacy
    // cache while summarization still depends on it, so every new signature
    // would fall back to its raw prompt. Cost of the overlap is one extra
    // extraction per new signature, only until signals switch over.
    if !is_feature_enabled(Feature::SignalsVersionedPrompts) {
        crate::traces::static_sp_extraction::producer::publish_legacy_candidates(
            &candidates,
            &cache,
            &queue,
        )
        .await;
    }

    if !is_feature_enabled(Feature::SystemPromptVersioning) {
        return;
    }

    let messages = build_v2_messages(candidates, &cache).await;
    if messages.is_empty() {
        return;
    }

    let payload = match serde_json::to_vec(&messages) {
        Ok(p) => p,
        Err(e) => {
            log::error!("[SP_VERSIONING] Failed to serialize queue messages: {e:?}");
            return;
        }
    };

    if let Err(e) = queue
        .publish(
            &payload,
            SP_VERSIONING_EXCHANGE,
            SP_VERSIONING_ROUTING_KEY,
            None,
        )
        .await
    {
        log::error!("[SP_VERSIONING] Failed to publish queue messages: {e:?}");
    }
}

/// One message per distinct prompt body in the batch, carrying every span
/// that presented it. One memo GET per distinct prompt decides slim (version
/// already known — no body on the wire) vs full.
async fn build_v2_messages(
    candidates: Vec<StaticPromptCandidate>,
    cache: &Cache,
) -> Vec<SpVersioningMessage> {
    struct Group {
        agent_hash: String,
        system_prompt: String,
        span_refs: Vec<SpanRef>,
    }

    let mut groups: IndexMap<(Uuid, String), Group> = IndexMap::new();
    for candidate in candidates {
        let full_prompt_hash = similarity::full_prompt_hash(&candidate.system_prompt);
        let group = groups
            .entry((candidate.project_id, full_prompt_hash))
            .or_insert_with(|| Group {
                agent_hash: candidate.agent_hash.clone(),
                system_prompt: candidate.system_prompt.clone(),
                span_refs: Vec::new(),
            });
        let span_ref = SpanRef {
            trace_id: candidate.trace_id,
            span_id: candidate.span_id,
        };
        if !group.span_refs.contains(&span_ref) {
            group.span_refs.push(span_ref);
        }
    }

    let mut messages = Vec::with_capacity(groups.len());
    for ((project_id, full_prompt_hash), group) in groups {
        let known_version_hash = versions::memo_get(cache, project_id, &full_prompt_hash).await;
        let system_prompt = if known_version_hash.is_some() {
            String::new()
        } else {
            group.system_prompt
        };
        messages.push(SpVersioningMessage {
            project_id,
            system_prompt,
            agent_hash: group.agent_hash,
            full_prompt_hash,
            span_refs: group.span_refs,
            known_version_hash,
            retry_count: 0,
        });
    }
    messages
}
