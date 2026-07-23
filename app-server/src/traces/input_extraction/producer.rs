//! Producer-side hook, called from `publish_span_messages`: candidate
//! capture, roster-based winner arbitration, inline cached-regex
//! application, enqueueing regex generation on cache miss, and the
//! inline trace-output pass (LAM-1953).
//!
//! **Arbitration assumes the effect (metadata publish / queue enqueue)
//! does not partially fail.** It's best-effort — errors are logged and
//! swallowed — but the design does not try to recover a trace from a
//! publish that failed mid-way: a swallowed failure just means that
//! trace's `lmnr_user_task` is (rarely) missing, not that a weaker
//! candidate must later heal it. This is what lets arbitration stay
//! simple — a shallower span ALWAYS wins by resetting `lock.depth`, and
//! once a legit span is seen at some depth no deeper span can own the
//! task (no "deeper interim winner" recovery path). If both stores fail
//! the whole flush fails and Rabbit redelivers.

use std::collections::HashMap;
use std::sync::Arc;

use uuid::Uuid;

use super::input::prepare_user_task_input;
use super::lock::{
    RosterEntry, UserTaskLockState, WinnerState, lock_cache_key, main_agent_path_cache_key,
    roster_span_key, write_lock_merged, write_main_agent_path,
};
use super::metadata::extraction_outcome_value;
use super::output::{OutputCandidate, process_trace_output_candidate};
use super::queue::{InputExtractionMessage, push_to_input_extraction_queue};
use super::regex::{regex_cache_key, try_apply_cached_regex};
use crate::cache::{Cache, CacheTrait};
use crate::db::{DB, spans::Span};
use crate::features::{Feature, is_feature_enabled};
use crate::llm::llm_client_available;
use crate::mq::MessageQueue;
use crate::traces::metadata::publish_trace_input_update;
use crate::traces::span_attributes::SPAN_PROMPT_HASH;
use crate::traces::spans::SpanAttributes;
use crate::traces::utils::get_llm_usage_for_span;

/// Per-span input candidate captured inside `preprocess_for_queue`,
/// BEFORE the dedup strip removes `span.input` — the only point where the
/// full input is guaranteed present.
#[derive(Debug, Clone)]
pub struct UserTaskCandidate {
    pub signposted_text: String,
    pub fingerprint: String,
    pub prompt_hash: Option<String>,
    /// Full hash of the joined last-turn user parts; gates re-extraction
    /// when a stronger challenger carries identical content.
    pub content_hash: String,
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
        content_hash: prepared.content_hash,
    })
}

/// One trace's input candidate after stats collection: owns the candidate
/// (moved out of its context) plus the arbitration state derived from it.
/// `path` is the candidate span's own full name-path — needed to derive the
/// main-agent path prefix cached for trace-output matching once this
/// candidate wins (see `super::lock::main_agent_path_cache_key`).
struct InputContender {
    candidate: UserTaskCandidate,
    state: WinnerState,
    path: Vec<String>,
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

    // Path is computed once up front. `extend_span_path` runs BEFORE the
    // consumer's `prepare_span_for_recording` does the same, so depth here
    // matches what ingest records (an auto-instrumented span otherwise
    // lacks its own trailing segment and would tie one level shallower than
    // it should). Contexts are sorted by start time so roster registration
    // order within the batch is deterministic.
    let mut contexts: Vec<(UserTaskSpanContext, Vec<String>)> = contexts
        .into_iter()
        .map(|mut ctx| {
            ctx.attributes.extend_span_path(&ctx.span_name);
            let path = ctx.attributes.path().unwrap_or_default();
            (ctx, path)
        })
        .collect();
    contexts.sort_by_key(|(ctx, _)| ctx.start_time_ns);

