//! Publishes system prompts for classification.
//!
//! Single ingest entry point ([`publish_static_prompt_candidates`]): shared
//! guards (LLM availability, internal-project filter), then a feature-flag
//! dispatch — `Feature::StaticSpV2` routes to this pipeline's queue, off
//! routes to the legacy skeleton-hash pipeline
//! (`static_sp_extraction::producer`).
//!
//! v2 messages are grouped by byte-identity within the batch: a memo hit
//! (prompt already classified) ships a slim message with the known version
//! hash and no body; a miss ships the raw prompt for consumer-side
//! classification.

use std::collections::HashMap;
use std::sync::{Arc, LazyLock};

use indexmap::IndexMap;
use uuid::Uuid;

use super::{
    SP_VERSIONING_EXCHANGE, SP_VERSIONING_ROUTING_KEY, consumer::SpVersioningMessage, similarity,
    versions, window::SpanRef,
};
use crate::{
    cache::{Cache, CacheTrait, keys::SYSTEM_PROMPT_PROBE_CACHE_KEY},
    features::{Feature, is_feature_enabled},
    llm::llm_client_available,
    mq::{MessageQueue, MessageQueueTrait},
};

static FULL_RUN_INTERVAL_SECONDS: LazyLock<u64> =
    LazyLock::new(|| crate::env::static_sp::FULL_RUN_INTERVAL_SECONDS.get());

/// Marker key for [`should_probe`]. Shared across ingest pods, so the interval
/// means the same thing however many are running — a process-local tracker
/// would multiply the fleet-wide probe rate by the pod count and reset the
/// whole fleet's markers on every deploy.
fn probe_cache_key(project_id: Uuid, agent_hash: &str) -> String {
    format!("{SYSTEM_PROMPT_PROBE_CACHE_KEY}:{project_id}:{agent_hash}")
}

/// `full_prompt_hash → version_hash` for the prompts in one batch that resolved
/// inline. The user-task hook keys its regex cache on these; a prompt missing
/// here has no live version yet (cold-start agent, or a static shape whose
/// version hasn't been minted), and its trace falls back to a direct LLM
/// extraction.
pub type VersionVerdicts = HashMap<String, String>;

/// Whether this prompt re-runs the full clustering algorithm despite a
/// cheap-match hit. Decided HERE rather than on the consumer because it governs
/// whether the raw body needs to ride the wire at all.
///
/// Claiming the slot is a plain check-then-set, so two concurrent batches for
/// one agent can both probe. Deliberately unsynchronized: the loser costs one
/// extra clustering run, and a lock would serialize every ingest batch for the
/// agent to prevent something harmless.
///
/// Cache errors DON'T probe. The full algorithm reads the window and the
/// registry from this same cache, so an error here means it could not run
/// usefully anyway — and probing sends the raw prompt body over the wire, so
/// failing open would inflate every queue payload for the length of an outage.
async fn should_probe(cache: &Cache, project_id: Uuid, agent_hash: &str) -> bool {
    if *FULL_RUN_INTERVAL_SECONDS == 0 {
        return true;
    }
    let key = probe_cache_key(project_id, agent_hash);
    match cache.exists(&key).await {
        Ok(true) => return false,
        Ok(false) => {}
        Err(e) => {
            log::warn!("[SP_VERSIONING] Failed to read probe marker {key}: {e:?}");
            return false;
        }
    }
    if let Err(e) = cache
        .insert_with_ttl(&key, "1", *FULL_RUN_INTERVAL_SECONDS)
        .await
    {
        // Probing without recording it would re-probe on the very next
        // message, so treat a failed claim as "not our turn".
        log::warn!("[SP_VERSIONING] Failed to claim probe marker {key}: {e:?}");
        return false;
    }
    true
}

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
    /// Byte-identity hash of the prompt, computed once on the ingest producer so
    /// grouping here and the user-task candidate agree without re-hashing.
    pub full_prompt_hash: String,
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

