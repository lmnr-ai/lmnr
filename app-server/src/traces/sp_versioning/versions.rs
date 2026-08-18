//! Version registry for the sp-versioning pipeline: per-agent live versions,
//! their static line sets (cheap subset match), their removal-regex lists,
//! and the byte-identity memo.
//!
//! Split keys by access pattern: the registry is a tiny list read per
//! classification; line sets are read per live version by the cheap match;
//! regexes are read only by resolution consumers (summarizer). A registry
//! entry whose line/regex keys lapsed independently is treated as unknown —
//! the next full run re-mints, so drift self-heals. A registered version
//! with NO regex key means generation is pending (the extraction worker
//! hasn't finished) or permanently failed — readers fall back to the raw
//! prompt.

use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::cache::keys::{
    SYSTEM_PROMPT_DYNAMIC_REGEXES_CACHE_KEY, SYSTEM_PROMPT_VERSION_LINES_CACHE_KEY,
    SYSTEM_PROMPT_VERSION_LOCK_CACHE_KEY, SYSTEM_PROMPT_VERSION_MEMO_CACHE_KEY,
    SYSTEM_PROMPT_VERSIONS_CACHE_KEY,
};
use crate::cache::{Cache, CacheTrait};

use super::similarity;
use crate::traces::static_sp_extraction::tool::LabeledRegex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionEntry {
    pub version_hash: String,
    pub minted_at: i64,
}

pub fn versions_cache_key(project_id: Uuid, agent_hash: &str) -> String {
    format!("{SYSTEM_PROMPT_VERSIONS_CACHE_KEY}:{project_id}:{agent_hash}")
}

pub fn version_lines_cache_key(project_id: Uuid, agent_hash: &str, version_hash: &str) -> String {
    format!("{SYSTEM_PROMPT_VERSION_LINES_CACHE_KEY}:{project_id}:{agent_hash}:{version_hash}")
}

pub fn version_regex_cache_key(project_id: Uuid, agent_hash: &str, version_hash: &str) -> String {
    format!("{SYSTEM_PROMPT_DYNAMIC_REGEXES_CACHE_KEY}:{project_id}:{agent_hash}:{version_hash}")
}

pub fn memo_cache_key(project_id: Uuid, full_prompt_hash: &str) -> String {
    format!("{SYSTEM_PROMPT_VERSION_MEMO_CACHE_KEY}:{project_id}:{full_prompt_hash}")
}

/// Per-agent mint lock. Held only across the registry RMW + mint-event
/// publish — milliseconds.
pub fn mint_lock_cache_key(project_id: Uuid, agent_hash: &str) -> String {
    format!("{SYSTEM_PROMPT_VERSION_LOCK_CACHE_KEY}:{project_id}:{agent_hash}")
}

/// Live versions, newest-minted first. Missing key ⇒ empty.
pub async fn load_registry(
    cache: &Cache,
    project_id: Uuid,
    agent_hash: &str,
) -> anyhow::Result<Vec<VersionEntry>> {
    let key = versions_cache_key(project_id, agent_hash);
    cache
        .get::<Vec<VersionEntry>>(&key)
        .await
        .map(Option::unwrap_or_default)
        .map_err(|e| anyhow::anyhow!("Failed to read version registry {key}: {e:?}"))
}

/// A version's static line set, or `None` when the key has lapsed. An empty
/// stored list reads as absent: it can neither subset-match nor be grown past,
/// so treating it as a real (empty) set would make it match every prompt.
pub async fn load_version_lines(
    cache: &Cache,
    project_id: Uuid,
    agent_hash: &str,
    version_hash: &str,
) -> Option<Vec<u64>> {
    let lines_key = version_lines_cache_key(project_id, agent_hash, version_hash);
    cache
        .get::<Vec<u64>>(&lines_key)
        .await
        .unwrap_or_default()
        .filter(|l| !l.is_empty())
}

/// Largest-match-wins cheap classification: among live versions whose static
/// line set is a subset of the prompt's lines, pick the one with the most
/// lines. Checking every live version (not first-hit) matters after an
/// addition — the old, smaller set still subset-matches new prompts and a
/// first-hit scan could mislabel them. Version entries whose line-set key
/// lapsed are skipped.
pub async fn cheap_match(
    cache: &Cache,
    project_id: Uuid,
    agent_hash: &str,
    prompt_lines: &HashSet<u64>,
) -> anyhow::Result<Option<String>> {
    let registry = load_registry(cache, project_id, agent_hash).await?;
    let mut best: Option<(usize, String)> = None;
    for version in registry {
        let Some(lines) =
            load_version_lines(cache, project_id, agent_hash, &version.version_hash).await
        else {
            continue;
        };
        if similarity::is_subset(&lines, prompt_lines)
            && best.as_ref().is_none_or(|(len, _)| lines.len() > *len)
        {
            best = Some((lines.len(), version.version_hash));
        }
    }
    Ok(best.map(|(_, hash)| hash))
}