    // Pass 1: user-task inputs. Winner/roster arbitration and main-agent
    // path caching run UNCONDITIONALLY — depth + token comparison needs no
    // LLM, and Pass 2 (trace outputs) depends on the path this pass
    // establishes. Only the extraction EFFECT (publishing `lmnr_user_task`
    // via a cached-regex apply, or enqueueing LLM-backed regex generation
    // on a cache miss) is gated on `llm_client_available()` inside
    // `process_trace_inputs`.
    let mut contenders: HashMap<Uuid, Vec<InputContender>> = HashMap::new();
    for (ctx, path) in contexts.iter_mut() {
        // Move the candidate out of the context — Pass 2 (outputs) only
        // reads `output_candidate`, so the input candidate can be owned
        // here, which drops the index-into-`contexts` indirection and the
        // re-unwrap it forced.
        let Some(candidate) = ctx.candidate.take() else {
            continue;
        };
        let content_hash = candidate.content_hash.clone();
        let usage = get_llm_usage_for_span(
            &mut ctx.attributes,
            db.clone(),
            cache.clone(),
            &ctx.span_name,
            &project_id,
        )
        .await;
        // Total input tokens (cached + uncached). The real main-agent span
        // carries a large context; small helper spans (title/routing) carry
        // little. Subtracting cache-read was tried and reverted: it penalized
        // the true first span — its system prompt is often cache-read from
        // prior conversations, while tiny helper spans have too few tokens to
        // cache at all (providers need ~1024+), so uncached-tokens ranked the
        // helper above the main agent. (Tokens, not cost — cost is zero when
        // the model doesn't resolve in the pricing tables.)
        let state = WinnerState {
            depth: path.len(),
            input_tokens: usage.input_tokens,
            start_time_ns: ctx.start_time_ns,
            span_id: roster_span_key(ctx.span_id),
            content_hash,
        };
        contenders
            .entry(ctx.trace_id)
            .or_default()
            .push(InputContender {
                candidate,
                state,
                path: path.clone(),
            });
    }

    for (trace_id, trace_contenders) in contenders {
        process_trace_inputs(
            trace_id,
            trace_contenders,
            project_id,
            llm_client_available(),
            queue.clone(),
            db.clone(),
            cache.clone(),
        )
        .await;
    }

    // Pass 2: trace outputs. Every LLM span on the trace's main-agent path
    // (the current input winner's stripped path, cached by Pass 1 above)
    // is a candidate; among this batch's matches per trace, only the one
    // with the latest `end_time_ns` publishes — "latest wins" beyond that
    // is enforced by the `trace_agent_output` RMT version, not a lock.
    // When no path is cached yet for a trace (no input winner established
    // yet, or a cache miss/error), every LLM span in the batch is treated
    // as matching so a trace's output is visible from its very first span.
    let mut path_cache: HashMap<Uuid, Option<Vec<String>>> = HashMap::new();
    let mut best_outputs: HashMap<Uuid, (i64, &OutputCandidate)> = HashMap::new();
    for (ctx, path) in &contexts {
        let Some(output_candidate) = ctx.output_candidate.as_ref() else {
            continue;
        };
        let cached_prefix = match path_cache.entry(ctx.trace_id) {
            std::collections::hash_map::Entry::Occupied(e) => e.get().clone(),
            std::collections::hash_map::Entry::Vacant(e) => {
                let key = main_agent_path_cache_key(project_id, ctx.trace_id);
                let prefix: Option<Vec<String>> = cache.get(&key).await.ok().flatten();
                e.insert(prefix.clone());
                prefix
            }
        };
        let matches = match &cached_prefix {
            // Must strip the last segment the same way the input side does.
            Some(prefix) => &path[..path.len().saturating_sub(1)] == prefix.as_slice(),
            // No winner established yet for this trace — every LLM span
            // qualifies so output is visible before arbitration catches up.
            None => true,
        };
        if !matches {
            continue;
        }
        let entry = best_outputs
            .entry(ctx.trace_id)
            .or_insert((output_candidate.end_time_ns, output_candidate));
        if output_candidate.end_time_ns > entry.0 {
            *entry = (output_candidate.end_time_ns, output_candidate);
        }
    }
    for (trace_id, (_, candidate)) in best_outputs {
        process_trace_output_candidate(
            candidate,
            trace_id,
            project_id,
            queue.clone(),
            db.clone(),
            cache.clone(),
        )
        .await;
        // Refresh the path cache TTL on every match so a long-running
        // trace's cached prefix doesn't expire mid-flight.
        if let Some(Some(prefix)) = path_cache.get(&trace_id) {
            write_main_agent_path(&cache, project_id, trace_id, prefix).await;
        }
    }
}

