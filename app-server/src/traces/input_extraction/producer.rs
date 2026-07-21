//! Producer-side hook, called from `publish_span_messages`: candidate
//! capture, roster-based winner arbitration, inline cached-regex
//! application, enqueueing regex generation on cache miss, and the
//! inline trace-output pass (LAM-1953).

use std::collections::HashMap;
use std::sync::Arc;

use uuid::Uuid;

use super::input::prepare_user_task_input;
use super::lock::{
    MAX_ARBITRATED_DEPTH, RosterEntry, UserTaskLockState, WinnerState, agent_io_ver,
    lock_cache_key, write_lock_merged,
};
use super::metadata::build_metadata_patch;
use super::output::{OutputCandidate, process_trace_output_candidate};
use super::queue::{InputExtractionMessage, push_to_input_extraction_queue};
use super::regex::{regex_cache_key, try_apply_cached_regex};
use crate::cache::{Cache, CacheTrait};
use crate::db::{DB, spans::Span};
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
}

/// Everything the producer hook needs from a candidate's span, copied or
/// moved out of the queue message before the hook runs. Built when the
/// span carries an input candidate, an output candidate, or both.
pub struct UserTaskSpanContext {
    pub trace_id: Uuid,
    pub span_id: Uuid,
    pub span_name: String,
    pub attributes: SpanAttributes,
    pub candidate: Option<UserTaskCandidate>,
    pub output_candidate: Option<OutputCandidate>,
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
    // Clamp at mint so arbitration and the CH ver see the same saturated
    // depth — raw depths past the ver's major-byte ceiling would let a
    // depth-255 candidate override a depth-256 winner it can only tie in
    // ClickHouse (see `MAX_ARBITRATED_DEPTH`).
    attributes
        .path()
        .map(|p| p.len())
        .unwrap_or(0)
        .min(MAX_ARBITRATED_DEPTH)
}

/// One trace's input candidate after stats collection, pointing back at
/// its context by index.
struct InputContender {
    ctx_idx: usize,
    state: WinnerState,
}