/// Consumer (the signals summarizer) is signals-gated.
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub async fn get_version_regexes(
    cache: &Cache,
    project_id: Uuid,
    agent_hash: &str,
    version_hash: &str,
) -> Option<Vec<LabeledRegex>> {
    let key = version_regex_cache_key(project_id, agent_hash, version_hash);
    match cache.get::<Vec<LabeledRegex>>(&key).await {
        Ok(regexes) => regexes,
        Err(e) => {
            log::warn!("[STATIC_SP_V2] Failed to read version regexes {key}: {e:?}");
            None
        }
    }
}

pub async fn memo_get(cache: &Cache, project_id: Uuid, full_prompt_hash: &str) -> Option<String> {
    let key = memo_cache_key(project_id, full_prompt_hash);
    match cache.get::<String>(&key).await {
        Ok(memo) => memo,
        Err(e) => {
            log::warn!("[STATIC_SP_V2] Failed to read memo {key}: {e:?}");
            None
        }
    }
}

/// Best-effort: a lost memo write only costs one re-classification.
pub async fn memo_set(cache: &Cache, project_id: Uuid, full_prompt_hash: &str, version_hash: &str) {
    let key = memo_cache_key(project_id, full_prompt_hash);
    let ttl = crate::env::static_sp::MEMO_TTL_SECONDS.get();
    if let Err(e) = cache
        .insert_with_ttl(&key, version_hash.to_string(), ttl)
        .await
    {
        log::warn!("[STATIC_SP_V2] Failed to write memo {key}: {e:?}");
    }
}

/// Write a version's removal-regex list. Called by `register_version` for
/// verdicts known at mint time (fully-static `[]`, the prewarm route's
/// synchronous extraction) and by the extraction worker once its agent run
/// finishes.
pub async fn write_version_regexes(
    cache: &Cache,
    project_id: Uuid,
    agent_hash: &str,
    version_hash: &str,
    regexes: &[LabeledRegex],
) -> anyhow::Result<()> {
    let ttl = crate::env::static_sp::VERSION_TTL_SECONDS.get();
    let regex_key = version_regex_cache_key(project_id, agent_hash, version_hash);
    cache
        .insert_with_ttl(&regex_key, regexes, ttl)
        .await
        .map_err(|e| anyhow::anyhow!("Failed to write version regexes {regex_key}: {e:?}"))
}

