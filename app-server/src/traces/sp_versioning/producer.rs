//! Ingest-side entry points for version classification.
//!
//! Every text runs the same inline resolution ([`resolve_inline`]): a memo hit
//! (text already classified) ships a slim message with the known version hash
//! and no body; otherwise the subset match against the live registry runs, and
//! a miss ships the raw text for consumer-side classification.
//!
//! - [`publish_static_prompt_candidates`] — system prompts, once per ingest
//!   batch. Shared guards (LLM availability, internal-project filter), then a
//!   feature-flag dispatch: `Feature::SystemPromptVersioning` routes to this
//!   pipeline, off routes to the legacy skeleton-hash pipeline
//!   (`static_sp_extraction::producer`).
//! - [`resolve_and_publish`] — a single text whose caller needs the version
//!   synchronously (the user-task hook keys its regex on the user template's).

use std::sync::Arc;

use indexmap::IndexMap;
use uuid::Uuid;

use super::{VersionKind, consumer::SpVersioningMessage, similarity, versions, window::SpanRef};
use crate::{
    cache::{Cache, CacheTrait},
    features::{Feature, is_feature_enabled},
    llm::llm_client_available,
    mq::{MessageQueue, MessageQueueTrait},
};

/// Marker key for [`should_probe`]. Shared across ingest pods, so the interval
/// means the same thing however many are running — a process-local tracker
/// would multiply the fleet-wide probe rate by the pod count and reset the
/// whole fleet's markers on every deploy.
fn probe_cache_key(kind: VersionKind, project_id: Uuid, partition: &str) -> String {
    format!("{}:{project_id}:{partition}", kind.keys().probe)
}

