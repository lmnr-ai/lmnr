//! Regex inheritance across a user-template partition's versions.
//!
//! A partition re-mints whenever its template's static lines move — an
//! addition caught by the probe, a removal on the miss path, a cold-start
//! window settling. Each new version is a new regex cohort, and on its own it
//! pays a direct LLM extraction per trace until five samples and an agent run
//! produce its regex, while a sibling version's regex usually still fits: the
//! template barely moved. So before that cold start, the worker tries the
//! siblings' regexes on the trace's own text and adopts the first that
//! extracts. A wrong adoption self-heals like any cached regex: the first
//! `NoMatch` evicts it and the cohort takes the sample path.

use std::sync::Arc;

use uuid::Uuid;

use super::regex::{
    ApplyRegexResult, REGEX_CACHE_TTL_SECONDS, apply_regex, is_passthrough_regex,
    template_regex_cache_key,
};
use crate::cache::{Cache, CacheTrait};
use crate::traces::sp_versioning::{VersionKind, similarity, versions};

/// Minimum Jaccard overlap between two versions' static line sets for them to
/// count as one template. Below it, a partition's unrelated templates would
/// lend each other regexes.
const MIN_SIBLING_OVERLAP: f64 = 0.5;

/// Try the partition's sibling versions' regexes, most similar first, and
/// cache the first one that extracts from `signposted_text` under this
/// version's key. Passthrough regexes are never inherited — they extract from
/// anything, so they would pass the check without saying anything about fit.
pub async fn inherit_sibling_regex(
    cache: &Arc<Cache>,
    project_id: Uuid,
    agent_hash: &str,
    version_hash: &str,
    has_history: bool,
    signposted_text: &str,
) -> Option<ApplyRegexResult> {
    let kind = VersionKind::UserTemplate;
    let partition = kind.partition(agent_hash, has_history);
    let own_lines =
        versions::load_version_lines(cache, kind, project_id, &partition, version_hash).await?;
    // The empty version has no template to share with anything.
    if own_lines.is_empty() {
        return None;
    }
    let own_set = similarity::line_hash_set(&own_lines);

    let registry = versions::load_registry(cache, kind, project_id, &partition)
        .await
        .ok()?;
    let mut siblings: Vec<(f64, String)> = Vec::new();
    for sibling in registry
        .into_iter()
        .filter(|v| v.version_hash != version_hash)
    {
        let Some(lines) = versions::load_version_lines(
            cache,
            kind,
            project_id,
            &partition,
            &sibling.version_hash,
        )
        .await
        else {
            continue;
        };
        let overlap = similarity::jaccard(&own_set, &similarity::line_hash_set(&lines));
        if overlap >= MIN_SIBLING_OVERLAP {
            siblings.push((overlap, sibling.version_hash));
        }
    }
    siblings.sort_by(|a, b| b.0.total_cmp(&a.0));

    for (_, sibling) in siblings {
        let sibling_key = template_regex_cache_key(project_id, agent_hash, &sibling, has_history);
        let Some(pattern) = cache.get::<String>(&sibling_key).await.ok().flatten() else {
            continue;
        };
        if is_passthrough_regex(&pattern) {
            continue;
        }
        let result = apply_regex(&pattern, signposted_text);
        if matches!(result, ApplyRegexResult::Extracted(_)) {
            let own_key =
                template_regex_cache_key(project_id, agent_hash, version_hash, has_history);
            if let Err(e) = cache
                .insert_with_ttl(&own_key, &pattern, REGEX_CACHE_TTL_SECONDS)
                .await
            {
                log::warn!("user-task: failed to cache inherited regex {own_key}: {e:?}");
            }
            return Some(result);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::in_memory::InMemoryCache;

    const AGENT: &str = "agent01";

    fn cache() -> Arc<Cache> {
        Arc::new(Cache::InMemory(InMemoryCache::new(None)))
    }

    async fn register(cache: &Cache, project_id: Uuid, version: &str, static_text: &str) {
        let kind = VersionKind::UserTemplate;
        versions::register_version(
            cache,
            kind,
            project_id,
            &kind.partition(AGENT, false),
            version,
            &similarity::line_hashes(static_text),
            None,
        )
        .await
        .unwrap();
    }

    async fn cache_regex(cache: &Cache, project_id: Uuid, version: &str, pattern: &str) {
        let key = template_regex_cache_key(project_id, AGENT, version, false);
        cache.insert(&key, pattern.to_string()).await.unwrap();
    }

    async fn own_regex(cache: &Cache, project_id: Uuid, version: &str) -> Option<String> {
        let key = template_regex_cache_key(project_id, AGENT, version, false);
        cache.get::<String>(&key).await.unwrap()
    }

    const OLD: &str = "<ctx>\n</ctx>\n<task>\n</task>";
    const NEW: &str = "<ctx>\n</ctx>\n<task>\n</task>\n<footer/>";
    const TEXT: &str = "<ctx>\nstate\n</ctx>\n<task>\nfix the bug\n</task>\n<footer/>";

    #[tokio::test]
    async fn a_re_minted_template_adopts_its_siblings_regex() {
        let cache = cache();
        let project_id = Uuid::new_v4();
        register(&cache, project_id, "old", OLD).await;
        register(&cache, project_id, "new", NEW).await;
        cache_regex(&cache, project_id, "old", r"(?s)<task>\s*(.*?)\s*</task>").await;

        let result = inherit_sibling_regex(&cache, project_id, AGENT, "new", false, TEXT).await;
        assert_eq!(
            result,
            Some(ApplyRegexResult::Extracted("fix the bug".to_string()))
        );
        assert!(
            own_regex(&cache, project_id, "new").await.is_some(),
            "later traces of the new version hit the cache inline"
        );
    }

    #[tokio::test]
    async fn an_unrelated_template_lends_nothing() {
        let cache = cache();
        let project_id = Uuid::new_v4();
        register(
            &cache,
            project_id,
            "other",
            "<report>\n</report>\n<summary>\n</summary>",
        )
        .await;
        register(&cache, project_id, "new", NEW).await;
        cache_regex(&cache, project_id, "other", r"(?s)(.*)</footer>").await;

        assert_eq!(
            inherit_sibling_regex(&cache, project_id, AGENT, "new", false, TEXT).await,
            None
        );
    }

    #[tokio::test]
    async fn passthrough_and_non_extracting_regexes_are_not_inherited() {
        let cache = cache();
        let project_id = Uuid::new_v4();
        register(&cache, project_id, "passthrough", OLD).await;
        register(&cache, project_id, "stale", OLD).await;
        register(&cache, project_id, "new", NEW).await;
        cache_regex(&cache, project_id, "passthrough", "(?s)(.*)").await;
        cache_regex(&cache, project_id, "stale", r"(?s)<goal>(.*)</goal>").await;

        assert_eq!(
            inherit_sibling_regex(&cache, project_id, AGENT, "new", false, TEXT).await,
            None
        );
        assert!(own_regex(&cache, project_id, "new").await.is_none());
    }

    #[tokio::test]
    async fn the_empty_version_inherits_nothing() {
        let cache = cache();
        let project_id = Uuid::new_v4();
        let empty = similarity::empty_version_hash();
        register(&cache, project_id, "old", OLD).await;
        register(&cache, project_id, &empty, "").await;
        cache_regex(&cache, project_id, "old", r"(?s)<task>\s*(.*?)\s*</task>").await;

        assert_eq!(
            inherit_sibling_regex(&cache, project_id, AGENT, &empty, false, TEXT).await,
            None
        );
    }
}
