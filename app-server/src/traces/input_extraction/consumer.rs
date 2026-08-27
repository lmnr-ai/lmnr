//! Queue consumer for ingestion-time user-task extraction.
//!
//! Handles regex-cache misses enqueued by the producer hook. Resolution ladder:
//!
//!   1. resolve the prompt's version — the producer's inline verdict, else the
//!      memo, else the `system_prompt_versions` row for the winning span;
//!   2. a cached regex for that version → apply it;
//!   3. no regex yet → record the user text as a cohort sample (triggering the
//!      multi-sample agent once the cohort fills) and extract directly with one
//!      LLM call;
//!   4. no version at all → extract directly, nothing cached.
//!
//! Spans with no system message never get a version and keep the legacy
//! agent-hash + tag-fingerprint keying with its single-sample regex generation.
//!
//! Acks only after the metadata publish succeeds (ack-after-write).

use std::sync::Arc;

use async_trait::async_trait;

use super::accumulator::{cohort_cache_key, record_sample};
use super::extract::extract_user_task_directly;
use super::lock::{UserTaskLockState, lock_cache_key, write_lock_merged};
use super::metadata::extraction_outcome_value;
use super::queue::InputExtractionMessage;
use super::regex::{
    ApplyRegexResult, RegexTarget, Resolution, generate_and_apply_regex, is_passthrough_regex,
    record_resolution, regex_target, try_apply_cached_regex,
};
use super::regex_agent::request_user_task_regex;
use super::self_tracing::{self, RunKind, SpanBuilder, SpanContextCarrier, SpanScope};
use crate::{
    cache::{Cache, CacheTrait},
    db::DB,
    llm::LlmClient,
    mq::{MessageQueue, stream::StreamPublisher},
    traces::metadata::publish_trace_input_update,
    traces::sp_versioning::versions,
    worker::{HandlerError, MessageHandler},
};

pub struct InputExtractionHandler {
    pub db: Arc<DB>,
    pub cache: Arc<Cache>,
    pub queue: Arc<MessageQueue>,
    pub clickhouse: clickhouse::Client,
    pub llm_client: Arc<LlmClient>,
    pub spans_stream_publisher: Option<Arc<StreamPublisher>>,
}

#[async_trait]
impl MessageHandler for InputExtractionHandler {
    type Message = InputExtractionMessage;

    async fn handle(&self, message: Self::Message) -> Result<(), HandlerError> {
        let version_hash = self.resolve_version(&message).await;
        let target = regex_target(
            message.project_id,
            message.prompt_hash.as_deref(),
            version_hash.as_deref(),
            &message.fingerprint,
            message.has_history,
        );

        // Another worker may have populated the cache since this message was
        // enqueued, on any keying — a hit is pure regex application and emits no
        // self-tracing.
        let cached = match &target {
            RegexTarget::Keyed { key, .. } => {
                try_apply_cached_regex(
                    &self.cache,
                    key,
                    &message.signposted_text,
                    message.project_id,
                    message.trace_id,
                )
                .await
            }
            RegexTarget::Unversioned => None,
        };

        let result = match cached {
            Some(result) => {
                // Recorded only for the versioned pipeline: the legacy keying
                // serves prompts that can never have a version, so counting its
                // hits would inflate the denominator of the fallback-rate metric.
                if let RegexTarget::Keyed {
                    version: Some(version),
                    ..
                } = &target
                {
                    record_resolution(
                        Resolution::Cached,
                        message.project_id,
                        message.trace_id,
                        Some(version),
                        message.has_history,
                    );
                }
                // Superseded check runs AFTER a cache hit: applying a cached
                // regex costs nothing worth reordering for.
                if self.superseded(&message).await {
                    return Ok(());
                }
                result
            }
            None => match self
                .resolve_uncached(&message, &target, version_hash.as_deref())
                .await
            {
                Some(result) => result,
                None => return Ok(()),
            },
        };

        let value = extraction_outcome_value(&result);
        publish_trace_input_update(
            message.trace_id,
            message.project_id,
            value,
            message.rollout_session_id.clone(),
            self.queue.clone(),
            self.db.clone(),
            self.cache.clone(),
            self.spans_stream_publisher.clone(),
        )
        .await
        .map_err(HandlerError::transient)?;

        // Re-assert the lock for the state whose extraction just published:
        // record its text as published and re-register it as its agent's
        // representative, retrying the producer lock write that may have failed
        // after the enqueue. `write_lock_merged` re-reads and folds, so a
        // genuinely newer map written while this message was in flight keeps its
        // own earliest-per-agent entries. Best-effort.
        if let Some(snapshot) = &message.winner_state {
            let lock_key = lock_cache_key(message.project_id, message.trace_id);
            let mut local = UserTaskLockState::default();
            local.register(snapshot.clone());
            local.published = Some(snapshot.content_hash.clone());
            write_lock_merged(&self.cache, &lock_key, &local, message.trace_id).await;
        }

        Ok(())
    }
}

