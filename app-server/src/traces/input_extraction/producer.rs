//! Producer-side hook, called from `publish_span_messages`: candidate
//! capture, winner arbitration, inline cached-regex application,
//! enqueueing regex generation on cache miss, and the inline
//! trace-output / subagent extraction passes (LAM-1953).

use std::sync::Arc;

use uuid::Uuid;

use super::input::{HAS_HISTORY_FINGERPRINT_PREFIX, lock_user_sig, prepare_user_task_input};
use super::lock::{UserTaskLockState, lock_cache_key};
use super::metadata::build_metadata_patch;
use super::output::{OutputCandidate, process_trace_output_candidate};
use super::queue::{InputExtractionMessage, push_to_input_extraction_queue};
use super::regex::{regex_cache_key, try_apply_cached_regex};
use super::subagent::{
    locator_label, process_subagent_input_candidate, process_subagent_output_candidate,
    resolve_locator,
};
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
/// moved out of the queue message before the hook runs. Built when the
/// span carries an input candidate, an output candidate, or both.
pub struct UserTaskSpanContext {
    pub trace_id: Uuid,
    pub span_name: String,
    pub attributes: SpanAttributes,
    pub candidate: Option<UserTaskCandidate>,
    pub output_candidate: Option<OutputCandidate>,
    pub ids_path: Option<Vec<String>>,
    pub span_path: Option<Vec<String>>,
    pub start_time_ns: i64,
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

    // Depth is computed once up front (`span_depth` mutates the span
    // path), then contexts are sorted by span start time: pass 2's
    // per-locator registrations land in start order, and pass 3 runs
    // strictly after pass 2 so every subagent-output gate in this batch
    // sees every registration from this batch.
    let mut contexts: Vec<(UserTaskSpanContext, usize)> = candidates
        .into_iter()
        .map(|mut ctx| {
            let depth = span_depth(&mut ctx.attributes, &ctx.span_name);
            (ctx, depth)
        })
        .collect();
    contexts.sort_by_key(|(ctx, _)| ctx.start_time_ns);

    // Pass 1: main user-task inputs (LAM-1880 flow, unchanged).
    for (ctx, depth) in contexts.iter_mut() {
        let Some(candidate) = ctx.candidate.as_ref() else {
            continue;
        };
        let trace_id = ctx.trace_id;
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
            depth: *depth,
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
        let inline_result = try_apply_cached_regex(
            &cache,
            &regex_key,
            &candidate.signposted_text,
            project_id,
            trace_id,
        )
        .await;

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
                    prompt_hash: candidate.prompt_hash.clone(),
                    signposted_text: candidate.signposted_text.clone(),
                    fingerprint: candidate.fingerprint.clone(),
                    winner_state: Some(state.clone()),
                    subagent: None,
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

    // Pass 2: subagent inputs (LAM-1953). Runs after pass 1 so the main
    // winner lock — the descent anchor for locator resolution — reflects
    // this batch's own main-input winner.
    for (ctx, depth) in &contexts {
        let Some(candidate) = ctx.candidate.as_ref() else {
            continue;
        };
        // A history-bearing turn belongs to an ongoing main conversation;
        // subagents are isolated, so their first LLM call never carries
        // history. Gating here keeps main-agent follow-up turns out of
        // subagent slots.
        if candidate
            .fingerprint
            .starts_with(HAS_HISTORY_FINGERPRINT_PREFIX)
        {
            continue;
        }
        // Bare-OTel spans without `lmnr.span.ids_path` are invisible to
        // subagent extraction (accepted v0 degradation).
        let Some(ids) = ctx.ids_path.as_ref() else {
            continue;
        };
        let trace_id = ctx.trace_id;
        // Fresh main-lock read per candidate: its depth is the starting
        // gate for the descent walk. No main winner yet → this span is
        // (or ties with) the main agent, not a subagent.
        let main_lock: Option<UserTaskLockState> = cache
            .get(&lock_cache_key(project_id, trace_id))
            .await
            .ok()
            .flatten();
        let Some(main_lock) = main_lock else {
            continue;
        };
        let Some(locator) =
            resolve_locator(ids, *depth, main_lock.depth, project_id, trace_id, &cache).await
        else {
            continue;
        };
        let label = locator_label(ctx.span_path.as_deref().unwrap_or(&[]), locator.path_index);
        process_subagent_input_candidate(
            candidate,
            &locator,
            &label,
            *depth,
            trace_id,
            project_id,
            queue.clone(),
            db.clone(),
            cache.clone(),
        )
        .await;
    }

    // Pass 3: trace and subagent outputs (LAM-1953). Strictly after pass
    // 2 so subagent-output registration gates see every `st_in_lock`
    // written by this batch.
    for (ctx, depth) in &contexts {
        let Some(output_candidate) = ctx.output_candidate.as_ref() else {
            continue;
        };
        let trace_id = ctx.trace_id;
        process_trace_output_candidate(
            output_candidate,
            *depth,
            trace_id,
            project_id,
            queue.clone(),
            db.clone(),
            cache.clone(),
        )
        .await;

        let Some(ids) = ctx.ids_path.as_ref() else {
            continue;
        };
        let main_lock: Option<UserTaskLockState> = cache
            .get(&lock_cache_key(project_id, trace_id))
            .await
            .ok()
            .flatten();
        let Some(main_lock) = main_lock else {
            continue;
        };
        let Some(locator) =
            resolve_locator(ids, *depth, main_lock.depth, project_id, trace_id, &cache).await
        else {
            continue;
        };
        process_subagent_output_candidate(
            output_candidate,
            &locator,
            *depth,
            trace_id,
            project_id,
            queue.clone(),
            db.clone(),
            cache.clone(),
        )
        .await;
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
