//! Demand-driven worker generating static-part removal regexes for prompt
//! versions.
//!
//! Versions are minted by the sp-versioning classifier with NO regexes; the
//! first consumer that needs them and finds the cache key absent (today the
//! signals summarizer) reports an [`SpRegexExtractionRequest`], which its
//! driver publishes via [`request_sp_regex_extractions`]. The worker
//! sources samples from ClickHouse — spans that classified to the version
//! (`system_prompt_versions` rows), one per trace, picked across the
//! version's time range — runs the extraction agent, and writes the regex
//! list under the version's regex key.
//!
//! Sample diversity is gated, not assumed. The traces a version has right
//! after its mint are one user's burst: byte-distinct bodies whose per-user
//! values (emails, profile, account facts) all coincide, which the agent then
//! reads as static. The summarizer hashes the regex residual into its cache
//! key, so a regex list that misses a per-user field costs one summary LLM
//! call per user for the version's lifetime. The worker therefore waits until
//! the version's pool is wide enough (trace count AND wall-clock span), picks
//! its samples spread across that span, and refuses to run below the sample
//! target.
//!
//! Failures DROP the request rather than retrying on a timer: the retry
//! mechanism is demand itself — the next signal run that needs the still-
//! absent regexes re-publishes. That self-proportions retries to real usage
//! (a version nobody reads again never retries, and never needs to).

use std::collections::HashMap;
use std::sync::{Arc, LazyLock};

use async_trait::async_trait;
use uuid::Uuid;

use super::{ExtractionConfig, ExtractionTracing, extract_static_regexes, tool::LabeledRegex};
use crate::{
    cache::{Cache, CacheTrait, keys::SYSTEM_PROMPT_REGEX_EXTRACTION_LOCK_CACHE_KEY},
    ch::system_prompt_versions::VersionSpanRef,
    env,
    llm::LlmClient,
    mq::{MessageQueue, MessageQueueTrait},
    traces::sp_versioning::versions,
    worker::{HandlerError, MessageHandler},
};
use serde::{Deserialize, Serialize};

pub const SP_REGEX_EXTRACTION_QUEUE: &str = "sp_regex_extraction_queue";
pub const SP_REGEX_EXTRACTION_EXCHANGE: &str = "sp_regex_extraction_exchange";
pub const SP_REGEX_EXTRACTION_ROUTING_KEY: &str = "sp_regex_extraction_routing_key";

/// TTL on the per-version run lock: long enough for the agent to produce a
/// regex list (normally under 10 min; the per-step upper bounds are high
/// just in case, so leave generous headroom).
const RUN_LOCK_TTL_SECONDS: u64 = 60 * 60;

const NANOS_PER_SECOND: i64 = 1_000_000_000;

static CANDIDATES_PER_BUCKET: LazyLock<usize> =
    LazyLock::new(|| env::static_sp::CANDIDATES_PER_BUCKET.get());

static AGENT_SAMPLES: LazyLock<usize> = LazyLock::new(|| env::static_sp::AGENT_SAMPLES.get());
static SAMPLE_POOL_LIMIT: LazyLock<usize> =
    LazyLock::new(|| env::static_sp::SAMPLE_POOL_LIMIT.get());
static MIN_SAMPLE_POOL_TRACES: LazyLock<usize> =
    LazyLock::new(|| env::static_sp::MIN_SAMPLE_POOL_TRACES.get());
static MIN_SAMPLE_POOL_SPAN_NANOS: LazyLock<i64> = LazyLock::new(|| {
    env::static_sp::MIN_SAMPLE_POOL_SPAN_SECONDS
        .get()
        .saturating_mul(NANOS_PER_SECOND)
});

