//! Producer-side hook, called from `publish_span_messages`: candidate
//! capture, winner arbitration, inline cached-regex application, and
//! enqueueing regex generation on cache miss.

use std::sync::Arc;

use tracing::instrument;
use uuid::Uuid;

use super::input::{lock_user_sig, prepare_user_task_input};
use super::lock::{UserTaskLockState, lock_cache_key};
use super::metadata::build_metadata_patch;
use super::queue::{InputExtractionMessage, push_to_input_extraction_queue};
use super::regex::{regex_cache_key, try_apply_cached_regex};
use crate::cache::{Cache, CacheTrait};
use crate::db::{DB, spans::Span};
use crate::env::user_task::USER_TASK_LOCK_TTL_SECONDS;
use crate::features::{Feature, is_feature_enabled};
use crate::llm::llm_client_available;
use crate::mq::MessageQueue;
use crate::traces::metadata::publish_trace_metadata_patch;
use crate::traces::span_attributes::SPAN_PROMPT_HASH;
use crate::traces::spans::SpanAttributes;
use crate::traces::utils::get_llm_usage_for_span;

/// Per-span candidate captured inside `preprocess_for_queue`, BEFORE the
/// dedup strip removes `span.input` — the only point where the full
/// input is guaranteed present.
#[derive(Debug, Clone)]
pub struct UserTaskCandidate {
    pub signposted_text: String,
    pub fingerprint: String,
    pub prompt_hash: Option<String>,
    pub start_time_ns: i64,
}

/// Everything the producer hook needs from a candidate's span, copied or
/// moved out of the queue message before the hook runs.
pub struct UserTaskSpanContext {
    pub trace_id: Uuid,
    pub span_name: String,
    pub attributes: SpanAttributes,
    pub candidate: UserTaskCandidate,
}

pub fn capture_user_task_candidate(span: &Span) -> Option<UserTaskCandidate> {
    if !span.is_llm_span() {
        return None;
    }
    let prepared = prepare_user_task_input(span.input.as_ref()?)?;
    let prompt_hash = span
        .attributes
        .raw_attributes
        .get(SPAN_PROMPT_HASH)
        .and_then(|v| v.as_str())
        .map(str::to_string);
    Some(UserTaskCandidate {
        signposted_text: prepared.signposted_text,
        fingerprint: prepared.fingerprint,
        prompt_hash,
        // Out-of-range timestamps degrade to "never wins on the time
        // axis", same as the legacy lock default.
        start_time_ns: span.start_time.timestamp_nanos_opt().unwrap_or(i64::MAX),
    })
}

/// Depth as the ingest pipeline will record it. This hook runs BEFORE the
/// consumer's `prepare_span_for_recording` extends `lmnr.span.path` with
/// the span's own name, and only auto-instrumented spans lack that final
/// segment — so comparing raw lengths would let an auto-instrumented
/// subagent span (true depth N+1, raw length N) tie with an SDK-created
/// main-agent span (depth N) and hold the winner lock against it. Run the
/// same extension here for exact parity; extending is idempotent and the
/// consumer re-derives the path on its own copy.
fn span_depth(attributes: &mut SpanAttributes, span_name: &str) -> usize {
    attributes.extend_span_path(span_name);
    attributes.path().map(|p| p.len()).unwrap_or(0)
}