impl InputExtractionHandler {
    /// The prompt's version: the producer's inline verdict when it had one, else
    /// the memo (filled by the classifier, which consumes a message published one
    /// line before this one — so it has usually landed by now), else the
    /// `system_prompt_versions` row for the winning span, which covers memo
    /// expiry.
    async fn resolve_version(&self, message: &InputExtractionMessage) -> Option<String> {
        if let Some(version) = &message.version_hash {
            return Some(version.clone());
        }
        let full_prompt_hash = message.full_prompt_hash.as_deref()?;
        if let Some(version) =
            versions::memo_get(&self.cache, message.project_id, full_prompt_hash).await
        {
            return Some(version);
        }
        let span_id = message.span_id?;
        crate::ch::system_prompt_versions::fetch_span_version(
            &self.clickhouse,
            message.project_id,
            message.trace_id,
            span_id,
        )
        .await
        .unwrap_or_else(|e| {
            log::warn!("user-task: span version lookup failed for span {span_id}: {e:?}");
            None
        })
    }

    /// Whether a later batch superseded this candidate (published its own
    /// metadata inline and rewrote the winner lock) while this message sat in the
    /// queue. The check is order-aware (`supersedes`), not bare inequality: the
    /// producer writes the lock only after the enqueue lands, so a failed lock
    /// write can leave an OLDER state behind — a lock this snapshot can override
    /// must not drop it. Absent lock or cache error fails open: a redundant
    /// publish beats a missing one.
    async fn superseded(&self, message: &InputExtractionMessage) -> bool {
        let Some(snapshot) = &message.winner_state else {
            return false;
        };
        let lock_key = lock_cache_key(message.project_id, message.trace_id);
        let superseded = matches!(
            self.cache.get::<UserTaskLockState>(&lock_key).await,
            Ok(Some(current)) if current.supersedes(snapshot)
        );
        if superseded {
            log::debug!(
                "user-task: dropping superseded extraction for trace [{}]",
                message.trace_id
            );
        }
        superseded
    }

