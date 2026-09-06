//! Per-cohort sample accumulator feeding the multi-sample user-task regex agent.
//!
//! A cohort is `(project, agent_hash, version_hash, has_history)` — the same key
//! the regex itself is cached under. The extraction worker appends the user text
//! it was about to extract directly, so the samples cost nothing beyond the
//! fallback that was happening anyway, and they are exactly the texts the regex
//! will be applied to (winner spans, not every span carrying the prompt).
//!
//! Samples are KEPT after the agent runs: a later regeneration for the same
//! version starts from what it already has, and the blob is a few KB.
//! `last_attempt_at` is what stops a full accumulator from re-triggering on
//! every subsequent trace — without it, a cohort whose samples admit no anchor
//! would publish an agent request forever.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::cache::keys::USER_TASK_SAMPLES_CACHE_KEY;
use crate::cache::{Cache, CacheTrait};

/// Per-sample cap. `signposted_text` is capped at 200k chars, so five uncapped
/// samples could be a megabyte — past any model's input budget. Head and tail
/// are kept rather than a prefix because the static anchors the agent needs sit
/// at the boundaries, and the patterns it produces (`(?s).*END\s*(.*)` and
/// friends) still match the untruncated text.
const SAMPLE_MAX_CHARS: usize = 24_000;

const TRUNCATION_MARKER: &str = "\n\n[... middle omitted ...]\n\n";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SampleAccumulator {
    /// Distinct user texts, capped at the sample target. Dedup compares the
    /// texts directly — at five entries that is cheaper than maintaining a
    /// parallel hash list.
    #[serde(default)]
    pub samples: Vec<String>,
    /// Unix seconds of the last agent request published for this cohort.
    #[serde(default)]
    pub last_attempt_at: Option<i64>,
}

pub fn cohort_cache_key(
    project_id: Uuid,
    agent_hash: &str,
    version_hash: &str,
    has_history: bool,
) -> String {
    let history = if has_history { "h" } else { "n" };
    format!("{USER_TASK_SAMPLES_CACHE_KEY}:{project_id}:{agent_hash}:{version_hash}:{history}")
}

/// Head+tail truncation on char boundaries.
fn cap_sample(text: &str) -> String {
    let total = text.chars().count();
    if total <= SAMPLE_MAX_CHARS {
        return text.to_string();
    }
    let keep = SAMPLE_MAX_CHARS / 2;
    let head_end = text
        .char_indices()
        .nth(keep)
        .map(|(i, _)| i)
        .unwrap_or(text.len());
    let tail_start = text
        .char_indices()
        .nth(total - keep)
        .map(|(i, _)| i)
        .unwrap_or(text.len());
    format!(
        "{}{TRUNCATION_MARKER}{}",
        &text[..head_end],
        &text[tail_start..]
    )
}

/// Whether the accumulator may publish an agent request now: enough distinct
/// samples, and no attempt inside the retry interval.
fn is_ready(accumulator: &SampleAccumulator, target: usize, now: i64) -> bool {
    if accumulator.samples.len() < target {
        return false;
    }
    let interval = crate::env::static_sp::INPUT_REGEX_RETRY_INTERVAL_SECONDS.get();
    accumulator
        .last_attempt_at
        .is_none_or(|last| now - last >= interval)
}

/// Append `text` when it is new, then report whether this cohort should trigger
/// an agent run. Stamping `last_attempt_at` in the SAME write that reports
/// readiness is deliberate: it keeps the retry interval enforced by one
/// round-trip, and the duplicate-publish window it leaves open is already closed
/// by the agent worker's per-cohort run lock.
///
/// Best-effort — a cache error is logged and reported as not-ready, so a Redis
/// blip costs a delayed agent run, never a lost extraction.
pub async fn record_sample(cache: &Cache, key: &str, text: &str, target: usize) -> bool {
    let mut accumulator: SampleAccumulator = match cache.get(key).await {
        Ok(existing) => existing.unwrap_or_default(),
        Err(e) => {
            log::warn!("user-task: sample accumulator read failed for {key}: {e:?}");
            return false;
        }
    };

    let sample = cap_sample(text);
    if accumulator.samples.len() < target && !accumulator.samples.contains(&sample) {
        accumulator.samples.push(sample);
    }

    let now = chrono::Utc::now().timestamp();
    let ready = is_ready(&accumulator, target, now);
    if ready {
        accumulator.last_attempt_at = Some(now);
    }

    let ttl = crate::env::static_sp::INPUT_ACCUMULATOR_TTL_SECONDS.get();
    if let Err(e) = cache.insert_with_ttl(key, &accumulator, ttl).await {
        log::warn!("user-task: sample accumulator write failed for {key}: {e:?}");
        // The readiness verdict rode on a write that didn't land, so the attempt
        // stamp is lost too — decline rather than publish a request whose retry
        // interval was never recorded.
        return false;
    }
    ready
}