/// Cut the pool's time range into `k` equal wall-clock buckets and return up
/// to `per_bucket` refs from each non-empty one. The pool is a random sample,
/// so the first refs of a bucket are already a random subset of it.
fn bucket_refs(pool: &[VersionSpanRef], k: usize, per_bucket: usize) -> Vec<Vec<VersionSpanRef>> {
    if k == 0 || per_bucket == 0 || pool.is_empty() {
        return Vec::new();
    }
    let newest = pool.iter().map(|r| r.created_at).max().unwrap_or(0);
    let oldest = pool.iter().map(|r| r.created_at).min().unwrap_or(0);
    let range = (newest - oldest).max(1) as i128;

    let mut buckets: Vec<Vec<VersionSpanRef>> = vec![Vec::new(); k];
    for r in pool {
        let offset = (r.created_at - oldest) as i128;
        let bucket = ((offset * k as i128) / range).min(k as i128 - 1) as usize;
        if buckets[bucket].len() < per_bucket {
            buckets[bucket].push(r.clone());
        }
    }
    buckets.retain(|b| !b.is_empty());
    buckets
}

/// Per-version lock serializing this worker's agent run.
fn run_lock_cache_key(project_id: Uuid, agent_hash: &str, version_hash: &str) -> String {
    format!(
        "{SYSTEM_PROMPT_REGEX_EXTRACTION_LOCK_CACHE_KEY}:{project_id}:{agent_hash}:{version_hash}"
    )
}

/// A demand request for one version's regexes. Reported by the first
/// consumer that finds the version's regex key absent.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SpRegexExtractionRequest {
    pub project_id: Uuid,
    pub agent_hash: String,
    pub version_hash: String,
}

/// Fire-and-forget demand publish; duplicates are absorbed by the worker's
/// idempotency check and run lock, and a lost publish is re-raised by the next
/// consumer to hit the same miss. Callers (the signals drivers) are
/// signals-gated.
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub async fn request_sp_regex_extractions(
    queue: &MessageQueue,
    requests: &[SpRegexExtractionRequest],
) {
    for request in requests {
        let payload = match serde_json::to_vec(request) {
            Ok(payload) => payload,
            Err(e) => {
                log::error!("[SP_REGEX_EXTRACTION] Failed to serialize request: {e:?}");
                continue;
            }
        };
        if let Err(e) = queue
            .publish(
                &payload,
                SP_REGEX_EXTRACTION_EXCHANGE,
                SP_REGEX_EXTRACTION_ROUTING_KEY,
                None,
            )
            .await
        {
            log::warn!(
                "[SP_REGEX_EXTRACTION] Failed to publish request for version {}: {e:?}",
                request.version_hash
            );
        }
    }
}

pub struct SpRegexExtractionHandler {
    pub cache: Arc<Cache>,
    pub clickhouse: clickhouse::Client,
    /// The shared LLM client. In production this handler is only spawned when
    /// the client is `Some` (a client-less node must NOT consume this queue,
    /// or it would ack-and-drop work another node enqueued). `None` is
    /// reachable only via the test seam below.
    pub llm_client: Option<Arc<LlmClient>>,
    /// Test seam replacing the extraction agent: `Some(regexes)` is returned
    /// as the agent's answer (empty = simulated agent failure).
    #[cfg(test)]
    pub test_regexes: Option<Vec<String>>,
    /// Test seam replacing the ClickHouse sample sourcing: the version's
    /// sample pool paired with each ref's prompt body.
    #[cfg(test)]
    pub test_pool: Option<Vec<(VersionSpanRef, String)>>,
}

impl SpRegexExtractionHandler {
    pub fn new(
        cache: Arc<Cache>,
        clickhouse: clickhouse::Client,
        llm_client: Option<Arc<LlmClient>>,
    ) -> Self {
        Self {
            cache,
            clickhouse,
            llm_client,
            #[cfg(test)]
            test_regexes: None,
            #[cfg(test)]
            test_pool: None,
        }
    }
}

#[async_trait]
impl MessageHandler for SpRegexExtractionHandler {
    type Message = SpRegexExtractionRequest;

    async fn handle(&self, request: Self::Message) -> Result<(), HandlerError> {
        // Failures drop the request — the next demand retries (see module
        // docs). Never reject-with-requeue: a broker-level retry loop would
        // hammer a persistently failing agent with no spacing.
        if let Err(e) = self.process_request(&request).await {
            log::error!(
                "[SP_REGEX_EXTRACTION] Failed to produce regexes for version {} (agent {}): {e:?}; dropping — next demand retries",
                request.version_hash,
                request.agent_hash
            );
        }
        Ok(())
    }
}

