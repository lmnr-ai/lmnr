//! Demand-driven worker generating static-part removal regexes for prompt
//! versions.
//!
//! Versions are minted by the sp-versioning classifier with NO regexes; the
//! first consumer that needs them and finds the cache key absent (today the
//! signals summarizer) publishes an [`SpRegexExtractionRequest`]. The worker
//! sources samples from ClickHouse — recent spans that classified to the
//! version (`system_prompt_versions` rows), one per trace — runs the
//! extraction agent, and writes the regex list under the version's regex key.
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

/// Refs fetched per request, a multiple of the sample target: byte-identical
/// bodies collapse in the dedup, so overfetch buys distinctness.
const SAMPLE_REF_OVERFETCH: usize = 3;

static AGENT_SAMPLES: LazyLock<usize> = LazyLock::new(|| env::static_sp::AGENT_SAMPLES.get());

/// Per-version lock serializing this worker's agent run.
fn run_lock_cache_key(project_id: Uuid, agent_hash: &str, version_hash: &str) -> String {
    format!(
        "{SYSTEM_PROMPT_REGEX_EXTRACTION_LOCK_CACHE_KEY}:{project_id}:{agent_hash}:{version_hash}"
    )
}

/// A demand request for one version's regexes. Published by the first
/// consumer that finds the version's regex key absent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpRegexExtractionRequest {
    pub project_id: Uuid,
    pub agent_hash: String,
    pub version_hash: String,
}

/// Fire-and-forget demand publish; duplicates are absorbed by the worker's
/// idempotency check and run lock. Consumers (the signals summarizer) are
/// signals-gated.
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub async fn request_sp_regex_extraction(
    queue: &MessageQueue,
    project_id: Uuid,
    agent_hash: &str,
    version_hash: &str,
) {
    let request = SpRegexExtractionRequest {
        project_id,
        agent_hash: agent_hash.to_string(),
        version_hash: version_hash.to_string(),
    };
    let payload = match serde_json::to_vec(&request) {
        Ok(payload) => payload,
        Err(e) => {
            log::error!("[SP_REGEX_EXTRACTION] Failed to serialize request: {e:?}");
            return;
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
            "[SP_REGEX_EXTRACTION] Failed to publish request for version {version_hash}: {e:?}"
        );
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
    /// Test seam replacing the ClickHouse sample sourcing: keys double as
    /// the version's span refs, values as the refetched prompt bodies.
    #[cfg(test)]
    pub test_fetched_prompts: Option<HashMap<Uuid, String>>,
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
            test_fetched_prompts: None,
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
        let samples = self.gather_samples(request).await;
        if samples.len() < 2 {
            // Version rows / span bodies not queryable yet (a demand can
            // arrive seconds after the mint, before the cluster's parked
            // messages resolved) — drop; rows accrue and the next demand
            // finds them.
            log::info!(
                "[SP_REGEX_EXTRACTION] Only {} distinct sample(s) available for version {} — dropping; next demand retries",
                samples.len(),
                request.version_hash
            );
            return Ok(());
        }

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

    /// Sample set for the extraction agent: recent spans that classified to
    /// the version (one per trace — distinct traces carry distinct dynamic
    /// content), bodies refetched from ClickHouse and deduped byte-identical.
    async fn gather_samples(&self, request: &SpRegexExtractionRequest) -> Vec<String> {
        let target = (*AGENT_SAMPLES).max(2);
        let refs = self
            .fetch_version_refs(request, target * SAMPLE_REF_OVERFETCH)
            .await;
        if refs.is_empty() {
            return Vec::new();
        }
        let fetched = self.fetch_prompts(request.project_id, &refs).await;

        let mut samples: Vec<String> = Vec::with_capacity(target);
        for (_, span_id) in &refs {
            if samples.len() >= target {
                break;
            }
            let Some(text) = fetched.get(span_id) else {
                continue;
            };
            if !text.is_empty() && !samples.iter().any(|s| s == text) {
                samples.push(text.clone());
            }
        }
        samples
    }

    async fn fetch_version_refs(
        &self,
        request: &SpRegexExtractionRequest,
        limit: usize,
    ) -> Vec<(Uuid, Uuid)> {
        #[cfg(test)]
        if let Some(fetched) = &self.test_fetched_prompts {
            return fetched.keys().map(|id| (Uuid::new_v4(), *id)).collect();
        }
        match crate::ch::system_prompt_versions::fetch_recent_version_span_refs(
            &self.clickhouse,
            request.project_id,
            &request.version_hash,
            limit,
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
        refs: &[(Uuid, Uuid)],
    ) -> HashMap<Uuid, String> {
        #[cfg(test)]
        if let Some(fetched) = &self.test_fetched_prompts {
            return fetched.clone();
        }
        match crate::ch::system_prompt_versions::fetch_system_prompts(
            &self.clickhouse,
            project_id,
            refs,
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

    fn make_worker() -> SpRegexExtractionHandler {
        SpRegexExtractionHandler {
            cache: Arc::new(Cache::InMemory(InMemoryCache::new(None))),
            clickhouse: clickhouse::Client::default(),
            llm_client: None,
            test_regexes: Some(vec![r"\d+".to_string()]),
            test_fetched_prompts: None,
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

    /// Span-id → body map the sample-sourcing seam serves.
    fn bodies(count: usize) -> HashMap<Uuid, String> {
        (0..count)
            .map(|i| (Uuid::new_v4(), sample_prompt(i)))
            .collect()
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
        worker.test_fetched_prompts = Some(bodies(3));

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
        worker.test_fetched_prompts = Some(bodies(3));

        worker.handle(make_request(project_id)).await.unwrap();
        assert_eq!(cached_regexes(&worker, project_id).await, Some(1));
    }

    #[tokio::test]
    async fn drops_when_no_samples_queryable_yet() {
        let mut worker = make_worker();
        let project_id = Uuid::new_v4();
        // Version rows / bodies not queryable yet (demand raced the mint).
        worker.test_fetched_prompts = Some(HashMap::new());

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
    async fn byte_identical_bodies_collapse_to_one_sample() {
        let mut worker = make_worker();
        let project_id = Uuid::new_v4();
        // Three spans, all carrying the same bytes → one distinct sample →
        // below the 2-sample floor → drop.
        let body = sample_prompt(0);
        worker.test_fetched_prompts = Some(
            (0..3)
                .map(|_| (Uuid::new_v4(), body.clone()))
                .collect::<HashMap<_, _>>(),
        );

        worker.handle(make_request(project_id)).await.unwrap();
        assert_eq!(cached_regexes(&worker, project_id).await, None);
    }

    #[tokio::test]
    async fn agent_failure_drops_and_releases_lock() {
        let mut worker = make_worker();
        let project_id = Uuid::new_v4();
        worker.test_fetched_prompts = Some(bodies(3));
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
        worker.test_fetched_prompts = Some(bodies(3));
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