/// The cohort's accumulated samples, for the agent run.
pub async fn load_samples(cache: &Cache, key: &str) -> Vec<String> {
    match cache.get::<SampleAccumulator>(key).await {
        Ok(accumulator) => accumulator.map(|a| a.samples).unwrap_or_default(),
        Err(e) => {
            log::warn!("user-task: sample accumulator read failed for {key}: {e:?}");
            Vec::new()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::in_memory::InMemoryCache;

    fn make_cache() -> Cache {
        Cache::InMemory(InMemoryCache::new(None))
    }

    #[tokio::test]
    async fn accumulates_distinct_samples_then_reports_ready() {
        let cache = make_cache();
        let key = cohort_cache_key(Uuid::new_v4(), "agent", "vhash", false);

        for i in 0..2 {
            assert!(
                !record_sample(&cache, &key, &format!("task {i}"), 3).await,
                "not ready below the target"
            );
        }
        assert!(record_sample(&cache, &key, "task 2", 3).await);
        assert_eq!(load_samples(&cache, &key).await.len(), 3);
    }

    #[tokio::test]
    async fn byte_identical_samples_do_not_count_twice() {
        let cache = make_cache();
        let key = cohort_cache_key(Uuid::new_v4(), "agent", "vhash", false);

        for _ in 0..5 {
            assert!(!record_sample(&cache, &key, "the same task", 3).await);
        }
        assert_eq!(load_samples(&cache, &key).await, vec!["the same task"]);
    }

    /// A full accumulator must not re-trigger on every later trace: the first
    /// arrival past the target reports ready, the next ones do not until the
    /// retry interval elapses.
    #[tokio::test]
    async fn full_accumulator_triggers_once_per_retry_interval() {
        let cache = make_cache();
        let key = cohort_cache_key(Uuid::new_v4(), "agent", "vhash", true);

        assert!(!record_sample(&cache, &key, "a", 2).await);
        assert!(record_sample(&cache, &key, "b", 2).await);
        for _ in 0..3 {
            assert!(
                !record_sample(&cache, &key, "c", 2).await,
                "still inside the retry interval"
            );
        }

        // Backdate the attempt past the interval: retry is allowed again.
        let mut accumulator: SampleAccumulator = cache.get(&key).await.unwrap().unwrap();
        let interval = crate::env::static_sp::INPUT_REGEX_RETRY_INTERVAL_SECONDS.get();
        accumulator.last_attempt_at = Some(chrono::Utc::now().timestamp() - interval - 1);
        cache.insert(&key, &accumulator).await.unwrap();
        assert!(record_sample(&cache, &key, "d", 2).await);
    }

    #[tokio::test]
    async fn samples_survive_the_agent_run() {
        let cache = make_cache();
        let key = cohort_cache_key(Uuid::new_v4(), "agent", "vhash", false);
        record_sample(&cache, &key, "a", 2).await;
        record_sample(&cache, &key, "b", 2).await;
        // A later trace neither clears nor grows the capped set.
        record_sample(&cache, &key, "c", 2).await;
        assert_eq!(load_samples(&cache, &key).await, vec!["a", "b"]);
    }

    #[test]
    fn oversized_samples_keep_head_and_tail() {
        let text = format!("HEAD{}TAIL", "x".repeat(SAMPLE_MAX_CHARS * 2));
        let capped = cap_sample(&text);
        assert!(capped.starts_with("HEAD"));
        assert!(capped.ends_with("TAIL"));
        assert!(capped.contains(TRUNCATION_MARKER));
        assert!(capped.chars().count() < text.chars().count());
    }

    #[test]
    fn cap_is_char_safe_on_multibyte_input() {
        let text = "é".repeat(SAMPLE_MAX_CHARS * 2);
        let capped = cap_sample(&text);
        assert!(capped.contains(TRUNCATION_MARKER));
        assert!(capped.starts_with('é'));
    }
}