impl SpRegexExtractionHandler {
    async fn process_request(&self, request: &SpRegexExtractionRequest) -> anyhow::Result<()> {
        // Idempotency: a duplicate request (several signal runs demanded the
        // same version before the first write landed).
        let existing = versions::get_version_regexes(
            &self.cache,
            request.project_id,
            &request.agent_hash,
            &request.version_hash,
        )
        .await;
        if existing.is_some() {
            log::debug!(
                "[SP_REGEX_EXTRACTION] Regexes already produced for version {} — skipping",
                request.version_hash
            );
            return Ok(());
        }

        // One agent run per version: whoever holds the lock runs; everyone
        // else drops (the winner's write satisfies their demand).
        let lock_key = run_lock_cache_key(
            request.project_id,
            &request.agent_hash,
            &request.version_hash,
        );
        let acquired = self
            .cache
            .try_acquire_lock(&lock_key, RUN_LOCK_TTL_SECONDS)
            .await
            .unwrap_or_else(|e| {
                log::warn!("[SP_REGEX_EXTRACTION] Failed to acquire lock {lock_key}: {e:?}");
                false
            });
        if !acquired {
            log::debug!(
                "[SP_REGEX_EXTRACTION] Extraction already running for version {} — dropping duplicate request",
                request.version_hash
            );
            return Ok(());
        }

        let result = self.run_locked(request).await;

        if let Err(e) = self.cache.release_lock(&lock_key).await {
            log::warn!("[SP_REGEX_EXTRACTION] Failed to release lock {lock_key}: {e:?}");
        }
        result
    }

    /// Runs with the per-version lock held; the caller releases it on every
    /// path.
    async fn run_locked(&self, request: &SpRegexExtractionRequest) -> anyhow::Result<()> {
        // Every gate inside drops the request; the pool grows and the next
        // demand re-checks.
        let Some(samples) = self.gather_samples(request).await else {
            return Ok(());
        };

        let regexes = self
            .run_extraction(&samples, &request.agent_hash, request.project_id)
            .await?;

        versions::write_version_regexes(
            &self.cache,
            request.project_id,
            &request.agent_hash,
            &request.version_hash,
            &regexes,
        )
        .await?;

        log::info!(
            "[SP_REGEX_EXTRACTION] Produced {} regex(es) for version {} (agent {}, project {})",
            regexes.len(),
            request.version_hash,
            request.agent_hash,
            request.project_id
        );
        Ok(())
    }

    /// Sample set for the extraction agent, or `None` when the version's pool
    /// is not yet wide enough to sample from (see module docs): the pool must
    /// hold `MIN_SAMPLE_POOL_TRACES` distinct traces spanning at least
    /// `MIN_SAMPLE_POOL_SPAN_SECONDS`. The span is cut into `AGENT_SAMPLES`
    /// buckets ([`bucket_refs`]) and one byte-distinct body is taken per
    /// bucket; leftover candidates top up sparse ranges. Fewer than
    /// `AGENT_SAMPLES` distinct bodies is a drop.
    async fn gather_samples(&self, request: &SpRegexExtractionRequest) -> Option<Vec<String>> {
        let target = (*AGENT_SAMPLES).max(1);
        let pool = self.fetch_version_pool(request).await;
        if pool.len() < *MIN_SAMPLE_POOL_TRACES {
            log::info!(
                "[SP_REGEX_EXTRACTION] Pool of {} trace(s) below the {} minimum for version {} — dropping; next demand retries",
                pool.len(),
                *MIN_SAMPLE_POOL_TRACES,
                request.version_hash
            );
            return None;
        }
        let newest = pool.iter().map(|r| r.created_at).max().unwrap_or(0);
        let oldest = pool.iter().map(|r| r.created_at).min().unwrap_or(0);
        if newest - oldest < *MIN_SAMPLE_POOL_SPAN_NANOS {
            log::info!(
                "[SP_REGEX_EXTRACTION] Pool of {} traces spans only {}s for version {} — dropping; next demand retries",
                pool.len(),
                (newest - oldest) / NANOS_PER_SECOND,
                request.version_hash
            );
            return None;
        }

        let buckets = bucket_refs(&pool, target, *CANDIDATES_PER_BUCKET);
        let candidates: Vec<VersionSpanRef> = buckets.iter().flatten().cloned().collect();
        let fetched = self.fetch_prompts(request.project_id, &candidates).await;

        let mut samples: Vec<String> = Vec::with_capacity(target);
        let try_push = |r: &VersionSpanRef, samples: &mut Vec<String>| -> bool {
            let Some(text) = fetched.get(&r.span_id) else {
                return false;
            };
            if text.is_empty() || samples.iter().any(|s| s == text) {
                return false;
            }
            samples.push(text.clone());
            true
        };
        for bucket in &buckets {
            for r in bucket {
                if try_push(r, &mut samples) {
                    break;
                }
            }
        }
        // Sparse range (fewer non-empty buckets than the target): fill from the
        // remaining candidates; already-used refs fail the distinctness check.
        for r in &candidates {
            if samples.len() >= target {
                break;
            }
            try_push(r, &mut samples);
        }
        if samples.len() < target {
            log::info!(
                "[SP_REGEX_EXTRACTION] Only {} distinct sample(s) of {} required for version {} — dropping; next demand retries",
                samples.len(),
                target,
                request.version_hash
            );
            return None;
        }
        Some(samples)
    }

