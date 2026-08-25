//! Producer-side hook, called from `publish_span_messages`: candidate
//! capture, per-agent winner arbitration, inline cached-regex
//! application, enqueueing regex generation on cache miss, and the
//! inline trace-output pass (LAM-1953).
//!
//! **Arbitration assumes the effect (metadata publish / queue enqueue)
//! does not partially fail.** It's best-effort — errors are logged and
//! swallowed — but the design does not try to recover a trace from a
//! publish that failed mid-way: a swallowed failure just means that
//! trace's `lmnr_user_task` is (rarely) missing, not that a later
//! candidate must heal it. Arbitration itself is stateless-ish and
//! self-correcting (see [`super::lock`]): the winner is re-derived from the
//! per-agent map on every batch, so a lost publish is the only unrecovered
//! case. If both stores fail the whole flush fails and Rabbit redelivers.

use std::collections::HashMap;
use std::sync::Arc;

use uuid::Uuid;

use super::input::prepare_user_task_input;
use super::lock::{
    UserTaskLockState, WinnerState, lock_cache_key, main_agent_path_cache_key, span_key,
    write_lock_merged, write_main_agent_path,
};
use super::metadata::extraction_outcome_value;
use super::output::{OutputCandidate, process_trace_output_candidate};
use super::queue::{InputExtractionMessage, push_to_input_extraction_queue};
use super::regex::{
    RegexTarget, Resolution, record_resolution, regex_target, try_apply_cached_regex,
};
use crate::cache::{Cache, CacheTrait};
use crate::db::{DB, spans::Span};
use crate::features::{Feature, is_feature_enabled};
use crate::llm::llm_client_available;
use crate::mq::{MessageQueue, stream::StreamPublisher};
use crate::traces::metadata::publish_trace_input_update;
use crate::traces::sp_versioning::producer::VersionVerdicts;
use crate::traces::spans::SpanAttributes;
use crate::traces::utils::get_llm_usage_for_span;

/// The span's system-prompt identity, threaded from the ingest producer. The
/// agent hash is a key component of both regex cachings; the byte-identity hash
/// is how the candidate looks its prompt's version up in the batch's
/// [`VersionVerdicts`].
#[derive(Debug, Clone, Copy)]
pub struct SystemPromptIdentity<'a> {
    /// First-sentence hash (NOT the skeleton hash stamped on
    /// `lmnr.span.prompt_hash`): permutations of the system prompt's XML
    /// scaffolding must not fork the user-regex cache key.
    pub agent_hash: &'a str,
    pub full_prompt_hash: &'a str,
}

