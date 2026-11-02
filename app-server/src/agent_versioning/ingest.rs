//! Ingest side: the producer reduces an LLM span's agent prompt to line
//! hashes; the consumer stores them in `agent_prompts` and tags traces whose
//! release is already decided.

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::normalize::line_set;
use crate::{
    cache::{Cache, CacheTrait, keys::AGENT_VERSIONING_RELEASE_CACHE_KEY},
    ch::{agent_prompts::CHAgentPrompt, traces::TraceAggregation, traces_agg::CHTraceAgentVersion},
    db::{DB, agent_versioning::release_version_hash, spans::Span, trace::TraceType},
    env::connections::CHECKPOINTS_INTERNAL_PROJECT_ID,
    features::{Feature, is_feature_enabled},
    utils::{sanitize_string, truncate_chars},
};

/// Rides the span message from producer to consumer.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AgentPrompt {
    pub agent_hash: String,
    pub line_hashes: Vec<u64>,
    pub model: String,
    /// `SpanAttributes::release`, empty when the SDK sent none.
    #[serde(default)]
    pub release: String,
}

/// `None` unless the feature is on and the span is production traffic of
/// a user project.
pub fn agent_prompt(
    span: &Span,
    agent_hash: &str,
    system_prompt: &str,
    tool_text: &str,
) -> Option<AgentPrompt> {
    if !is_feature_enabled(Feature::AgentVersioning)
        || matches!(
            span.attributes.trace_type(),
            Some(TraceType::EVALUATION | TraceType::PLAYGROUND)
        )
        || is_internal_project(span.project_id)
    {
        return None;
    }
    let model = span
        .attributes
        .response_model()
        .filter(|m| !m.trim().is_empty())
        .or_else(|| span.attributes.request_model())
        .map(|m| truncate_chars(&sanitize_string(m.trim()), 256))
        .unwrap_or_default();
    Some(AgentPrompt {
        agent_hash: agent_hash.to_string(),
        line_hashes: line_set(system_prompt, tool_text),
        model,
        release: span.attributes.release().unwrap_or_default(),
    })
}

/// The project tracing our own LLM calls; versioning it would recurse.
fn is_internal_project(project_id: Uuid) -> bool {
    std::env::var(CHECKPOINTS_INTERNAL_PROJECT_ID)
        .is_ok_and(|id| Uuid::parse_str(&id).is_ok_and(|id| id == project_id))
}

pub fn row(span: &Span, prompt: AgentPrompt) -> CHAgentPrompt {
    CHAgentPrompt {
        project_id: span.project_id,
        agent_hash: prompt.agent_hash,
        trace_id: span.trace_id,
        span_id: span.span_id,
        start_time: span.start_time.timestamp_nanos_opt().unwrap_or(i64::MAX),
        model: prompt.model,
        line_hashes: prompt.line_hashes,
        release: prompt.release,
    }
}

/// A decided release's version is fixed, so it caches long; an undecided one
/// briefly, until the job decides it.
pub const RELEASE_CACHE_TTL_SECONDS: u64 = 24 * 60 * 60;
const UNDECIDED_CACHE_TTL_SECONDS: u64 = 60;

pub fn release_cache_key(project_id: Uuid, agent_hash: &str, release: &str) -> String {
    format!("{AGENT_VERSIONING_RELEASE_CACHE_KEY}:{project_id}:{agent_hash}:{release}")
}

/// Tags each trace with the versions of its prompts' decided releases. The
/// job tags the rest once it decides them, so failures only log. Releases
/// reaching back past the inferred path's horizon are left to the job, which
/// can tell whether a trace started past it.
pub async fn tag_releases(
    db: &DB,
    cache: &Cache,
    prompts: &[CHAgentPrompt],
    aggregations: &mut [TraceAggregation],
) {
    let mut versions: HashMap<(Uuid, &str, &str), Option<String>> = HashMap::new();
    let mut tags: HashMap<Uuid, HashSet<CHTraceAgentVersion>> = HashMap::new();
    for prompt in prompts.iter().filter(|p| !p.release.is_empty()) {
        let key = (
            prompt.project_id,
            prompt.agent_hash.as_str(),
            prompt.release.as_str(),
        );
        let version_hash = match versions.get(&key) {
            Some(version_hash) => version_hash.clone(),
            None => {
                let version_hash = release_version(db, cache, key.0, key.1, key.2).await;
                versions.insert(key, version_hash.clone());
                version_hash
            }
        };
        let Some(version_hash) = version_hash else {
            continue;
        };
        tags.entry(prompt.trace_id)
            .or_default()
            .insert(CHTraceAgentVersion {
                agent_hash: prompt.agent_hash.clone(),
                version_hash,
                model: prompt.model.clone(),
            });
    }
    for aggregation in aggregations {
        if let Some(tags) = tags.remove(&aggregation.trace_id) {
            aggregation.agent_versions = tags.into_iter().collect();
        }
    }
}

async fn release_version(
    db: &DB,
    cache: &Cache,
    project_id: Uuid,
    agent_hash: &str,
    release: &str,
) -> Option<String> {
    let key = release_cache_key(project_id, agent_hash, release);
    match cache.get::<String>(&key).await {
        Ok(Some(hash)) => return Some(hash).filter(|h| !h.is_empty()),
        Ok(None) => {}
        Err(e) => log::warn!("[AGENT VERSIONING] Failed to read {key}: {e:?}"),
    }
    let hash = match release_version_hash(&db.pool, project_id, agent_hash, release).await {
        Ok(hash) => hash,
        Err(e) => {
            log::error!("[AGENT VERSIONING] Failed to look up release {release}: {e:?}");
            return None;
        }
    };
    let ttl = match hash {
        Some(_) => RELEASE_CACHE_TTL_SECONDS,
        None => UNDECIDED_CACHE_TTL_SECONDS,
    };
    let value = hash.clone().unwrap_or_default();
    if let Err(e) = cache.insert_with_ttl(&key, value, ttl).await {
        log::warn!("[AGENT VERSIONING] Failed to cache {key}: {e:?}");
    }
    hash
}