/// Register a freshly minted version: write its line set (and regex list
/// when the verdict is already known — `None` leaves the key absent for the
/// extraction worker to fill), then prepend it to the registry (RMW —
/// callers hold the per-agent mint lock), evicting versions past the cap.
/// Write order makes the registry entry the commit point: a crash before it
/// leaves dangling line/regex keys that the TTL cleans.
pub async fn register_version(
    cache: &Cache,
    project_id: Uuid,
    agent_hash: &str,
    version_hash: &str,
    static_lines: &[u64],
    regexes: Option<&[LabeledRegex]>,
) -> anyhow::Result<()> {
    let ttl = crate::env::static_sp::VERSION_TTL_SECONDS.get();
    let cap = crate::env::static_sp::VERSION_CAP.get();

    let lines_key = version_lines_cache_key(project_id, agent_hash, version_hash);
    cache
        .insert_with_ttl(&lines_key, static_lines, ttl)
        .await
        .map_err(|e| anyhow::anyhow!("Failed to write version lines {lines_key}: {e:?}"))?;

    if let Some(regexes) = regexes {
        write_version_regexes(cache, project_id, agent_hash, version_hash, regexes).await?;
    }

    let registry_key = versions_cache_key(project_id, agent_hash);
    let mut registry = load_registry(cache, project_id, agent_hash).await?;
    registry.retain(|v| v.version_hash != version_hash);
    registry.insert(
        0,
        VersionEntry {
            version_hash: version_hash.to_string(),
            minted_at: chrono::Utc::now().timestamp(),
        },
    );
    let evicted: Vec<VersionEntry> = registry.split_off(cap.min(registry.len()));
    cache
        .insert_with_ttl(&registry_key, &registry, ttl)
        .await
        .map_err(|e| anyhow::anyhow!("Failed to write version registry {registry_key}: {e:?}"))?;

    for version in evicted {
        let lines_key = version_lines_cache_key(project_id, agent_hash, &version.version_hash);
        let regex_key = version_regex_cache_key(project_id, agent_hash, &version.version_hash);
        if let Err(e) = cache.remove(&lines_key).await {
            log::warn!("[STATIC_SP_V2] Failed to remove evicted {lines_key}: {e:?}");
        }
        if let Err(e) = cache.remove(&regex_key).await {
            log::warn!("[STATIC_SP_V2] Failed to remove evicted {regex_key}: {e:?}");
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::in_memory::InMemoryCache;

    fn make_cache() -> Cache {
        Cache::InMemory(InMemoryCache::new(None))
    }

    fn lines_of(text: &str) -> Vec<u64> {
        similarity::line_hashes(text)
    }

    #[tokio::test]
    async fn cheap_match_picks_largest_subset() {
        let cache = make_cache();
        let project_id = Uuid::new_v4();
        let agent = "agent01";

        // Old version: smaller static set (pre-addition).
        let old_lines = lines_of("head\ntail");
        register_version(&cache, project_id, agent, "oldhash1", &old_lines, None)
            .await
            .unwrap();
        // New version: superset static set (post-addition).
        let new_lines = lines_of("head\nnew section\ntail");
        register_version(&cache, project_id, agent, "newhash1", &new_lines, None)
            .await
            .unwrap();

        // A new-version prompt matches BOTH sets; largest must win.
        let prompt = similarity::line_hash_set(&lines_of("head\nnew section\ndynamic\ntail"));
        let matched = cheap_match(&cache, project_id, agent, &prompt)
            .await
            .unwrap();
        assert_eq!(matched.as_deref(), Some("newhash1"));

        // An old-version prompt (no new section) only matches the old set.
        let prompt = similarity::line_hash_set(&lines_of("head\ndynamic\ntail"));
        let matched = cheap_match(&cache, project_id, agent, &prompt)
            .await
            .unwrap();
        assert_eq!(matched.as_deref(), Some("oldhash1"));

        // An unrelated prompt matches nothing.
        let prompt = similarity::line_hash_set(&lines_of("completely\nunrelated"));
        let matched = cheap_match(&cache, project_id, agent, &prompt)
            .await
            .unwrap();
        assert_eq!(matched, None);
    }

    #[tokio::test]
    async fn register_version_caps_registry_and_evicts_keys() {
        let cache = make_cache();
        let project_id = Uuid::new_v4();
        let agent = "agent01";
        let cap = crate::env::static_sp::VERSION_CAP.get();

        for i in 0..cap + 2 {
            let lines = lines_of(&format!("static {i}"));
            register_version(&cache, project_id, agent, &format!("hash{i}"), &lines, None)
                .await
                .unwrap();
        }

        let registry = load_registry(&cache, project_id, agent).await.unwrap();
        assert_eq!(registry.len(), cap);
        assert_eq!(registry[0].version_hash, format!("hash{}", cap + 1));

        // Evicted versions' side keys are gone.
        let evicted_lines = version_lines_cache_key(project_id, agent, "hash0");
        assert!(!cache.exists(&evicted_lines).await.unwrap());
    }

    #[tokio::test]
    async fn regexes_absent_until_worker_writes_them() {
        let cache = make_cache();
        let project_id = Uuid::new_v4();
        let agent = "agent01";
        let lines = lines_of("head\ntail");

        // `None` = generation delegated to the extraction worker: the key
        // stays absent (pending), which readers treat as "fall back to raw".
        register_version(&cache, project_id, agent, "vhash", &lines, None)
            .await
            .unwrap();
        assert!(
            get_version_regexes(&cache, project_id, agent, "vhash")
                .await
                .is_none()
        );

        write_version_regexes(
            &cache,
            project_id,
            agent,
            "vhash",
            &[LabeledRegex {
                pattern: r"\d+".to_string(),
                label: "id".to_string(),
            }],
        )
        .await
        .unwrap();
        assert_eq!(
            get_version_regexes(&cache, project_id, agent, "vhash")
                .await
                .unwrap()
                .len(),
            1
        );
    }

    #[tokio::test]
    async fn memo_roundtrip() {
        let cache = make_cache();
        let project_id = Uuid::new_v4();
        assert_eq!(memo_get(&cache, project_id, "fph").await, None);
        memo_set(&cache, project_id, "fph", "vhash").await;
        assert_eq!(
            memo_get(&cache, project_id, "fph").await.as_deref(),
            Some("vhash")
        );
    }
}
