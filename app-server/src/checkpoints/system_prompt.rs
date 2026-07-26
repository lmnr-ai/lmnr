//! Resolve a system prompt's stable (static) part via the removal-regex list
//! produced by the static-prompt extraction pipeline (LAM-1899,
//! `traces/static_sp_extraction/`), cached per naive signature. The remainder
//! is a stable fingerprint of the agent's prompt.

use std::sync::Arc;

use uuid::Uuid;

use crate::{
    cache::Cache,
    traces::{
        prompt_hash::structural_skeleton_hash,
        static_sp_extraction::{
            get_cached_static_regexes, static_regex_cache_key,
            tool::{LabeledRegex, compile_removal_regex, remove_all},
        },
    },
};

/// Stable portion of a system prompt, derived by applying the static-prompt
/// extraction pipeline's cached removal regexes (keyed by naive signature).
///
/// - `None` when no regex list is cached yet (extraction still accumulating /
///   running) or the cache read fails — the caller drops the checkpoint; a
///   later span of the same signature re-triggers once the list exists.
/// - `Some(raw)` when the cached list is empty (fully-static prompt) or fails
///   to apply (invalid pattern / full erasure) — the same raw-prompt fallback
///   the signals summarizer uses for broken lists.
/// - `Some(static_part)` when the regexes strip cleanly.
pub async fn resolve_stable_system_prompt(
    system_prompt: &str,
    prompt_hash: &str,
    project_id: Uuid,
    cache: &Arc<Cache>,
) -> Option<String> {
    let key = regex_cache_key(project_id, system_prompt, prompt_hash);
    let regexes = match get_cached_static_regexes(cache, &key).await {
        Ok(regexes) => regexes?,
        Err(e) => {
            log::warn!("[CHECKPOINTS] Failed to read static-regex cache {key}: {e:?}");
            return None;
        }
    };
    Some(apply_static_regexes(&regexes, system_prompt).unwrap_or_else(|| system_prompt.to_string()))
}

/// Static-regex cache key; `prompt_hash` is the ingest-time naive signature,
/// recomputed here only when the message didn't carry one.
fn regex_cache_key(project_id: Uuid, system_prompt: &str, prompt_hash: &str) -> String {
    if prompt_hash.is_empty() {
        static_regex_cache_key(project_id, &structural_skeleton_hash(system_prompt))
    } else {
        static_regex_cache_key(project_id, prompt_hash)
    }
}

/// Apply the removal regexes sequentially. Semantics must match the extraction
/// harness that produced the list (`static_sp_extraction::tool::run_regex_tool`):
/// each pattern is compiled via `compile_removal_regex`, every match is
/// deleted, and the residual feeds the next pattern. `None` when a pattern
/// fails to compile / errors at runtime, or the residual is entirely
/// whitespace — a regex list that erases the whole prompt is broken.
fn apply_static_regexes(regexes: &[LabeledRegex], prompt: &str) -> Option<String> {
    let mut residual = prompt.to_string();
    for regex in regexes {
        let re = compile_removal_regex(&regex.pattern).ok()?;
        residual = remove_all(&re, &residual).ok()?;
    }
    (!residual.trim().is_empty()).then_some(residual)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::{CacheTrait, in_memory::InMemoryCache};

    fn labeled(patterns: &[&str]) -> Vec<LabeledRegex> {
        patterns
            .iter()
            .map(|p| LabeledRegex {
                pattern: p.to_string(),
                label: String::new(),
            })
            .collect()
    }

    fn make_cache() -> Arc<Cache> {
        Arc::new(Cache::InMemory(InMemoryCache::new(None)))
    }

    #[test]
    fn apply_strips_dynamic_fragments_sequentially() {
        let prompt = "You are a helpful agent.\n<date>2026-07-06</date>\n<user>alice</user>";
        let regexes = labeled(&[
            r"(?<=<date>)\d{4}-\d{2}-\d{2}(?=</date>)",
            r"(?<=<user>)\w+(?=</user>)",
        ]);
        assert_eq!(
            apply_static_regexes(&regexes, prompt).unwrap(),
            "You are a helpful agent.\n<date></date>\n<user></user>"
        );
    }

    #[test]
    fn apply_empty_list_returns_prompt_unchanged() {
        let prompt = "You are a fully static prompt.";
        assert_eq!(apply_static_regexes(&[], prompt).unwrap(), prompt);
    }

    #[test]
    fn apply_invalid_pattern_yields_none() {
        assert!(apply_static_regexes(&labeled(&[r"([unclosed"]), "some prompt").is_none());
    }

    #[test]
    fn apply_rejects_full_erasure() {
        assert!(apply_static_regexes(&labeled(&[r"(?s).*"]), "some prompt").is_none());
    }

    #[tokio::test]
    async fn resolves_via_cached_regex_list() {
        let cache = make_cache();
        let project_id = Uuid::new_v4();
        let prompt = "You are a browser agent.\n<config>Model: gpt-4</config>";

        cache
            .insert::<Vec<LabeledRegex>>(
                &static_regex_cache_key(project_id, "abcd1234"),
                labeled(&[r"(?<=Model: )[\w.-]+"]),
            )
            .await
            .unwrap();

        let stable = resolve_stable_system_prompt(prompt, "abcd1234", project_id, &cache).await;
        assert_eq!(
            stable.unwrap(),
            "You are a browser agent.\n<config>Model: </config>"
        );
    }

    #[tokio::test]
    async fn cache_miss_yields_none_so_checkpoint_is_dropped() {
        let cache = make_cache();
        let stable =
            resolve_stable_system_prompt("some prompt", "abcd1234", Uuid::new_v4(), &cache).await;
        assert!(stable.is_none());
    }

    #[tokio::test]
    async fn cached_empty_list_resolves_to_raw_prompt() {
        let cache = make_cache();
        let project_id = Uuid::new_v4();
        let prompt = "You are a fully static prompt.";

        cache
            .insert::<Vec<LabeledRegex>>(
                &static_regex_cache_key(project_id, "abcd1234"),
                Vec::new(),
            )
            .await
            .unwrap();

        let stable = resolve_stable_system_prompt(prompt, "abcd1234", project_id, &cache).await;
        assert_eq!(stable.unwrap(), prompt);
    }

    #[tokio::test]
    async fn broken_cached_list_falls_back_to_raw_prompt() {
        let cache = make_cache();
        let project_id = Uuid::new_v4();
        let prompt = "You are a helpful agent.";

        cache
            .insert::<Vec<LabeledRegex>>(
                &static_regex_cache_key(project_id, "abcd1234"),
                labeled(&[r"([unclosed"]),
            )
            .await
            .unwrap();

        let stable = resolve_stable_system_prompt(prompt, "abcd1234", project_id, &cache).await;
        assert_eq!(stable.unwrap(), prompt);
    }

    #[tokio::test]
    async fn empty_prompt_hash_falls_back_to_skeleton_hash_key() {
        let cache = make_cache();
        let project_id = Uuid::new_v4();
        let prompt = "You are a browser agent.\n<config>Model: gpt-4</config>";
        let naive = structural_skeleton_hash(prompt);

        cache
            .insert::<Vec<LabeledRegex>>(
                &static_regex_cache_key(project_id, &naive),
                labeled(&[r"(?<=Model: )[\w.-]+"]),
            )
            .await
            .unwrap();

        let stable = resolve_stable_system_prompt(prompt, "", project_id, &cache).await;
        assert_eq!(
            stable.unwrap(),
            "You are a browser agent.\n<config>Model: </config>"
        );
    }
}