    async fn fetch_version_pool(&self, request: &SpRegexExtractionRequest) -> Vec<VersionSpanRef> {
        #[cfg(test)]
        if let Some(pool) = &self.test_pool {
            return pool.iter().map(|(r, _)| r.clone()).collect();
        }
        match crate::ch::system_prompt_versions::fetch_version_span_refs(
            &self.clickhouse,
            request.project_id,
            &request.version_hash,
            *SAMPLE_POOL_LIMIT,
        )
        .await
        {
            Ok(refs) => refs,
            Err(e) => {
                log::warn!("[SP_REGEX_EXTRACTION] Version span-ref lookup failed: {e:?}");
                Vec::new()
            }
        }
    }

    async fn fetch_prompts(
        &self,
        project_id: Uuid,
        refs: &[VersionSpanRef],
    ) -> HashMap<Uuid, String> {
        #[cfg(test)]
        if let Some(pool) = &self.test_pool {
            return pool
                .iter()
                .filter(|(r, _)| refs.contains(r))
                .map(|(r, body)| (r.span_id, body.clone()))
                .collect();
        }
        let refs: Vec<(Uuid, Uuid)> = refs.iter().map(|r| (r.trace_id, r.span_id)).collect();
        match crate::ch::system_prompt_versions::fetch_system_prompts(
            &self.clickhouse,
            project_id,
            &refs,
        )
        .await
        {
            Ok(fetched) => fetched,
            Err(e) => {
                log::warn!("[SP_REGEX_EXTRACTION] Raw prompt refetch failed: {e:?}");
                HashMap::new()
            }
        }
    }

    /// Destination project for the extraction run's internal self-tracing
    /// spans. Unset/unparsable ⇒ `None` ⇒ the spans are dropped by the
    /// internal exporter (tracing effectively off). `mod env` shadows
    /// `std::env`, hence the fully-qualified read.
    fn internal_project_id() -> Option<Uuid> {
        std::env::var(crate::env::connections::STATIC_SP_INTERNAL_PROJECT_ID)
            .ok()
            .and_then(|s| s.parse().ok())
    }