/// Whether this text re-runs the full clustering algorithm despite a
/// cheap-match hit. Decided HERE rather than on the consumer because it governs
/// whether the raw body needs to ride the wire at all.
///
/// The slot is per partition ([`VersionKind::partition`]). Claiming it is a
/// plain check-then-set, so two concurrent batches for one partition can both
/// probe. Deliberately unsynchronized: the loser costs one extra clustering
/// run, and a lock would serialize every ingest batch for the partition to
/// prevent something harmless.
///
/// Cache errors DON'T probe. The full algorithm reads the window and the
/// registry from this same cache, so an error here means it could not run
/// usefully anyway — and probing sends the raw body over the wire, so failing
/// open would inflate every queue payload for the length of an outage.
async fn should_probe(cache: &Cache, kind: VersionKind, project_id: Uuid, partition: &str) -> bool {
    let interval = kind.tunables().full_run_interval_seconds;
    if interval == 0 {
        return true;
    }
    let key = probe_cache_key(kind, project_id, partition);
    match cache.exists(&key).await {
        Ok(true) => return false,
        Ok(false) => {}
        Err(e) => {
            log::warn!("[SP_VERSIONING] Failed to read probe marker {key}: {e:?}");
            return false;
        }
    }
    if let Err(e) = cache.insert_with_ttl(&key, "1", interval).await {
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
    /// Byte-identity hash of the prompt, computed once on the ingest producer.
    pub full_prompt_hash: String,
    pub system_prompt: String,
}

/// One distinct text to version, with every span that presented it.
pub struct VersionCandidate {
    pub project_id: Uuid,
    /// First-sentence hash of the system prompt. With `has_history`, it picks
    /// the window partition ([`VersionKind::partition`]).
    pub agent_hash: String,
    pub has_history: bool,
    /// Content hash of `text`: the memo key and the window entry id.
    pub full_hash: String,
    pub text: String,
    pub span_refs: Vec<SpanRef>,
}

/// What [`resolve_inline`] decided for one text.
struct InlineResolution {
    message: SpVersioningMessage,
    /// The version resolved on the spot (memo or subset match). `None` means
    /// the text has no live version yet; the consumer classifies it.
    version: Option<String>,
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

/// Publish a batch's system prompts to the active pipeline's queue.
/// Best-effort: cache/publish failures are logged and never propagated — a
/// later span with the same prompt re-triggers.
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

    if !is_feature_enabled(Feature::SystemPromptVersioning) {
        crate::traces::static_sp_extraction::producer::publish_legacy_candidates(
            candidates, &cache, &queue,
        )
        .await;
        return;
    }

    let mut messages = Vec::new();
    for candidate in group_by_prompt(candidates) {
        let resolution = resolve_inline(&cache, VersionKind::SystemPrompt, candidate).await;
        messages.push(resolution.message);
    }
    publish_messages(&queue, VersionKind::SystemPrompt, &messages).await;
}

/// Resolve one text's version inline and publish it for classification.
/// Returns the inline verdict; `None` means no live version yet.
pub async fn resolve_and_publish(
    cache: &Cache,
    queue: &MessageQueue,
    kind: VersionKind,
    candidate: VersionCandidate,
) -> Option<String> {
    let resolution = resolve_inline(cache, kind, candidate).await;
    publish_messages(queue, kind, std::slice::from_ref(&resolution.message)).await;
    resolution.version
}

/// One candidate per distinct prompt body in the batch, carrying every span
/// that presented it.
fn group_by_prompt(candidates: Vec<StaticPromptCandidate>) -> Vec<VersionCandidate> {
    let mut groups: IndexMap<(Uuid, String), VersionCandidate> = IndexMap::new();
    for candidate in candidates {
        let group = groups
            .entry((candidate.project_id, candidate.full_prompt_hash.clone()))
            .or_insert_with(|| VersionCandidate {
                project_id: candidate.project_id,
                agent_hash: candidate.agent_hash,
                has_history: false,
                full_hash: candidate.full_prompt_hash,
                text: candidate.system_prompt,
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
    groups.into_values().collect()
}

/// The resolution ladder — memo GET, then the subset match against the live
/// registry — plus the per-partition staleness interval, which together decide
/// whether the raw body has to ride the wire. `line_hashes` always does, so a
/// slim message still feeds the window.
async fn resolve_inline(
    cache: &Cache,
    kind: VersionKind,
    candidate: VersionCandidate,
) -> InlineResolution {
    let VersionCandidate {
        project_id,
        agent_hash,
        has_history,
        full_hash,
        text,
        span_refs,
    } = candidate;
    let partition = kind.partition(&agent_hash, has_history);
    let line_hashes = similarity::line_hashes(&text);
    let known_version_hash =
        versions::memo_get(cache, kind, project_id, &partition, &full_hash).await;

    // The memo answers only byte-identical repeats, which is nearly never the
    // case for a text with dynamic content — the subset match is what actually
    // resolves those.
    let cheap_matched_version = match known_version_hash {
        Some(_) => None,
        None => versions::cheap_match(
            cache,
            kind,
            project_id,
            &partition,
            &similarity::line_hash_set(&line_hashes),
        )
        .await
        .unwrap_or_else(|e| {
            log::warn!("[SP_VERSIONING] Inline cheap match failed: {e:?}");
            None
        }),
    };
    let version = known_version_hash
        .clone()
        .or_else(|| cheap_matched_version.clone());

    // The probe mints and journals, so it needs the body; so does an
    // unresolved text. A memo hit never probes — its staleness bound is the
    // memo TTL, and it is byte-identical to a window entry already labeled.
    let run_full =
        cheap_matched_version.is_some() && should_probe(cache, kind, project_id, &partition).await;
    let needs_body = run_full || version.is_none();

    InlineResolution {
        message: SpVersioningMessage {
            project_id,
            system_prompt: if needs_body { text } else { String::new() },
            agent_hash,
            has_history,
            full_prompt_hash: full_hash,
            line_hashes,
            span_refs,
            known_version_hash,
            cheap_matched_version,
            run_full,
            retry_count: 0,
        },
        version,
    }
}

async fn publish_messages(
    queue: &MessageQueue,
    kind: VersionKind,
    messages: &[SpVersioningMessage],
) {
    if messages.is_empty() {
        return;
    }
    let payload = match serde_json::to_vec(messages) {
        Ok(p) => p,
        Err(e) => {
            log::error!("[SP_VERSIONING] Failed to serialize queue messages: {e:?}");
            return;
        }
    };
    let queues = kind.queues();
    if let Err(e) = queue
        .publish(&payload, queues.exchange, queues.routing_key, None)
        .await
    {
        log::error!(
            "[SP_VERSIONING] Failed to publish {} queue messages: {e:?}",
            kind.label()
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::in_memory::InMemoryCache;

    const KIND: VersionKind = VersionKind::SystemPrompt;

    fn cache() -> Cache {
        Cache::InMemory(InMemoryCache::new(None))
    }

    /// The tests below assert the rate limit, so a `0` interval (probe always)
    /// would make them vacuous rather than failing loudly.
    fn require_rate_limiting() {
        assert!(
            KIND.tunables().full_run_interval_seconds > 0,
            "SP_VERSIONING_FULL_RUN_INTERVAL_SECONDS=0 disables rate limiting"
        );
    }

    #[tokio::test]
    async fn an_agent_probes_once_per_interval() {
        require_rate_limiting();
        let cache = cache();
        let project_id = Uuid::new_v4();
        assert!(
            should_probe(&cache, KIND, project_id, "agent01").await,
            "first sighting probes"
        );
        assert!(!should_probe(&cache, KIND, project_id, "agent01").await);
        assert!(!should_probe(&cache, KIND, project_id, "agent01").await);
    }

    /// The bound is per agent, so a busy agent holding the slot must not
    /// starve every other agent in the project — nor an unrelated project's
    /// agent that happens to share a first-sentence hash, nor the same agent's
    /// other kind.
    #[tokio::test]
    async fn the_slot_is_per_project_agent_and_kind() {
        require_rate_limiting();
        let cache = cache();
        let project_id = Uuid::new_v4();
        let other_project = Uuid::new_v4();
        assert!(should_probe(&cache, KIND, project_id, "busy").await);
        assert!(!should_probe(&cache, KIND, project_id, "busy").await);

        assert!(should_probe(&cache, KIND, project_id, "quiet").await);
        assert!(should_probe(&cache, KIND, other_project, "busy").await);
        assert!(should_probe(&cache, VersionKind::UserTemplate, project_id, "busy").await);
    }

    /// The marker is shared, so a second ingest pod reading the same cache
    /// must see the first one's claim. This is the property the process-local
    /// tracker could not provide.
    #[tokio::test]
    async fn the_claim_is_visible_to_another_producer() {
        require_rate_limiting();
        let shared = cache();
        let project_id = Uuid::new_v4();
        assert!(should_probe(&shared, KIND, project_id, "agent01").await);
        // Same cache, a different caller — as a second pod would see it.
        assert!(!should_probe(&shared, KIND, project_id, "agent01").await);
        // A different cache is a different deployment, not a second pod.
        assert!(should_probe(&cache(), KIND, project_id, "agent01").await);
    }

    fn candidate(text: &str) -> VersionCandidate {
        VersionCandidate {
            project_id: Uuid::nil(),
            agent_hash: "agent01".to_string(),
            has_history: false,
            full_hash: similarity::full_prompt_hash(text),
            text: text.to_string(),
            span_refs: Vec::new(),
        }
    }

    #[tokio::test]
    async fn unresolved_text_ships_its_body() {
        let cache = cache();
        let resolution = resolve_inline(&cache, KIND, candidate("head\ntask\ntail")).await;
        assert_eq!(resolution.version, None);
        assert_eq!(resolution.message.system_prompt, "head\ntask\ntail");
    }

    #[tokio::test]
    async fn memo_hit_resolves_inline_and_ships_slim() {
        let cache = cache();
        let text = "head\ntask\ntail";
        versions::memo_set(
            &cache,
            KIND,
            Uuid::nil(),
            "agent01",
            &similarity::full_prompt_hash(text),
            "vhash",
        )
        .await;
        let resolution = resolve_inline(&cache, KIND, candidate(text)).await;
        assert_eq!(resolution.version.as_deref(), Some("vhash"));
        assert!(resolution.message.system_prompt.is_empty());
        assert!(
            !resolution.message.line_hashes.is_empty(),
            "still feeds the window"
        );
    }

    #[tokio::test]
    async fn subset_match_resolves_inline() {
        let cache = cache();
        versions::register_version(
            &cache,
            KIND,
            Uuid::nil(),
            "agent01",
            "vhash",
            &similarity::line_hashes("head\ntail"),
            None,
        )
        .await
        .unwrap();
        let resolution = resolve_inline(&cache, KIND, candidate("head\nnew task\ntail")).await;
        assert_eq!(resolution.version.as_deref(), Some("vhash"));
        assert_eq!(
            resolution.message.cheap_matched_version.as_deref(),
            Some("vhash")
        );
    }

    /// A first-turn template's version must not label a follow-up that happens
    /// to contain its lines: the two turn positions are separate partitions.
    #[tokio::test]
    async fn user_template_turn_positions_do_not_share_versions() {
        let cache = cache();
        let kind = VersionKind::UserTemplate;
        versions::register_version(
            &cache,
            kind,
            Uuid::nil(),
            &kind.partition("agent01", false),
            "firstturn",
            &similarity::line_hashes("<task>\n</task>"),
            None,
        )
        .await
        .unwrap();

        let text = "<task>\nnext step\n</task>";
        let first_turn = resolve_inline(&cache, kind, candidate(text)).await;
        assert_eq!(first_turn.version.as_deref(), Some("firstturn"));

        let follow_up = VersionCandidate {
            has_history: true,
            ..candidate(text)
        };
        let follow_up = resolve_inline(&cache, kind, follow_up).await;
        assert_eq!(follow_up.version, None);
        assert!(follow_up.message.has_history);
    }
}