/// Can this candidate challenge? Only spans at the shallowest depth seen
/// for the trace (`lock.depth`) AND inside the earliest-N roster window.
/// `process_trace_inputs` resets `lock.depth` to the batch's minimum
/// before this runs, so every contender is at or below `lock.depth` in
/// depth terms (never shallower); the `== lock.depth` check therefore
/// gates out deeper (subagent) spans, and the roster gate seals the trace
/// once the window fills. There is no depth/winner bypass: a shallower
/// span always wins by resetting `lock.depth` (see `process_trace_inputs`),
/// so once a shallower span is seen a deeper one can never own the task.
fn is_eligible(state: &WinnerState, lock: &UserTaskLockState) -> bool {
    state.depth == lock.depth && lock.roster.iter().any(|e| e.span_id == state.span_id)
}

/// Should this challenger run the effect against the published winner?
/// It must strictly beat the winner (depth/tokens) OR — when they tie on
/// strength — carry genuinely new content. Identical content from a
/// stronger-or-equal span was already extracted, so re-publishing it is a
/// wasteful no-op; new content always runs.
fn should_run_effect(challenger: &WinnerState, winner: Option<&WinnerState>) -> bool {
    match winner {
        None => true,
        Some(winner) => challenger.beats(winner) && challenger.content_hash != winner.content_hash,
    }
}