/// Producer-side extraction pipeline, run after the batch is published.
/// Pass 1 arbitrates user-task inputs per trace via the roster lock and
/// runs the effect (inline cached-regex apply, or enqueue for LLM regex
/// generation) for the strongest eligible candidate. Pass 2 processes
/// trace outputs. All failures are logged and swallowed — extraction
/// must never block or fail span ingestion.
pub async fn process_user_task_candidates(
    contexts: Vec<UserTaskSpanContext>,
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

    if contexts.is_empty() || !is_feature_enabled(Feature::InputExtraction) {
        return;
    }

    // Depth is computed once up front (`span_depth` mutates the span
    // path); contexts are sorted by start time so roster registration
    // order within the batch is deterministic.
    let mut contexts: Vec<(UserTaskSpanContext, usize)> = contexts
        .into_iter()
        .map(|mut ctx| {
            let depth = span_depth(&mut ctx.attributes, &ctx.span_name);
            (ctx, depth)
        })
        .collect();
    contexts.sort_by_key(|(ctx, _)| ctx.start_time_ns);

    // Pass 1: user-task inputs. Gated on `llm_client_available()` — this
    // is the only pass that can enqueue LLM-backed regex generation, and
    // without a client the extraction workers never spawn, so enqueueing
    // would strand messages. Pass 2 (trace outputs) is fully inline with
    // no LLM/queue and deliberately runs regardless.
    // Collect per-trace contenders first (usage lookup needs &mut
    // attributes), then arbitrate one trace at a time — registering EVERY
    // batch candidate in the roster but attempting the effect only for
    // the strongest, so a small trace arriving in one batch publishes
    // once instead of once per ascending-token span.
    let inputs_enabled = llm_client_available();
    let mut contenders: HashMap<Uuid, Vec<InputContender>> = HashMap::new();
    for (idx, (ctx, depth)) in contexts.iter_mut().enumerate() {
        if !inputs_enabled || ctx.candidate.is_none() {
            continue;
        }
        let usage = get_llm_usage_for_span(
            &mut ctx.attributes,
            db.clone(),
            cache.clone(),
            &ctx.span_name,
            &project_id,
        )
        .await;
        // Non-cached input tokens: cache-read-heavy calls are later
        // same-conversation turns replaying context; fresh first calls
        // read no cache. (Tokens, not cost — cost is zero whenever the
        // model doesn't resolve in the pricing tables.)
        let state = WinnerState {
            depth: *depth,
            input_tokens: usage.input_tokens - usage.cache_read_input_tokens,
            start_time_ns: ctx.start_time_ns,
            span_id: ctx.span_id.simple().to_string(),
        };
        contenders
            .entry(ctx.trace_id)
            .or_default()
            .push(InputContender {
                ctx_idx: idx,
                state,
            });
    }

    for (trace_id, trace_contenders) in contenders {
        process_trace_inputs(
            trace_id,
            trace_contenders,
            &contexts,
            project_id,
            queue.clone(),
            db.clone(),
            cache.clone(),
        )
        .await;
    }

    // Pass 2: trace outputs. Pre-arbitrate within the batch (shallowest
    // depth, then latest end time) so one trace publishes at most one
    // output per batch; the lock gate arbitrates across batches.
    let mut best_outputs: HashMap<Uuid, (usize, i64, &OutputCandidate)> = HashMap::new();
    for (ctx, depth) in &contexts {
        let Some(output_candidate) = ctx.output_candidate.as_ref() else {
            continue;
        };
        let entry = best_outputs.entry(ctx.trace_id).or_insert((
            *depth,
            output_candidate.end_time_ns,
            output_candidate,
        ));
        if *depth < entry.0 || (*depth == entry.0 && output_candidate.end_time_ns > entry.1) {
            *entry = (*depth, output_candidate.end_time_ns, output_candidate);
        }
    }
    for (ctx, _) in &contexts {
        let Some((depth, _, candidate)) = best_outputs.remove(&ctx.trace_id) else {
            continue;
        };
        process_trace_output_candidate(
            candidate,
            depth,
            ctx.trace_id,
            project_id,
            queue.clone(),
            db.clone(),
            cache.clone(),
        )
        .await;
    }
}

