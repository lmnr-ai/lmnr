//! Worker generating a prompt version's user-task extraction regex from the
//! cohort's accumulated samples.
//!
//! Its own queue, separate from `input_extraction_queue`: an agent run takes
//! minutes while a per-trace extraction takes seconds, so sharing one queue would
//! block the fast path behind the slow one for the whole ratio.
//!
//! Requests are published by the extraction worker when a cohort's accumulator
//! first reaches its sample target. Failures DROP the request rather than
//! retrying on a timer — the retry mechanism is the accumulator's
//! `last_attempt_at`, which lets the next trace past the retry interval
//! re-trigger. That self-proportions retries to real traffic, and a cohort nobody
//! sends traces for never retries (and never needs to).

use std::sync::Arc;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::accumulator::{cohort_cache_key, load_samples};
use super::generate::GenerationVerdict;
use super::generate_multi::generate_extraction_regex_multi;
use super::regex::versioned_regex_cache_key;
use super::self_tracing::{self, RunKind, SpanBuilder, SpanContextCarrier, SpanScope};
use crate::cache::keys::USER_TASK_REGEX_AGENT_LOCK_CACHE_KEY;
use crate::cache::{Cache, CacheTrait};
use crate::llm::LlmClient;
use crate::mq::{MessageQueue, MessageQueueTrait};
use crate::worker::{HandlerError, MessageHandler};

pub const USER_TASK_REGEX_QUEUE: &str = "user_task_regex_queue";
pub const USER_TASK_REGEX_EXCHANGE: &str = "user_task_regex_exchange";
pub const USER_TASK_REGEX_ROUTING_KEY: &str = "user_task_regex_routing_key";

/// TTL on the per-cohort run lock: long enough for the agent's call budget at
/// the per-call timeout, with headroom.
const RUN_LOCK_TTL_SECONDS: u64 = 30 * 60;

/// Same TTL as the regex cache in `regex.rs` — a generated regex lives as long as
/// any other.
const REGEX_CACHE_TTL_SECONDS: u64 = 7 * 24 * 60 * 60;

/// A request to generate one cohort's regex.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserTaskRegexRequest {
    pub project_id: Uuid,
    pub agent_hash: String,
    pub version_hash: String,
    pub has_history: bool,
}

/// Fire-and-forget publish; duplicates are absorbed by the idempotency check and
/// the run lock below.
pub async fn request_user_task_regex(
    queue: &MessageQueue,
    project_id: Uuid,
    agent_hash: &str,
    version_hash: &str,
    has_history: bool,
) {
    let request = UserTaskRegexRequest {
        project_id,
        agent_hash: agent_hash.to_string(),
        version_hash: version_hash.to_string(),
        has_history,
    };
    let payload = match serde_json::to_vec(&request) {
        Ok(payload) => payload,
        Err(e) => {
            log::error!("user-task: failed to serialize regex-agent request: {e:?}");
            return;
        }
    };
    if let Err(e) = queue
        .publish(
            &payload,
            USER_TASK_REGEX_EXCHANGE,
            USER_TASK_REGEX_ROUTING_KEY,
            None,
        )
        .await
    {
        log::warn!(
            "user-task: failed to publish regex-agent request for version {version_hash}: {e:?}"
        );
    }
}

pub struct UserTaskRegexHandler {
    pub cache: Arc<Cache>,
    pub llm_client: Arc<LlmClient>,
}

#[async_trait]
impl MessageHandler for UserTaskRegexHandler {
    type Message = UserTaskRegexRequest;

    async fn handle(&self, request: Self::Message) -> Result<(), HandlerError> {
        // Never reject-with-requeue: a broker retry loop would hammer a
        // persistently failing agent with no spacing. The accumulator's retry
        // interval is the spacing.
        if let Err(e) = self.process_request(&request).await {
            log::error!(
                "user-task: regex generation failed for version {} (agent {}): {e:?}; dropping — \
                 a later trace past the retry interval re-triggers",
                request.version_hash,
                request.agent_hash
            );
        }
        Ok(())
    }
}

impl UserTaskRegexHandler {
    fn regex_key(&self, request: &UserTaskRegexRequest) -> String {
        versioned_regex_cache_key(
            request.project_id,
            &request.agent_hash,
            &request.version_hash,
            request.has_history,
        )
    }