/// Publish candidates to the active pipeline's queue and return the version
/// verdicts resolved inline. Best-effort: cache/publish failures are logged and
/// never propagated — a later span with the same prompt re-triggers.
pub async fn publish_static_prompt_candidates(
    candidates: Vec<StaticPromptCandidate>,
    cache: Arc<Cache>,
    queue: Arc<MessageQueue>,
) -> VersionVerdicts {
    // Without the shared LLM client the extraction workers never spawn, the
    // regex caches never fill, and every ingest batch would re-publish the
    // same prompts forever.
    if !llm_client_available() {
        return VersionVerdicts::new();
    }

    let internal_ids = internal_project_ids();
    let candidates: Vec<StaticPromptCandidate> = candidates
        .into_iter()
        .filter(|c| !internal_ids.contains(&c.project_id))
        .collect();
    if candidates.is_empty() {
        return VersionVerdicts::new();
    }

    if !is_feature_enabled(Feature::SystemPromptVersioning) {
        crate::traces::static_sp_extraction::producer::publish_legacy_candidates(
            candidates, &cache, &queue,
        )
        .await;
        return VersionVerdicts::new();
    }

    let (messages, verdicts) = build_v2_messages(candidates, &cache).await;
    if messages.is_empty() {
        return verdicts;
    }

    let payload = match serde_json::to_vec(&messages) {
        Ok(p) => p,
        Err(e) => {
            log::error!("[SP_VERSIONING] Failed to serialize queue messages: {e:?}");
            return verdicts;
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
    verdicts
}

/// One message per distinct prompt body in the batch, carrying every span that
/// presented it. Each group runs the resolution ladder inline — memo GET, then
/// the subset match against the live registry — because the user-task regex key
/// needs the version synchronously and the classifier is asynchronous. The
/// verdict plus the per-agent staleness interval then decide whether the raw body has
/// to ride the wire; `line_hashes` always does, so a slim message still feeds
/// the window.
async fn build_v2_messages(
    candidates: Vec<StaticPromptCandidate>,
    cache: &Cache,
) -> (Vec<SpVersioningMessage>, VersionVerdicts) {
    struct Group {
        agent_hash: String,
        system_prompt: String,
        span_refs: Vec<SpanRef>,
    }

    let mut groups: IndexMap<(Uuid, String), Group> = IndexMap::new();
    for candidate in candidates {
        let group = groups
            .entry((candidate.project_id, candidate.full_prompt_hash.clone()))
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
    let mut verdicts = VersionVerdicts::new();
    for ((project_id, full_prompt_hash), group) in groups {
        let line_hashes = similarity::line_hashes(&group.system_prompt);
        let known_version_hash = versions::memo_get(cache, project_id, &full_prompt_hash).await;

        // The memo answers only byte-identical repeats, which is nearly never
        // the case for an agent with dynamic content in its system prompt — the
        // subset match is what actually resolves those.
        let cheap_matched_version = match known_version_hash {
            Some(_) => None,
            None => versions::cheap_match(
                cache,
                project_id,
                &group.agent_hash,
                &similarity::line_hash_set(&line_hashes),
            )
            .await
            .unwrap_or_else(|e| {
                log::warn!("[SP_VERSIONING] Inline cheap match failed: {e:?}");
                None
            }),
        };

        if let Some(version) = known_version_hash
            .as_ref()
            .or(cheap_matched_version.as_ref())
        {
            verdicts.insert(full_prompt_hash.clone(), version.clone());
        }

        // The probe mints and journals, so it needs the body; so does an
        // unresolved prompt. A memo hit never probes — its staleness bound is
        // the memo TTL, and it is byte-identical to a window entry already
        // labeled.
        let run_full = cheap_matched_version.is_some()
            && should_probe(cache, project_id, &group.agent_hash).await;
        let needs_body =
            run_full || (known_version_hash.is_none() && cheap_matched_version.is_none());
        let system_prompt = if needs_body {
            group.system_prompt
        } else {
            String::new()
        };

        messages.push(SpVersioningMessage {
            project_id,
            system_prompt,
            agent_hash: group.agent_hash,
            full_prompt_hash,
            line_hashes,
            span_refs: group.span_refs,
            known_version_hash,
            cheap_matched_version,
            run_full,
            retry_count: 0,
        });
    }
    (messages, verdicts)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::in_memory::InMemoryCache;

    fn cache() -> Cache {
        Cache::InMemory(InMemoryCache::new(None))
    }

    /// The tests below assert the rate limit, so a `0` interval (probe always)
    /// would make them vacuous rather than failing loudly.
    fn require_rate_limiting() {
        assert!(
            *FULL_RUN_INTERVAL_SECONDS > 0,
            "SP_VERSIONING_FULL_RUN_INTERVAL_SECONDS=0 disables rate limiting"
        );
    }

    #[tokio::test]
    async fn an_agent_probes_once_per_interval() {
        require_rate_limiting();
        let cache = cache();
        let project_id = Uuid::new_v4();
        assert!(
            should_probe(&cache, project_id, "agent01").await,
            "first sighting probes"
        );
        assert!(!should_probe(&cache, project_id, "agent01").await);
        assert!(!should_probe(&cache, project_id, "agent01").await);
    }

    /// The bound is per agent, so a busy agent holding the slot must not
    /// starve every other agent in the project — nor an unrelated project's
    /// agent that happens to share a first-sentence hash.
    #[tokio::test]
    async fn the_slot_is_per_project_and_agent() {
        require_rate_limiting();
        let cache = cache();
        let project_id = Uuid::new_v4();
        let other_project = Uuid::new_v4();
        assert!(should_probe(&cache, project_id, "busy").await);
        assert!(!should_probe(&cache, project_id, "busy").await);

        assert!(should_probe(&cache, project_id, "quiet").await);
        assert!(should_probe(&cache, other_project, "busy").await);
    }

    /// The marker is shared, so a second ingest pod reading the same cache
    /// must see the first one's claim. This is the property the process-local
    /// tracker could not provide.
    #[tokio::test]
    async fn the_claim_is_visible_to_another_producer() {
        require_rate_limiting();
        let shared = cache();
        let project_id = Uuid::new_v4();
        assert!(should_probe(&shared, project_id, "agent01").await);
        // Same cache, a different caller — as a second pod would see it.
        assert!(!should_probe(&shared, project_id, "agent01").await);
        // A different cache is a different deployment, not a second pod.
        assert!(should_probe(&cache(), project_id, "agent01").await);
    }
}