/// Roster arbitration + effect for one trace's batch contenders.
///
/// Protocol: read the lock (absent → fresh at the batch's shallowest
/// depth; a strictly shallower batch resets it — the previous depth's
/// roster and winner were subagent-level); register every contender at
/// the lock's depth (the roster keeps the [`super::lock::ROSTER_CAP`]
/// earliest starters); the strongest eligible contender challenges the
/// published winner and runs the effect only when it strictly beats it.
/// The window only gates candidates once a winner is PUBLISHED — with no
/// winner yet (first batch, or every earlier effect failed) even
/// out-of-window spans stay eligible, so persisted roster registrations
/// can never seal the trace with nothing written for the lock TTL. The
/// lock is written back merge-guarded regardless of publish; the winner
/// field moves only after the effect lands.
async fn process_trace_inputs(
    trace_id: Uuid,
    trace_contenders: Vec<InputContender>,
    contexts: &[(UserTaskSpanContext, usize)],
    project_id: Uuid,
    queue: Arc<MessageQueue>,
    db: Arc<DB>,
    cache: Arc<Cache>,
) {
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

    let batch_min_depth = trace_contenders
        .iter()
        .map(|c| c.state.depth)
        .min()
        .unwrap_or(usize::MAX);
    // A strictly shallower batch resets depth + roster (the previous
    // roster was subagent-level) but CARRIES the published winner: the
    // winner axis is independent of lock depth (`merge_from` keeps the
    // stronger winner across depths too), so candidates keep challenging
    // whatever value actually owns `lmnr_user_task` — forgetting it here
    // would let a weaker candidate publish a redundant overwrite.
    let mut lock = match current {
        Some(l) if l.depth <= batch_min_depth => l,
        Some(l) => UserTaskLockState {
            winner: l.winner,
            ..UserTaskLockState::new(batch_min_depth)
        },
        None => UserTaskLockState::new(batch_min_depth),
    };

    // Register every contender at the lock's depth FIRST, then derive
    // eligibility from the FINAL roster — `register`'s return value is a
    // point-in-time verdict and a later same-start registration can
    // evict an earlier-accepted span (equal `start_time_ns` ties break
    // on span id), so snapshotting eligibility inside the loop could
    // publish a winner that isn't in the persisted window.
    //
    // The window and depth gates exist to stop late/deep spans from
    // OVERRIDING an already-published value — while `winner` is still
    // None (first batch, or every earlier effect failed) NEITHER gates:
    // publishing something beats sealing the trace with nothing for the
    // whole lock TTL. The depth bypass matters when a shallow batch's
    // effect failed and every later batch carries only deeper (subagent)
    // candidates — gating those out would leave `lmnr_user_task` unset
    // forever, where the pre-roster design published the deeper value
    // and let a later shallower span override it. `beats` is depth-major,
    // so shallow candidates still always win whenever they're present,
    // and a deeper published winner stays overridable by any shallower
    // span (`supersedes` never drops a shallower snapshot on it).
    let no_winner_yet = lock.winner.is_none();
    for contender in &trace_contenders {
        if contender.state.depth != lock.depth {
            continue;
        }
        lock.register(RosterEntry {
            start_time_ns: contender.state.start_time_ns,
            span_id: contender.state.span_id.clone(),
        });
    }
    let eligible = trace_contenders.iter().filter(|c| {
        if no_winner_yet {
            return true;
        }
        c.state.depth == lock.depth && lock.roster.iter().any(|e| e.span_id == c.state.span_id)
    });

    let challenger = eligible.reduce(|best, c| if c.state.beats(&best.state) { c } else { best });

    if let Some(challenger) = challenger
        && lock
            .winner
            .as_ref()
            .is_none_or(|w| challenger.state.beats(w))
    {
        let state = challenger.state.clone();
        let (ctx, _) = &contexts[challenger.ctx_idx];
        let candidate = ctx.candidate.as_ref().expect("contender has a candidate");

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
            // write) can complete inside the window since the gate read
            // above (one regex-cache round-trip), and publishing anyway
            // would overwrite the newer winner's metadata.
            let rechecked: Option<UserTaskLockState> = cache.get(&lock_key).await.ok().flatten();
            if rechecked.is_some_and(|c| c.supersedes(&state)) {
                log::debug!(
                    "user-task: dropping superseded inline extraction for trace [{trace_id}]"
                );
                write_lock_merged(&cache, &lock_key, &lock, trace_id).await;
                return;
            }
        }

        // Whether the candidate's effect (metadata publish on cache hit,
        // extraction enqueue on miss) actually landed. The winner field
        // moves only on success — moving it eagerly would gate retries
        // for the whole lock TTL after a swallowed failure, possibly
        // never writing `lmnr_user_task` at all.
        let effect_landed = match inline_result {
            Some(result) => {
                let patch = build_metadata_patch(&result);
                // RMT version for the trace_agent_input row: non-cached
                // input tokens under the inverted-depth major, mirroring
                // the lock's arbitration order.
                let ver = agent_io_ver(state.depth, state.input_tokens);
                match publish_trace_metadata_patch(
                    trace_id,
                    project_id,
                    patch,
                    Some(ver),
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
            lock.winner = Some(state);
        }
    }

    write_lock_merged(&cache, &lock_key, &lock, trace_id).await;
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
        // Absurdly deep paths clamp to the ver's depth ceiling so
        // arbitration never sees depths the CH version can't distinguish.
        let deep_path: Vec<String> = (0..300).map(|i| format!("s{i}")).collect();
        let mut attrs = SpanAttributes::new(HashMap::from([(
            SPAN_PATH.to_string(),
            serde_json::to_value(&deep_path).unwrap(),
        )]));
        assert_eq!(span_depth(&mut attrs, "s299"), MAX_ARBITRATED_DEPTH);
    }
}