    fn lock_key(request: &UserTaskRegexRequest) -> String {
        let history = if request.has_history { "h" } else { "n" };
        format!(
            "{USER_TASK_REGEX_AGENT_LOCK_CACHE_KEY}:{}:{}:{}:{history}",
            request.project_id, request.agent_hash, request.version_hash
        )
    }

    async fn process_request(&self, request: &UserTaskRegexRequest) -> anyhow::Result<()> {
        let regex_key = self.regex_key(request);

        // Idempotency: several traces can demand the same cohort before the
        // first write lands.
        if self
            .cache
            .get::<String>(&regex_key)
            .await
            .ok()
            .flatten()
            .is_some()
        {
            log::debug!(
                "user-task: regex already generated for version {} — skipping",
                request.version_hash
            );
            return Ok(());
        }

        let lock_key = Self::lock_key(request);
        let acquired = self
            .cache
            .try_acquire_lock(&lock_key, RUN_LOCK_TTL_SECONDS)
            .await
            .unwrap_or_else(|e| {
                log::warn!("user-task: failed to acquire regex-agent lock {lock_key}: {e:?}");
                false
            });
        if !acquired {
            log::debug!(
                "user-task: regex generation already running for version {} — dropping duplicate",
                request.version_hash
            );
            return Ok(());
        }

        let result = self.run_locked(request, &regex_key).await;

        if let Err(e) = self.cache.release_lock(&lock_key).await {
            log::warn!("user-task: failed to release regex-agent lock {lock_key}: {e:?}");
        }
        result
    }

    /// Runs with the per-cohort lock held; the caller releases it on every path.
    async fn run_locked(
        &self,
        request: &UserTaskRegexRequest,
        regex_key: &str,
    ) -> anyhow::Result<()> {
        let cohort_key = cohort_cache_key(
            request.project_id,
            &request.agent_hash,
            &request.version_hash,
            request.has_history,
        );
        let samples = load_samples(&self.cache, &cohort_key).await;
        if samples.len() < 2 {
            // The accumulator expired, or the request raced its own trigger.
            log::debug!(
                "user-task: only {} sample(s) available for version {} — dropping",
                samples.len(),
                request.version_hash
            );
            return Ok(());
        }

        // A fresh internal trace per run. `trace_id` is nil: this run belongs to
        // a COHORT, not to any one trace — attributing it to the trace that
        // happened to trip the trigger would be misleading.
        let scope = SpanScope::new(request.project_id, Uuid::nil(), RunKind::VersionRegex);
        let root = SpanBuilder::root(&scope).build();
        self_tracing::set_attr_str(&root, "user_task.version_hash", &request.version_hash);
        self_tracing::set_attr_str(&root, "user_task.agent_hash", &request.agent_hash);
        self_tracing::set_metadata_bool(&root, "has_history", request.has_history);
        let scope = scope.with_parent(SpanContextCarrier::from_span(&root));

        let verdict = generate_extraction_regex_multi(&self.llm_client, &samples, &scope).await?;

        let pattern = match verdict {
            GenerationVerdict::Pattern(pattern) => pattern,
            // The model produced nothing matching every sample — not even the
            // passthrough, which it is free to submit when a cohort has no
            // scaffolding. Cache NOTHING rather than inventing a passthrough on
            // its behalf: where scaffolding IS present but no anchor was found,
            // that would pin every future trace's task to the full scaffolded
            // text, worse than the direct extraction it displaces. The
            // accumulator's `last_attempt_at` throttles the retry.
            GenerationVerdict::Exhausted => {
                self_tracing::set_metadata_bool(&root, "no_generalizing_pattern", true);
                log::info!(
                    "user-task: no generalizing pattern for version {} over {} samples — staying \
                     on the direct-extraction fallback",
                    request.version_hash,
                    samples.len()
                );
                return Ok(());
            }
        };

        self_tracing::set_output(&root, &serde_json::json!({ "regex": pattern }));
        self.cache
            .insert_with_ttl(regex_key, &pattern, REGEX_CACHE_TTL_SECONDS)
            .await
            .map_err(|e| anyhow::anyhow!("failed to cache user-task regex {regex_key}: {e:?}"))?;

        log::info!(
            "user-task: generated regex for version {} (agent {}, project {}, {} samples)",
            request.version_hash,
            request.agent_hash,
            request.project_id,
            samples.len()
        );
        Ok(())
    }
}