/// Per-span input candidate captured inside `preprocess_for_queue`,
/// BEFORE the dedup strip removes `span.input` — the only point where the
/// full input is guaranteed present.
#[derive(Debug, Clone)]
pub struct UserTaskCandidate {
    pub signposted_text: String,
    pub fingerprint: String,
    /// Whether the last turn follows assistant history — a key component of the
    /// version-keyed cache (already encoded in `fingerprint` for the legacy one).
    pub has_history: bool,
    /// First-sentence hash of the system prompt. `None` for LLM spans carrying
    /// no system message, which can never have a version and so stay on the
    /// legacy keying forever.
    pub prompt_hash: Option<String>,
    /// Byte-identity hash of the system prompt; looks the resolved version up in
    /// the batch's verdict map. `None` alongside `prompt_hash`.
    pub full_prompt_hash: Option<String>,
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

const ROLLOUT_SESSION_METADATA_KEY: &str = "rollout.session_id";
const EVALUATION_SPAN_ATTR: &str = "lmnr.association.properties.metadata.evaluation_id";

/// Rollout session id for debugger-channel routing; eval spans excluded.
fn rollout_session_id_from_attributes(attributes: &SpanAttributes) -> Option<String> {
    if attributes.raw_attributes.contains_key(EVALUATION_SPAN_ATTR) {
        return None;
    }
    attributes
        .metadata()?
        .get(ROLLOUT_SESSION_METADATA_KEY)
        .and_then(|v| v.as_str())
        .map(str::to_string)
}

pub fn capture_user_task_candidate(
    span: &Span,
    system_prompt: Option<SystemPromptIdentity<'_>>,
) -> Option<UserTaskCandidate> {
    if !span.is_llm_span() {
        return None;
    }
    let prepared = prepare_user_task_input(span.input.as_ref()?)?;
    Some(UserTaskCandidate {
        signposted_text: prepared.signposted_text,
        fingerprint: prepared.fingerprint,
        has_history: prepared.has_history,
        prompt_hash: system_prompt.map(|s| s.agent_hash.to_string()),
        full_prompt_hash: system_prompt.map(|s| s.full_prompt_hash.to_string()),
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
    rollout_session_id: Option<String>,
    span_id: Uuid,
    /// The prompt version resolved inline by the sp-versioning producer, if any.
    version_hash: Option<String>,
}

/// Producer-side extraction pipeline, run after the batch is published.
/// Pass 1 arbitrates user-task inputs per trace via the per-agent lock and
/// runs the effect (inline cached-regex apply, or enqueue for LLM regex
/// generation) for the strongest eligible candidate. Pass 2 processes
/// trace outputs. All failures are logged and swallowed — extraction
/// must never block or fail span ingestion.
#[allow(clippy::too_many_arguments)]
pub async fn process_user_task_candidates(
    contexts: Vec<UserTaskSpanContext>,
    project_id: Uuid,
    version_verdicts: VersionVerdicts,
    queue: Arc<MessageQueue>,
    db: Arc<DB>,
    cache: Arc<Cache>,
    spans_stream_publisher: Option<Arc<StreamPublisher>>,
) {
    // Do not run on self-tracing project to avoid infinite looping
    if std::env::var(crate::env::user_task::USER_TASK_INTERNAL_PROJECT_ID)
        .is_ok_and(|internal_project_id_str| internal_project_id_str == project_id.to_string())
    {
        return;
    }

    #[cfg(feature = "signals")]
    if std::env::var(crate::env::connections::SIGNALS_INTERNAL_PROJECT_ID)
        .is_ok_and(|internal_project_id_str| internal_project_id_str == project_id.to_string())
    {
        return;
    }

    if contexts.is_empty() || !is_feature_enabled(Feature::InputExtraction) {
        return;
    }

    // Path is computed once up front for the main-agent path cache Pass 2
    // matches against. `extend_span_path` runs BEFORE the consumer's
    // `prepare_span_for_recording` does the same, so the path here matches
    // what ingest records (an auto-instrumented span otherwise lacks its own
    // trailing segment). Contexts are sorted by start time so registration
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

    // Pass 1: user-task inputs. Winner arbitration and main-agent
    // path caching run UNCONDITIONALLY — the comparison needs no
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
        let rollout_session_id = rollout_session_id_from_attributes(&ctx.attributes);
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
            // Empty for a span with no system message: ungroupable, so they
            // all share one bucket.
            agent_hash: candidate.prompt_hash.clone().unwrap_or_default(),
            input_tokens: usage.input_tokens,
            start_time_ns: ctx.start_time_ns,
            span_id: span_key(ctx.span_id),
            content_hash,
        };
        let version_hash = candidate
            .full_prompt_hash
            .as_deref()
            .and_then(|hash| version_verdicts.get(hash))
            .cloned();
        contenders
            .entry(ctx.trace_id)
            .or_default()
            .push(InputContender {
                candidate,
                state,
                path: path.clone(),
                rollout_session_id,
                span_id: ctx.span_id,
                version_hash,
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
            spans_stream_publisher.clone(),
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
            spans_stream_publisher.clone(),
        )
        .await;
        // Refresh the path cache TTL on every match so a long-running
        // trace's cached prefix doesn't expire mid-flight.
        if let Some(Some(prefix)) = path_cache.get(&trace_id) {
            write_main_agent_path(&cache, project_id, trace_id, prefix).await;
        }
    }
}

/// Should the derived winner's extraction run? Only when its text differs
/// from what was last published — a winner change that carries identical
/// text is a wasteful no-op. This replaced a "challenger must beat the
/// published winner" ratchet, which the per-agent model can't use: the
/// winner legitimately moves DOWN in tokens when a genuinely earlier step
/// for the winning agent arrives late.
fn should_run_effect(winner: &WinnerState, published: Option<&str>) -> bool {
    published != Some(winner.content_hash.as_str())
}

/// Per-agent arbitration + effect for one trace's batch contenders.
///
/// Protocol: read the lock (absent → fresh); fold every contender into its
/// agent's slot, keeping that agent's earliest start; derive the winner (the
/// biggest agent's representative) and cache its path unconditionally —
/// that's pure arbitration, no LLM involved, and Pass 2 needs it regardless
/// of whether the text extraction below runs. The LLM-backed extraction
/// effect (cached-regex apply, or enqueue for regex generation) only runs
/// when [`should_run_effect`] holds AND `user_task_agent_enabled` — without
/// a client the extraction workers never spawn, so enqueueing would strand
/// messages. The lock is written back merge-guarded regardless;
/// `lock.published` moves as soon as that effect lands.
#[allow(clippy::too_many_arguments)]
async fn process_trace_inputs(
    trace_id: Uuid,
    trace_contenders: Vec<InputContender>,
    project_id: Uuid,
    user_task_agent_enabled: bool,
    queue: Arc<MessageQueue>,
    db: Arc<DB>,
    cache: Arc<Cache>,
    spans_stream_publisher: Option<Arc<StreamPublisher>>,
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

    let mut lock = current.unwrap_or_default();

    // Split "what was published" from "what this run asserts". `merge_from`
    // takes the incoming `published`, so carrying the read-time hash into a
    // write would roll back a concurrent batch that published in between;
    // `lock.published` is therefore left empty until this run's own effect
    // lands, and every gate below reads the snapshot instead.
    let published_before = lock.published.take();

    for contender in &trace_contenders {
        lock.register(contender.state.clone());
    }

    // The effect needs the winner's prepared text, which only THIS batch's
    // contenders carry — the lock stores hashes, not text. Usually that's
    // enough: an unchanged winner was already published when it was current,
    // and both a new agent and an earlier step for the winning agent arrive
    // in this batch.
    //
    // KNOWN GAP (tracked by the gated log below): a DEMOTION reorders without
    // changing the promoted agent's representative. When this batch supplies
    // an earlier — hence lower-token — step for the current winner, that
    // agent's rank drops and an already-stored agent can take the top spot;
    // its representative came from a previous batch, so we hold no text and
    // `published` keeps the superseded value with no later batch to heal it.
    // Reaching it needs one agent's steps to arrive out of order (export
    // reordering or concurrent batches), which is why this is measured rather
    // than assumed.
    //
    // Do NOT "fix" this by ranking agents on max(tokens) seen: that removes
    // demotion but makes the out-of-batch case COMMON in the mirror direction
    // — a helper whose first step outranks the main agent's first step wins at
    // cold start, then the main agent's loop grows in a later batch and
    // promotes it while its representative sits in the earlier one. The real
    // fix is resolving a winner's text by span id in the worker (it already
    // holds the ClickHouse client and the span id), transient-erroring while
    // the span isn't inserted yet so redelivery heals it.
    let winner = lock.winner().cloned();
    let challenger = winner.as_ref().and_then(|w| {
        trace_contenders
            .iter()
            .find(|c| c.state.span_id == w.span_id)
    });

    // An out-of-batch winner is the STEADY STATE of a multi-batch loop — the
    // representative stays the first step while later batches carry later
    // steps — so it is only the gap when the effect is actually owed. Gating on
    // `should_run_effect` is what keeps this rare enough to be both an ERROR
    // and a usable measure of how often demotion really bites.
    if let Some(winner) = winner.as_ref()
        && challenger.is_none()
        && should_run_effect(winner, published_before.as_deref())
    {
        log::error!(
            "user-task: derived winner is not in this batch and its text is owed, extraction \
             skipped for trace [{trace_id}] (project [{project_id}], agent [{}], span [{}], \
             {} tokens, content [{}], published [{}]) — see the KNOWN GAP note in \
             `process_trace_inputs`",
            winner.agent_hash,
            winner.span_id,
            winner.input_tokens,
            winner.content_hash,
            published_before.as_deref().unwrap_or("none"),
        );
    }

    if let Some(challenger) = challenger {
        // Cache the winner's path independent of `should_run_effect` below,
        // which only gates the LLM-backed text extraction. Otherwise a
        // same-content winner (should_run_effect = false) would leave Pass 2
        // matching against a stale path until the entry expires. Must stay
        // the same "drop own segment" heuristic as Pass 2's match check
        // above.
        let prefix = &challenger.path[..challenger.path.len().saturating_sub(1)];
        write_main_agent_path(&cache, project_id, trace_id, prefix).await;
    }

    if let Some(challenger) = challenger
        && should_run_effect(&challenger.state, published_before.as_deref())
    {
        let state = challenger.state.clone();
        let candidate = &challenger.candidate;
        let rollout_session_id = challenger.rollout_session_id.clone();

        if !user_task_agent_enabled {
            write_lock_merged(&cache, &lock_key, &lock, trace_id).await;
            return;
        }

        // Persist the agent map BEFORE the effect, so a consumer can never read
        // a map older than the decision we're about to dispatch. Without it the
        // ordering is enqueue-then-write, and a consumer that picks the message
        // up inside that window sees the pre-batch representative: its
        // `supersedes` check then compares our snapshot against the stale
        // winner, drops the correcting extraction, and the `published` we set
        // below makes every later batch skip — leaving the superseded text
        // stored for good. Effects only run when the winner's text changes, so
        // this extra round-trip is rare rather than per-batch. It carries the
        // map alone (`published` is still empty here), and earliest-per-agent
        // is commutative, so it composes with a concurrent batch's write; the
        // inline re-read below still catches a genuinely newer winner.
        write_lock_merged(&cache, &lock_key, &lock, trace_id).await;

        // A prompt whose version isn't minted yet has no cacheable key, so the
        // inline fast path is skipped entirely and the worker owns the
        // resolution (re-read, then a direct extraction).
        let target = regex_target(
            project_id,
            candidate.prompt_hash.as_deref(),
            challenger.version_hash.as_deref(),
            &candidate.fingerprint,
            candidate.has_history,
        );
        let inline_result = match &target {
            RegexTarget::Keyed { key, .. } => {
                try_apply_cached_regex(
                    &cache,
                    key,
                    &candidate.signposted_text,
                    project_id,
                    trace_id,
                )
                .await
            }
            RegexTarget::Unversioned => None,
        };
        // Recorded only for the versioned pipeline: the legacy keying serves
        // prompts that can never have a version, so counting its hits would
        // inflate the denominator of the fallback-rate metric.
        if inline_result.is_some()
            && let RegexTarget::Keyed {
                version: Some(version),
                ..
            } = &target
        {
            record_resolution(
                Resolution::Cached,
                project_id,
                trace_id,
                Some(version),
                candidate.has_history,
            );
        }

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
        // extraction enqueue on miss) actually landed. `published` moves
        // only on success — moving it eagerly would gate retries for the
        // whole lock TTL after a swallowed failure, possibly never writing
        // `lmnr_user_task` at all.
        let effect_landed = match inline_result {
            Some(result) => {
                let value = extraction_outcome_value(&result);
                match publish_trace_input_update(
                    trace_id,
                    project_id,
                    value,
                    rollout_session_id.clone(),
                    queue.clone(),
                    db.clone(),
                    cache.clone(),
                    spans_stream_publisher.clone(),
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
                    span_id: Some(challenger.span_id),
                    prompt_hash: candidate.prompt_hash.clone(),
                    full_prompt_hash: candidate.full_prompt_hash.clone(),
                    version_hash: challenger.version_hash.clone(),
                    has_history: candidate.has_history,
                    signposted_text: candidate.signposted_text.clone(),
                    fingerprint: candidate.fingerprint.clone(),
                    winner_state: Some(state.clone()),
                    rollout_session_id: rollout_session_id.clone(),
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
            lock.published = Some(state.content_hash);
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

    fn winner(content: &str) -> WinnerState {
        WinnerState {
            agent_hash: "agent".to_string(),
            input_tokens: 100,
            start_time_ns: 0,
            span_id: "span".to_string(),
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
    fn should_run_effect_publishes_when_nothing_published_yet() {
        assert!(should_run_effect(&winner("h1"), None));
    }

    #[test]
    fn should_run_effect_skips_a_winner_carrying_the_published_text() {
        // The winner can change (a late earlier step, a new agent) while
        // carrying the same text — republishing it is a no-op.
        assert!(!should_run_effect(&winner("same"), Some("same")));
    }

    #[test]
    fn should_run_effect_runs_on_any_text_change() {
        // Deliberately NOT gated on beating the previous winner: the
        // per-agent model lets the winner move DOWN in tokens when a
        // genuinely earlier step for the winning agent arrives late, and
        // that correction must publish.
        assert!(should_run_effect(&winner("h2"), Some("h1")));
    }
}