/// Roster arbitration + effect for one trace's batch contenders.
///
/// Protocol: read the lock (absent → fresh at the batch's shallowest
/// depth; a strictly shallower batch resets it — the previous depth's
/// roster and winner were subagent-level); register every contender at
/// the lock's depth (the roster keeps the [`super::lock::ROSTER_CAP`]
/// earliest starters); the strongest eligible contender (see
/// [`is_eligible`]) challenges the published winner via
/// [`should_run_effect`] (pure depth/token/content comparison — no LLM
/// involved). Winning the challenge ALWAYS caches the winner's path (Pass 2
/// needs this to find the main-agent spine even when no LLM client is
/// configured). The LLM-backed extraction effect (cached-regex apply, or
/// enqueue for regex generation) additionally runs only when
/// `user_task_agent_enabled` — without a client the extraction workers never
/// spawn, so enqueueing would strand messages. The lock is written back
/// merge-guarded regardless; `lock.winner` moves as soon as the challenge is
/// won (independent of whether the LLM effect itself lands, since there may
/// be none to land).
async fn process_trace_inputs(
    trace_id: Uuid,
    trace_contenders: Vec<InputContender>,
    project_id: Uuid,
    user_task_agent_enabled: bool,
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
    for contender in &trace_contenders {
        if contender.state.depth != lock.depth {
            continue;
        }
        lock.register(RosterEntry {
            start_time_ns: contender.state.start_time_ns,
            span_id: contender.state.span_id.clone(),
        });
    }
    let eligible = trace_contenders
        .iter()
        .filter(|c| is_eligible(&c.state, &lock));

    let challenger = eligible.reduce(|best, c| if c.state.beats(&best.state) { c } else { best });

    if let Some(challenger) = challenger
        && should_run_effect(&challenger.state, lock.winner.as_ref())
    {
        let state = challenger.state.clone();
        let candidate = &challenger.candidate;

        // Cache the challenger's stripped path UNCONDITIONALLY — this is
        // pure heuristic arbitration (depth/tokens/roster, no LLM involved),
        // so Pass 2 (trace outputs) can find the main-agent spine even when
        // no LLM client is configured. Must stay the same "drop own
        // segment" heuristic as Pass 2's match check above.
        let prefix = &challenger.path[..challenger.path.len().saturating_sub(1)];
        write_main_agent_path(&cache, project_id, trace_id, prefix).await;

        if !user_task_agent_enabled {
            write_lock_merged(&cache, &lock_key, &lock, trace_id).await;
            return;
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
                let value = extraction_outcome_value(&result);
                match publish_trace_input_update(
                    trace_id,
                    project_id,
                    value,
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

    fn winner(depth: usize, tokens: i64, id: &str, content: &str) -> WinnerState {
        WinnerState {
            depth,
            input_tokens: tokens,
            start_time_ns: 0,
            span_id: id.to_string(),
            content_hash: content.to_string(),
        }
    }

    fn extended_path(mut attrs: SpanAttributes, span_name: &str) -> Vec<String> {
        attrs.extend_span_path(span_name);
        attrs.path().unwrap_or_default()
    }

    #[test]
    fn span_path_matches_ingest_extended_path() {
        // Auto-instrumented span: path lacks its own name — the extension
        // appends it, so the path matches what ingest records.
        let attrs = SpanAttributes::new(HashMap::from([(
            SPAN_PATH.to_string(),
            json!(["agent", "subagent"]),
        )]));
        assert_eq!(
            extended_path(attrs, "llm_call"),
            vec!["agent", "subagent", "llm_call"]
        );
        // SDK span whose path already ends with its own name: idempotent.
        let attrs = SpanAttributes::new(HashMap::from([(
            SPAN_PATH.to_string(),
            json!(["agent", "llm_call"]),
        )]));
        assert_eq!(extended_path(attrs, "llm_call"), vec!["agent", "llm_call"]);
        // Missing path attribute: seeded as a 1-element array.
        let attrs = SpanAttributes::new(HashMap::new());
        assert_eq!(extended_path(attrs, "llm_call"), vec!["llm_call"]);
    }

    #[test]
    fn should_run_effect_no_winner_always_runs() {
        assert!(should_run_effect(&winner(2, 100, "a", "h1"), None));
    }

    #[test]
    fn should_run_effect_skips_stronger_challenger_with_same_content() {
        // A strictly stronger challenger (more tokens) but identical
        // content: already extracted, no re-run.
        let published = winner(2, 100, "old", "same");
        let challenger = winner(2, 500, "new", "same");
        assert!(challenger.beats(&published));
        assert!(!should_run_effect(&challenger, Some(&published)));
    }

    #[test]
    fn should_run_effect_runs_stronger_challenger_with_new_content() {
        let published = winner(2, 100, "old", "h1");
        let challenger = winner(2, 500, "new", "h2");
        assert!(should_run_effect(&challenger, Some(&published)));
    }

    #[test]
    fn should_run_effect_skips_non_beating_challenger() {
        // Weaker challenger never runs, even with new content.
        let published = winner(2, 500, "old", "h1");
        let challenger = winner(2, 100, "new", "h2");
        assert!(!should_run_effect(&challenger, Some(&published)));
    }

    #[test]
    fn is_eligible_requires_roster_membership_at_lock_depth() {
        let mut lock = UserTaskLockState::new(2);
        lock.register(RosterEntry {
            start_time_ns: 0,
            span_id: "member".to_string(),
        });
        // At lock depth AND in the roster window: eligible.
        assert!(is_eligible(&winner(2, 50, "member", "h"), &lock));
        // At lock depth but not in the roster window: gated out.
        assert!(!is_eligible(&winner(2, 9000, "stranger", "h"), &lock));
    }

    #[test]
    fn is_eligible_gates_out_deeper_spans() {
        // Eligibility is winner-independent: a deeper span is never
        // eligible once the trace has a shallower `lock.depth`, even with
        // no published winner (a shallower span always resets lock.depth
        // and wins).
        let mut lock = UserTaskLockState::new(1);
        lock.register(RosterEntry {
            start_time_ns: 0,
            span_id: "deep".to_string(),
        });
        assert!(!is_eligible(&winner(3, 9000, "deep", "h"), &lock));
    }
}