    /// Run the extraction agent on the samples and return the ordered
    /// `{pattern, label}` removal regexes exactly as the agent produced them.
    /// The agent itself never errors — an empty regex list means every
    /// attempt failed, which is surfaced as an error so the request drops
    /// (the next demand retries).
    async fn run_extraction(
        &self,
        samples: &[String],
        agent_hash: &str,
        source_project_id: Uuid,
    ) -> anyhow::Result<Vec<LabeledRegex>> {
        #[cfg(test)]
        if let Some(regexes) = &self.test_regexes {
            if regexes.is_empty() {
                anyhow::bail!("Simulated extraction failure");
            }
            return Ok(regexes
                .iter()
                .map(|p| LabeledRegex {
                    pattern: p.clone(),
                    label: String::new(),
                })
                .collect());
        }

        let Some(llm_client) = &self.llm_client else {
            anyhow::bail!("LLM client not configured");
        };
        let result = extract_static_regexes(
            llm_client,
            samples,
            &ExtractionConfig::default(),
            &ExtractionTracing {
                project_id: Self::internal_project_id(),
                source_project_id: Some(source_project_id),
                parent: None,
                prompt_hash: Some(agent_hash.to_string()),
            },
        )
        .await;
        if result.regexes.is_empty() {
            anyhow::bail!(
                "Extraction agent produced no regexes after {} tool calls",
                result.tool_calls
            );
        }
        Ok(result.regexes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::in_memory::InMemoryCache;

    const AGENT: &str = "agent001";
    const VERSION: &str = "deadbeef";

    const HOUR_NANOS: i64 = 3600 * NANOS_PER_SECOND;
    /// Wide enough for every gate at default settings (15 traces / 30 min).
    const WIDE_POOL: usize = 20;

    fn make_worker() -> SpRegexExtractionHandler {
        SpRegexExtractionHandler {
            cache: Arc::new(Cache::InMemory(InMemoryCache::new(None))),
            clickhouse: clickhouse::Client::default(),
            llm_client: None,
            test_regexes: Some(vec![r"\d+".to_string()]),
            test_pool: None,
        }
    }

    fn sample_prompt(i: usize) -> String {
        format!("You are a test agent.\nuser: user-{i}\nbody line\ntail line")
    }

    fn make_request(project_id: Uuid) -> SpRegexExtractionRequest {
        SpRegexExtractionRequest {
            project_id,
            agent_hash: AGENT.to_string(),
            version_hash: VERSION.to_string(),
        }
    }

    fn make_ref(created_at: i64) -> VersionSpanRef {
        VersionSpanRef {
            trace_id: Uuid::new_v4(),
            span_id: Uuid::new_v4(),
            created_at,
        }
    }

    /// Pool of `count` refs newest first, `spacing` nanos apart, with the
    /// given body per rank.
    fn pool_with(
        count: usize,
        spacing: i64,
        body: impl Fn(usize) -> String,
    ) -> Vec<(VersionSpanRef, String)> {
        (0..count)
            .map(|i| (make_ref((count - i) as i64 * spacing), body(i)))
            .collect()
    }

    /// Pool of `count` distinct bodies an hour apart.
    fn pool(count: usize) -> Vec<(VersionSpanRef, String)> {
        pool_with(count, HOUR_NANOS, sample_prompt)
    }

    async fn cached_regexes(worker: &SpRegexExtractionHandler, project_id: Uuid) -> Option<usize> {
        versions::get_version_regexes(&worker.cache, project_id, AGENT, VERSION)
            .await
            .map(|r| r.len())
    }

    fn lock_key(project_id: Uuid) -> String {
        run_lock_cache_key(project_id, AGENT, VERSION)
    }

    #[tokio::test]
    async fn produces_and_caches_regexes() {
        let mut worker = make_worker();
        let project_id = Uuid::new_v4();
        worker.test_pool = Some(pool(WIDE_POOL));

        worker.handle(make_request(project_id)).await.unwrap();

        assert_eq!(cached_regexes(&worker, project_id).await, Some(1));
        // Run lock released.
        assert!(
            worker
                .cache
                .try_acquire_lock(&lock_key(project_id), RUN_LOCK_TTL_SECONDS)
                .await
                .unwrap()
        );
    }

    #[tokio::test]
    async fn duplicate_request_skips_when_regexes_exist() {
        let mut worker = make_worker();
        let project_id = Uuid::new_v4();
        versions::write_version_regexes(
            &worker.cache,
            project_id,
            AGENT,
            VERSION,
            &[LabeledRegex {
                pattern: r"\d+".to_string(),
                label: String::new(),
            }],
        )
        .await
        .unwrap();

        // Any agent run would now fail loudly — the idempotency check must
        // short-circuit before it.
        worker.test_regexes = Some(Vec::new());
        worker.test_pool = Some(pool(WIDE_POOL));

        worker.handle(make_request(project_id)).await.unwrap();
        assert_eq!(cached_regexes(&worker, project_id).await, Some(1));
    }

    #[tokio::test]
    async fn drops_when_no_samples_queryable_yet() {
        let mut worker = make_worker();
        let project_id = Uuid::new_v4();
        // Version rows / bodies not queryable yet (demand raced the mint).
        worker.test_pool = Some(Vec::new());

        worker.handle(make_request(project_id)).await.unwrap();

        assert_eq!(cached_regexes(&worker, project_id).await, None);
        // Lock released so the next demand can run immediately.
        assert!(
            worker
                .cache
                .try_acquire_lock(&lock_key(project_id), RUN_LOCK_TTL_SECONDS)
                .await
                .unwrap()
        );
    }

    #[tokio::test]
    async fn drops_below_min_pool() {
        let mut worker = make_worker();
        let project_id = Uuid::new_v4();
        // Plenty of distinct bodies over a wide span, but fewer traces than
        // the pool minimum: the version is too young to sample.
        worker.test_pool = Some(pool(*MIN_SAMPLE_POOL_TRACES - 1));

        worker.handle(make_request(project_id)).await.unwrap();
        assert_eq!(cached_regexes(&worker, project_id).await, None);
    }

    #[tokio::test]
    async fn drops_when_pool_is_a_burst() {
        let mut worker = make_worker();
        let project_id = Uuid::new_v4();
        // Enough traces, all within a second — one user's burst.
        worker.test_pool = Some(pool_with(WIDE_POOL, NANOS_PER_SECOND / 100, sample_prompt));

        worker.handle(make_request(project_id)).await.unwrap();
        assert_eq!(cached_regexes(&worker, project_id).await, None);
    }

    #[tokio::test]
    async fn byte_identical_bodies_collapse_to_one_sample() {
        let mut worker = make_worker();
        let project_id = Uuid::new_v4();
        // A wide pool whose spans all carry the same bytes → one distinct
        // sample → below the sample minimum → drop.
        let body = sample_prompt(0);
        worker.test_pool = Some(pool_with(WIDE_POOL, HOUR_NANOS, |_| body.clone()));

        worker.handle(make_request(project_id)).await.unwrap();
        assert_eq!(cached_regexes(&worker, project_id).await, None);
    }

    #[tokio::test]
    async fn drops_below_sample_minimum() {
        let mut worker = make_worker();
        let project_id = Uuid::new_v4();
        // Wide pool but only AGENT_SAMPLES - 1 distinct bodies.
        let distinct = *AGENT_SAMPLES - 1;
        worker.test_pool = Some(pool_with(WIDE_POOL, HOUR_NANOS, |i| {
            sample_prompt(i % distinct)
        }));

        worker.handle(make_request(project_id)).await.unwrap();
        assert_eq!(cached_regexes(&worker, project_id).await, None);
    }

    fn refs_only(pool: Vec<(VersionSpanRef, String)>) -> Vec<VersionSpanRef> {
        pool.into_iter().map(|(r, _)| r).collect()
    }

    #[test]
    fn buckets_cover_the_range_with_bounded_candidates() {
        // 100 refs a minute apart, k = 10 → 10 buckets, 3 candidates each,
        // every candidate inside its own bucket.
        let pool = refs_only(pool_with(100, 60 * NANOS_PER_SECOND, |_| String::new()));
        let buckets = bucket_refs(&pool, 10, 3);
        assert_eq!(buckets.len(), 10);
        let oldest = pool.last().unwrap().created_at;
        let range = (pool[0].created_at - oldest) as i128;
        let mut seen = std::collections::HashSet::new();
        for bucket in &buckets {
            assert_eq!(bucket.len(), 3);
            let ids: std::collections::HashSet<usize> = bucket
                .iter()
                .map(|r| (((r.created_at - oldest) as i128 * 10) / range).min(9) as usize)
                .collect();
            assert_eq!(ids.len(), 1, "candidates from one bucket");
            assert!(
                seen.insert(ids.into_iter().next().unwrap()),
                "bucket repeated"
            );
        }
    }

    #[test]
    fn empty_buckets_are_omitted() {
        // Two clusters (newest hour, oldest hour), k = 6 → 2 non-empty buckets.
        let newest = 100 * HOUR_NANOS;
        let mut pool: Vec<VersionSpanRef> = (0..10)
            .map(|i| make_ref(newest - i * 60 * NANOS_PER_SECOND))
            .collect();
        pool.extend(
            (0..10).map(|i| make_ref(newest - 10 * HOUR_NANOS - i * 60 * NANOS_PER_SECOND)),
        );
        let buckets = bucket_refs(&pool, 6, 3);
        assert_eq!(buckets.len(), 2);
        assert!(buckets.iter().all(|b| b.len() == 3));
    }

    #[test]
    fn bucket_refs_degenerate_inputs() {
        let pool = refs_only(pool_with(3, HOUR_NANOS, |_| String::new()));
        let buckets = bucket_refs(&pool, 15, 3);
        assert_eq!(buckets.iter().flatten().count(), 3);
        assert!(bucket_refs(&pool, 0, 3).is_empty());
        assert!(bucket_refs(&pool, 5, 0).is_empty());
        assert!(bucket_refs(&[], 5, 3).is_empty());
    }

    #[tokio::test]
    async fn samples_come_from_every_time_bucket() {
        // 100 distinct bodies an hour apart: the samples must land one per
        // bucket across the whole range, not in the newest stretch.
        let mut worker = make_worker();
        let pool = pool_with(100, HOUR_NANOS, sample_prompt);
        worker.test_pool = Some(pool.clone());
        let target = *AGENT_SAMPLES;

        let samples = worker
            .gather_samples(&make_request(Uuid::new_v4()))
            .await
            .unwrap();
        assert_eq!(samples.len(), target);
        let mut buckets: Vec<usize> = samples
            .iter()
            .map(|s| {
                let rank = pool.iter().position(|(_, body)| body == s).unwrap();
                // rank 0 is newest; 100 ranks → `target` equal buckets
                rank * target / 100
            })
            .collect();
        buckets.sort_unstable();
        assert_eq!(buckets, (0..target).collect::<Vec<_>>());
    }

    #[tokio::test]
    async fn burst_bucket_yields_one_sample_and_the_rest_come_from_the_tail() {
        // Newest bucket is a 90-trace burst of ONE body; the tail has distinct
        // hourly bodies. Exactly one sample may carry the burst body.
        let mut worker = make_worker();
        let newest = 100 * HOUR_NANOS;
        let burst_body = sample_prompt(999);
        let mut pool: Vec<(VersionSpanRef, String)> = (0..90)
            .map(|i| {
                (
                    make_ref(newest - i as i64 * NANOS_PER_SECOND / 10),
                    burst_body.clone(),
                )
            })
            .collect();
        pool.extend(
            (1..=20).map(|h| (make_ref(newest - h * HOUR_NANOS), sample_prompt(h as usize))),
        );
        worker.test_pool = Some(pool);

        let samples = worker
            .gather_samples(&make_request(Uuid::new_v4()))
            .await
            .unwrap();
        assert_eq!(samples.len(), *AGENT_SAMPLES);
        assert_eq!(samples.iter().filter(|s| **s == burst_body).count(), 1);
    }

    #[tokio::test]
    async fn agent_failure_drops_and_releases_lock() {
        let mut worker = make_worker();
        let project_id = Uuid::new_v4();
        worker.test_pool = Some(pool(WIDE_POOL));
        // Empty test regexes simulate the agent finishing without an answer.
        worker.test_regexes = Some(Vec::new());

        worker.handle(make_request(project_id)).await.unwrap();

        assert_eq!(cached_regexes(&worker, project_id).await, None);
        assert!(
            worker
                .cache
                .try_acquire_lock(&lock_key(project_id), RUN_LOCK_TTL_SECONDS)
                .await
                .unwrap()
        );
    }

    #[tokio::test]
    async fn drops_when_another_worker_holds_the_run_lock() {
        let mut worker = make_worker();
        let project_id = Uuid::new_v4();
        worker.test_pool = Some(pool(WIDE_POOL));
        // Any agent run would fail loudly — the lock gate must come first.
        worker.test_regexes = Some(Vec::new());

        assert!(
            worker
                .cache
                .try_acquire_lock(&lock_key(project_id), RUN_LOCK_TTL_SECONDS)
                .await
                .unwrap()
        );

        worker.handle(make_request(project_id)).await.unwrap();
        assert_eq!(cached_regexes(&worker, project_id).await, None);
    }
}