    /// Everything past a cache miss. `None` means publish nothing — either the
    /// candidate was superseded, or the extraction call failed outright (an absent
    /// `lmnr_user_task` means "never ran"; an empty string would claim the message
    /// carried no user request).
    async fn resolve_uncached(
        &self,
        message: &InputExtractionMessage,
        target: &RegexTarget,
        version_hash: Option<&str>,
    ) -> Option<ApplyRegexResult> {
        // A cohort exists only when the prompt HAS a version — that is what the
        // regex is keyed on, so it is also what samples accumulate under.
        let cohort = match (target, message.prompt_hash.as_deref(), version_hash) {
            (
                RegexTarget::Keyed {
                    version: Some(_), ..
                },
                Some(agent_hash),
                Some(version),
            ) => Some((agent_hash, version)),
            _ => None,
        };

        if let Some((agent_hash, version)) = cohort {
            // Cohort-level, so it is recorded even for a candidate this trace
            // will drop as superseded: the sample is valid for the cohort either
            // way and needs no LLM call to produce.
            self.record_cohort_sample(message, agent_hash, version)
                .await;
        }

        // The legacy path generates and CACHES a regex keyed by user-message
        // shape, so its work outlives this candidate and the supersession check
        // stays after it. A direct extraction caches nothing, so a superseded
        // candidate's call is pure waste — check first.
        let legacy_generation = matches!(target, RegexTarget::Keyed { version: None, .. });
        if !legacy_generation && self.superseded(message).await {
            return None;
        }

        if legacy_generation {
            let RegexTarget::Keyed { key, .. } = target else {
                unreachable!("legacy_generation implies a keyed target")
            };
            let result = self.run_legacy_generation(message, key).await;
            return if self.superseded(message).await {
                None
            } else {
                Some(result)
            };
        }

        record_resolution(
            if cohort.is_some() {
                Resolution::Fallback
            } else {
                Resolution::NoVersion
            },
            message.project_id,
            message.trace_id,
            version_hash,
            message.has_history,
        );

        let scope = SpanScope::new(
            message.project_id,
            message.trace_id,
            RunKind::DirectExtraction,
        );
        let root = SpanBuilder::root(&scope)
            .input(&serde_json::Value::String(message.signposted_text.clone()))
            .build();
        if let Some(version) = version_hash {
            self_tracing::set_attr_str(&root, "user_task.version_hash", version);
        }
        let scope = scope.with_parent(SpanContextCarrier::from_span(&root));

        let result =
            extract_user_task_directly(&self.llm_client, &message.signposted_text, &scope).await;
        match &result {
            Some(result) => {
                self_tracing::set_output(&root, &serde_json::json!(format!("{result:?}")))
            }
            None => self_tracing::set_metadata_bool(&root, "llm_failed", true),
        }
        result
    }

    /// Append this trace's user text to the cohort's samples and, when that fills
    /// the cohort, ask the agent worker for a regex.
    async fn record_cohort_sample(
        &self,
        message: &InputExtractionMessage,
        agent_hash: &str,
        version_hash: &str,
    ) {
        let target_samples = crate::env::static_sp::INPUT_SAMPLES.get().max(2);
        let cohort_key = cohort_cache_key(
            message.project_id,
            agent_hash,
            version_hash,
            message.has_history,
        );
        let ready = record_sample(
            &self.cache,
            &cohort_key,
            &message.signposted_text,
            target_samples,
        )
        .await;
        if ready {
            request_user_task_regex(
                &self.queue,
                message.project_id,
                agent_hash,
                version_hash,
                message.has_history,
            )
            .await;
        }
    }

    /// The pre-versioning path, unchanged: generate a regex from this one sample
    /// and cache it under the user-message-shape key. Still the permanent path for
    /// LLM spans with no system message, which can never have a version.
    async fn run_legacy_generation(
        &self,
        message: &InputExtractionMessage,
        key: &str,
    ) -> ApplyRegexResult {
        let scope = SpanScope::new(
            message.project_id,
            message.trace_id,
            RunKind::LegacyFingerprint,
        );
        let root = SpanBuilder::root(&scope)
            .input(&serde_json::Value::String(message.signposted_text.clone()))
            .build();
        self_tracing::set_attr_str(&root, "user_task.fingerprint", &message.fingerprint);
        if let Some(hash) = message.prompt_hash.as_deref() {
            self_tracing::set_attr_str(&root, "user_task.prompt_hash", hash);
        }
        let scope = scope.with_parent(SpanContextCarrier::from_span(&root));

        let outcome = generate_and_apply_regex(
            &self.cache,
            &self.llm_client,
            key,
            &message.signposted_text,
            &scope,
        )
        .await;

        self_tracing::set_metadata_bool(
            &root,
            "passthrough_regex",
            is_passthrough_regex(&outcome.pattern),
        );
        // "Failed": the generated pattern failed to compile / match / capture.
        self_tracing::set_metadata_bool(
            &root,
            "regex_failed",
            matches!(outcome.result, ApplyRegexResult::NoMatch),
        );
        // Call budget ran out without an accepted submit; the result came from
        // the passthrough fallback.
        self_tracing::set_metadata_bool(&root, "budget_exhausted", outcome.budget_exhausted);
        // LLM generation failed (retries exhausted / non-retryable error); the
        // result came from the passthrough fallback.
        self_tracing::set_metadata_bool(&root, "llm_failed", outcome.llm_failed);
        let result = outcome.result;
        self_tracing::set_output(&root, &serde_json::json!(format!("{result:?}")));
        result
    }
}