/// Producer-side user-task pipeline, run after the batch is published.
/// Per candidate: winner-state gate (per-trace idempotency), cached-regex
/// application on hit, enqueue for LLM regex generation on miss. All
/// failures are logged and swallowed — user-task extraction must never
/// block or fail span ingestion.
#[instrument(skip_all)]
pub async fn process_user_task_candidates(
    candidates: Vec<UserTaskSpanContext>,
    project_id: Uuid,
    queue: Arc<MessageQueue>,
    db: Arc<DB>,
    cache: Arc<Cache>,
) {
    // Do not run on self-tracing project to avoid infinite looping
    if std::env::var(crate::env::user_task::USER_TASK_INTERNAL_PROJECT_ID)
        .is_ok_and(|internal_project_id_str| internal_project_id_str == project_id.to_string())
    {
        return;
    }

    #[cfg(feature = "signals")]
    if std::env::var(crate::env::private::signals::INTERNAL_PROJECT_ID)
        .is_ok_and(|internal_project_id_str| internal_project_id_str == project_id.to_string())
    {
        return;
    }

    if candidates.is_empty()
        || !is_feature_enabled(Feature::InputExtraction)
        || !llm_client_available()
    {
        return;
    }

    for mut ctx in candidates {
        let trace_id = ctx.trace_id;
        let candidate = ctx.candidate;
        let depth = span_depth(&mut ctx.attributes, &ctx.span_name);
        let usage = get_llm_usage_for_span(
            &mut ctx.attributes,
            db.clone(),
            cache.clone(),
            &ctx.span_name,
            &project_id,
        )
        .await;

        // `user_sig` strips the `has_history|` prefix: the prefix forks the
        // regex cache key, but turn 1 and turn 2 of the same conversation
        // must share a sig or the equal-depth override rule would block
        // every follow-up turn from reclaiming the lock.
        let state = UserTaskLockState {
            input_cost: usage.input_cost,
            depth,
            user_sig: lock_user_sig(&candidate.fingerprint).to_string(),
            start_time_ns: candidate.start_time_ns,
        };

        let lock_key = lock_cache_key(project_id, trace_id);
        // Fail open on cache errors: treat as first-seen so a cache blip
        // degrades to a redundant extraction, not a missing one.
        let current: Option<UserTaskLockState> = match cache.get(&lock_key).await {
            Ok(v) => v,
            Err(e) => {
                log::error!("user-task: lock state read failed for trace [{trace_id}]: {e:?}");
                None
            }
        };
        if current.is_some_and(|c| !c.should_override(&state)) {
            continue;
        }

        let regex_key = regex_cache_key(
            project_id,
            candidate.prompt_hash.as_deref(),
            &candidate.fingerprint,
        );
        let inline_result =
            try_apply_cached_regex(&cache, &regex_key, &candidate.signposted_text).await;

        if inline_result.is_some() {
            // Re-read the winner lock before the inline publish: a
            // concurrent batch's FULL cycle (gate read, publish, lock
            // write) can complete inside the window since the gate
            // read above (one regex-cache round-trip), and publishing
            // anyway would overwrite the newer winner's metadata.
            let rechecked: Option<UserTaskLockState> = cache.get(&lock_key).await.ok().flatten();
            if rechecked.is_some_and(|c| c.supersedes(&state)) {
                log::debug!(
                    "user-task: dropping superseded inline extraction for trace [{trace_id}]"
                );
                continue;
            }
        }

        // Whether the candidate's effect (metadata publish on cache hit,
        // extraction enqueue on miss) actually landed. The winner lock is
        // written only on success — writing it
        // eagerly would leave a stale winner after a swallowed failure,
        // gating equal-or-lower-cost retries for the whole lock TTL and
        // possibly never writing `lmnr_user_task` at all.
        let effect_landed = match inline_result {
            Some(result) => {
                let patch = build_metadata_patch(&result);
                match publish_trace_metadata_patch(
                    trace_id,
                    project_id,
                    patch,
                    queue.clone(),
                    db.clone(),
                    cache.clone(),
                )
                .await
                {
                    Ok(()) => true,
                    Err(e) => {
                        log::error!(
                            "user-task: failed to publish metadata patch for trace [{trace_id}]: {e:?}"
                        );
                        false
                    }
                }
            }
            None => {
                let message = InputExtractionMessage {
                    trace_id,
                    project_id,
                    prompt_hash: candidate.prompt_hash,
                    signposted_text: candidate.signposted_text,
                    fingerprint: candidate.fingerprint,
                    winner_state: Some(state.clone()),
                };
                match push_to_input_extraction_queue(message, queue.clone()).await {
                    Ok(enqueued) => enqueued,
                    Err(e) => {
                        log::error!(
                            "user-task: failed to enqueue extraction for trace [{trace_id}]: {e:?}"
                        );
                        false
                    }
                }
            }
        };

        if effect_landed {
            // Guarded re-read before the write (mirrors the consumer's
            // re-assert): a newer winner can take the lock while this
            // candidate awaits the publish/enqueue, and blindly
            // writing would roll the lock back to this older state — the
            // queued consumer's supersession check would then match the
            // stale snapshot and publish over the newer winner's metadata.
            let current: Option<UserTaskLockState> = cache.get(&lock_key).await.ok().flatten();
            if !current.is_some_and(|c| c.supersedes(&state))
                && let Err(e) = cache
                    .insert_with_ttl(&lock_key, &state, USER_TASK_LOCK_TTL_SECONDS.get())
                    .await
            {
                log::error!("user-task: lock state write failed for trace [{trace_id}]: {e:?}");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::traces::span_attributes::SPAN_PATH;
    use serde_json::json;
    use std::collections::HashMap;

    #[test]
    fn span_depth_matches_ingest_extended_path() {
        // Auto-instrumented span: path lacks its own name — the extension
        // appends it, so depth matches what ingest records.
        let mut attrs = SpanAttributes::new(HashMap::from([(
            SPAN_PATH.to_string(),
            json!(["agent", "subagent"]),
        )]));
        assert_eq!(span_depth(&mut attrs, "llm_call"), 3);
        // SDK span whose path already ends with its own name: idempotent.
        let mut attrs = SpanAttributes::new(HashMap::from([(
            SPAN_PATH.to_string(),
            json!(["agent", "llm_call"]),
        )]));
        assert_eq!(span_depth(&mut attrs, "llm_call"), 2);
        // Missing path attribute: seeded as a 1-element array.
        let mut attrs = SpanAttributes::new(HashMap::new());
        assert_eq!(span_depth(&mut attrs, "llm_call"), 1);
    }
}
