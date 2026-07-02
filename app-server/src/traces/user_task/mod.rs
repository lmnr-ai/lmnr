//! Ingestion-time user-task extraction (LAM-1880).
//!
//! Extracts the user's task from a trace's winning LLM span at ingestion
//! time and stores it as trace metadata (`lmnr_user_task`). Key design
//! points:
//!   - operates on the whole last TURN (every user message after the
//!     latest assistant message), not just the last user message;
//!   - joins parts with a signpost separator both when generating and
//!     when applying the regex, then re-joins the extraction on a plain
//!     user-facing separator;
//!   - fingerprints parts order-insensitively (multi-part messages
//!     arrive in unknown order);
//!   - never falls back to raw text — a no-result run writes a boolean
//!     marker metadata key instead;
//!   - caches generated regexes per project + prompt hash + fingerprint
//!     (`USER_TASK_REGEX_CACHE_KEY`) so traces with the same scaffolding
//!     shape share one LLM call.

pub mod consumer;
pub mod extract;
pub mod queue;

use std::collections::HashMap;
use std::sync::{Arc, OnceLock};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha3::{Digest, Sha3_256};
use uuid::Uuid;

use tracing::instrument;

use crate::cache::keys::{USER_TASK_LOCK_CACHE_KEY, USER_TASK_REGEX_CACHE_KEY};
use crate::cache::{Cache, CacheTrait};
use crate::db::{DB, spans::Span, trace::trace_exists};
use crate::env::user_task::USER_TASK_LOCK_TTL_SECONDS;
use crate::features::{Feature, is_feature_enabled};
use crate::llm::LlmClient;
use crate::mq::MessageQueue;
use crate::traces::metadata::publish_trace_metadata_patch;
use crate::traces::span_attributes::SPAN_PROMPT_HASH;
use crate::traces::spans::SpanAttributes;
use crate::traces::utils::get_llm_usage_for_span;

use self::extract::{
    ApplyRegexResult, Role, apply_regex, collect_message_parts, find_messages_array,
    fingerprint_user_message, generate_extraction_regex, is_task_anchor_message, normalize_role,
    truncate_for_regex,
};
use self::queue::{InputExtractionMessage, push_to_input_extraction_queue};

/// Separator inserted between user-message parts before the regex is
/// generated AND applied. Deliberately number-free so part order/count
/// doesn't fork regexes for the same shape.
pub const PART_SEPARATOR: &str = "\n\n== lmnr_part_separator ==\n\n";
/// Core signpost token — split on this (whitespace-insensitive at the
/// boundaries) when re-joining the extracted text.
const PART_SEPARATOR_CORE: &str = "== lmnr_part_separator ==";
/// Separator used when re-joining the extracted parts for storage.
pub const USER_FACING_SEPARATOR: &str = "\n\n";

pub const USER_TASK_METADATA_KEY: &str = "lmnr_user_task";
/// Written instead of `lmnr_user_task` when extraction ran but found no
/// user request (regex says scaffolding-only, or didn't match) —
/// distinguishes "ran and found nothing" from "never ran".
pub const USER_TASK_NOT_FOUND_METADATA_KEY: &str = "lmnr_user_task_not_found";

const REGEX_CACHE_TTL_SECONDS: u64 = 7 * 24 * 60 * 60;

/// Whether the shared `LlmClient` actually initialized. Set from `main.rs`
/// after client construction. `Feature::UserTaskExtraction` only mirrors
/// the credential env vars, but `LlmClient::new` can still fail (bad
/// `LLM_DEFAULT_HEADERS_JSON`, HTTP client build error, ...) — and when it
/// does, the extraction workers are never spawned, so enqueueing would
/// strand messages on the queue unconsumed. Defaults to false so paths
/// that never call `set_llm_client_available` (tests) don't enqueue.
static LLM_CLIENT_AVAILABLE: OnceLock<bool> = OnceLock::new();

pub fn set_llm_client_available(available: bool) {
    let _ = LLM_CLIENT_AVAILABLE.set(available);
}

fn llm_client_available() -> bool {
    LLM_CLIENT_AVAILABLE.get().copied().unwrap_or(false)
}

// ---------------------------------------------------------------------------
// Last-turn extraction
// ---------------------------------------------------------------------------

/// Collect the text parts of the last TURN's user messages: every
/// `role: user` message after the latest assistant message, or — when
/// the input carries no assistant message — every user message in it.
///
/// Anchoring on the whole turn rather than the single last user message
/// matters: a turn can span several user messages (tool results
/// interleaved, multi-part injections) and any of them may carry the
/// task.
pub fn extract_last_turn_user_parts(input: &Value) -> Option<Vec<String>> {
    let messages = find_messages_array(input)?;
    let last_assistant = messages
        .iter()
        .rposition(|m| normalize_role(m) == Role::Assistant);
    let start = last_assistant.map(|i| i + 1).unwrap_or(0);
    let parts: Vec<String> = messages[start..]
        .iter()
        .filter(|m| is_task_anchor_message(m))
        .flat_map(collect_message_parts)
        .filter(|p| !p.trim().is_empty())
        .collect();
    if parts.is_empty() { None } else { Some(parts) }
}

// ---------------------------------------------------------------------------
// Signpost join / split
// ---------------------------------------------------------------------------

/// Join parts with the signpost separator. This exact text is what the
/// regex is generated from and applied to — never conflate it with the
/// user-facing joined form.
pub fn join_parts_signposted(parts: &[String]) -> Option<String> {
    let non_empty: Vec<&str> = parts
        .iter()
        .map(|p| p.trim())
        .filter(|p| !p.is_empty())
        .collect();
    if non_empty.is_empty() {
        return None;
    }
    Some(non_empty.join(PART_SEPARATOR))
}

/// Split extracted text on the signpost token and re-join with the
/// plain user-facing separator. Signposts must never leak into stored
/// metadata.
pub fn split_signposts_and_rejoin(extracted: &str) -> String {
    extracted
        .split(PART_SEPARATOR_CORE)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(USER_FACING_SEPARATOR)
}

// ---------------------------------------------------------------------------
// Fingerprinting (order-insensitive across parts)
// ---------------------------------------------------------------------------

/// Order-insensitive user naive signature: fingerprint each part,
/// sort, join. Multi-part messages arrive with unknown part order, so
/// two permutations of the same parts must share one regex cache entry.
pub fn fingerprint_user_parts(parts: &[String]) -> String {
    let mut fps: Vec<String> = parts.iter().map(|p| fingerprint_user_message(p)).collect();
    fps.sort();
    fps.join("|")
}

/// Sort parts into a canonical order: by structural fingerprint, then
/// by content. Because the regex cache key is order-insensitive
/// (sorted fingerprints) while the regex itself is layout-sensitive
/// (leading vs trailing scaffolding), the text the regex is generated
/// from and applied to must be order-insensitive too. Without this, a
/// regex generated from one arrival order can match a permuted order
/// with an EMPTY capture (`NoUserRequest`, not `NoMatch`), mis-marking
/// the trace `lmnr_user_task_not_found` and sliding the stale cache
/// entry's TTL instead of evicting it.
pub fn canonicalize_user_parts(parts: Vec<String>) -> Vec<String> {
    let mut keyed: Vec<(String, String)> = parts
        .into_iter()
        .map(|p| (fingerprint_user_message(&p), p))
        .collect();
    keyed.sort();
    keyed.into_iter().map(|(_, p)| p).collect()
}

// ---------------------------------------------------------------------------
// Prepared input
// ---------------------------------------------------------------------------

/// The two derived values every pipeline stage needs. Producer computes
/// once and threads both through the queue so the consumer applies the
/// regex to byte-identical text.
#[derive(Debug, Clone, PartialEq)]
pub struct UserTaskInput {
    /// Signpost-joined, truncated last-turn text — the regex target.
    pub signposted_text: String,
    /// Order-insensitive user naive signature (part of the regex cache key).
    pub fingerprint: String,
}

pub fn prepare_user_task_input(input: &Value) -> Option<UserTaskInput> {
    let parts = canonicalize_user_parts(extract_last_turn_user_parts(input)?);
    let signposted = join_parts_signposted(&parts)?;
    Some(UserTaskInput {
        signposted_text: truncate_for_regex(signposted),
        fingerprint: fingerprint_user_parts(&parts),
    })
}

// ---------------------------------------------------------------------------
// Cache keys
// ---------------------------------------------------------------------------

/// Regex cache key: project + prompt hash + fingerprint digest.
/// Deliberately distinct from the frontend extraction cache
/// (`frontend/lib/actions/sessions/extract-input.ts`) — the signposted
/// sample format here diverges from the frontend's plain-joined
/// samples, so the two caches must never share entries.
pub fn regex_cache_key(project_id: Uuid, prompt_hash: Option<&str>, fingerprint: &str) -> String {
    let h = prompt_hash.unwrap_or("none");
    let digest = Sha3_256::digest(fingerprint.as_bytes());
    let fp_hash = &format!("{:x}", digest)[..16];
    format!("{USER_TASK_REGEX_CACHE_KEY}:{project_id}:{h}:{fp_hash}")
}

pub fn lock_cache_key(project_id: Uuid, trace_id: Uuid) -> String {
    format!("{USER_TASK_LOCK_CACHE_KEY}:{project_id}:{trace_id}")
}

// ---------------------------------------------------------------------------
// Winning-span state (per-trace idempotency / override record)
// ---------------------------------------------------------------------------

/// Stats of the span whose input currently owns the trace's user task.
/// Stored as short-key JSON in the lock cache under
/// `lock_cache_key(project_id, trace_id)`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UserTaskLockState {
    /// Input cost of the winning span.
    #[serde(rename = "c")]
    pub input_cost: f64,
    /// Span path depth of the winning span.
    #[serde(rename = "d")]
    pub depth: usize,
    /// Order-insensitive user naive signature of the winning span.
    #[serde(rename = "s")]
    pub user_sig: String,
}

impl UserTaskLockState {
    /// A strictly shallower candidate always overrides — it is closer to
    /// the main agent than the current winner (a deeper subagent span
    /// whose batch merely arrived first must not hold the lock against
    /// the main conversation). At equal depth, only the same (sub)agent
    /// — same user signature — with strictly higher input cost overrides
    /// (a longer context on the same conversation supersedes the earlier
    /// snapshot).
    pub fn should_override(&self, candidate: &Self) -> bool {
        if candidate.depth < self.depth {
            return true;
        }
        candidate.depth == self.depth
            && candidate.user_sig == self.user_sig
            && candidate.input_cost > self.input_cost
    }

    /// Consumer-side supersession check: does the current lock (`self`)
    /// supersede a queued candidate's `snapshot`? Bare inequality is not
    /// enough — the producer writes the lock only after the enqueue
    /// lands, so a failed lock write can leave an OLDER state in the
    /// lock. `should_override` is antisymmetric (a candidate that beat
    /// the lock can never be beaten back by it), so a differing lock the
    /// snapshot CAN override is necessarily such a stale older state:
    /// the snapshot is still the strongest known candidate and must
    /// publish, not drop.
    pub fn supersedes(&self, snapshot: &Self) -> bool {
        self != snapshot && !self.should_override(snapshot)
    }
}

// ---------------------------------------------------------------------------
// Outcome → metadata patch (Q6: no raw fallback)
// ---------------------------------------------------------------------------

/// Map an extraction outcome onto the trace-metadata patch. Extracted
/// text is signpost-split and re-joined; no-result outcomes never fall
/// back to raw text. Trace metadata merges with JSONB `||` (additive —
/// keys are overwritten but never removed), so each arm must overwrite
/// BOTH keys: a success resets a possibly earlier `true` marker to
/// `false`, and a no-result nulls out task text a superseded earlier
/// winner may have published — otherwise the trace would carry stale
/// `lmnr_user_task` text alongside `lmnr_user_task_not_found: true`.
pub fn build_metadata_patch(result: &ApplyRegexResult) -> HashMap<String, Value> {
    match result {
        ApplyRegexResult::Extracted(text) => HashMap::from([
            (
                USER_TASK_METADATA_KEY.to_string(),
                Value::String(split_signposts_and_rejoin(text)),
            ),
            (
                USER_TASK_NOT_FOUND_METADATA_KEY.to_string(),
                Value::Bool(false),
            ),
        ]),
        ApplyRegexResult::NoUserRequest | ApplyRegexResult::NoMatch => HashMap::from([
            (USER_TASK_METADATA_KEY.to_string(), Value::Null),
            (
                USER_TASK_NOT_FOUND_METADATA_KEY.to_string(),
                Value::Bool(true),
            ),
        ]),
    }
}

// ---------------------------------------------------------------------------
// Cache-driven regex application
// ---------------------------------------------------------------------------

/// Consult the regex cache and apply on hit. `None` means "no
/// usable cached regex" — either a true miss or a stale entry that no
/// longer matches (removed so the consumer regenerates).
pub async fn try_apply_cached_regex(
    cache: &Arc<Cache>,
    key: &str,
    signposted_text: &str,
) -> Option<ApplyRegexResult> {
    let cached = cache.get::<String>(key).await.ok().flatten()?;
    match apply_regex(&cached, signposted_text) {
        ApplyRegexResult::NoMatch => {
            let _ = cache.remove(key).await;
            None
        }
        result => {
            let _ = cache.set_ttl(key, REGEX_CACHE_TTL_SECONDS).await;
            Some(result)
        }
    }
}

/// Generate a fresh regex from the signposted text, apply it, and
/// persist it unless the result was `NoMatch` (a regex wrong for its
/// own sample is not worth caching). Errors on LLM failure so the
/// consumer can requeue as transient.
pub async fn generate_and_apply_regex(
    cache: &Arc<Cache>,
    llm_client: &Arc<LlmClient>,
    key: &str,
    signposted_text: &str,
) -> anyhow::Result<ApplyRegexResult> {
    let generated = generate_extraction_regex(llm_client, signposted_text).await?;
    let result = apply_regex(&generated, signposted_text);
    if !matches!(result, ApplyRegexResult::NoMatch) {
        let _ = cache
            .insert_with_ttl(key, generated, REGEX_CACHE_TTL_SECONDS)
            .await;
    }
    Ok(result)
}

// ---------------------------------------------------------------------------
// Producer hook (called from `publish_span_messages`)
// ---------------------------------------------------------------------------

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
/// moved out of the queue message before the hook runs. Keeps
/// `RabbitMqSpanMessage` confined to code that directly operates on the
/// queue — the hook mutates `attributes` (path extension, usage
/// enrichment) on this owned copy, never on the published payload.
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
    if candidates.is_empty()
        || !is_feature_enabled(Feature::UserTaskExtraction)
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

        let state = UserTaskLockState {
            input_cost: usage.input_cost,
            depth,
            user_sig: candidate.fingerprint.clone(),
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
        if let Some(current) = &current
            && !current.should_override(&state)
        {
            continue;
        }

        let regex_key = regex_cache_key(
            project_id,
            candidate.prompt_hash.as_deref(),
            &candidate.fingerprint,
        );
        let mut inline_result =
            try_apply_cached_regex(&cache, &regex_key, &candidate.signposted_text).await;

        if inline_result.is_some() {
            // Re-read the winner lock before the inline publish: a
            // concurrent batch's FULL cycle (gate read, publish, lock
            // write) can complete inside the window since the gate
            // read above (one regex-cache round-trip), and publishing
            // anyway would overwrite the newer winner's metadata.
            // Order-aware (`supersedes`) like the consumer's
            // pre-publish check; absent lock / cache error fails
            // open. The tighter interleaving — both batches publish
            // before either writes its lock — is not closable with
            // get-then-set; this catches the dominant completed-cycle
            // race.
            let rechecked: Option<UserTaskLockState> = cache.get(&lock_key).await.ok().flatten();
            if rechecked.is_some_and(|c| c.supersedes(&state)) {
                log::debug!(
                    "user-task: dropping superseded inline extraction for trace [{trace_id}]"
                );
                continue;
            }

            // The metadata patch rides the same observations queue as the
            // span batch but as a SEPARATE message: with multiple batch
            // workers it can be flushed while the trace row does not exist
            // yet, and `merge_trace_metadata_batch` silently skips missing
            // traces (it must never create stub rows). Publishing inline
            // would then ack a no-op while the winner lock written below
            // gates equal-state retries for the whole TTL. When the row
            // isn't there yet, demote to the extraction queue — the
            // consumer re-hits the regex cache and waits for the row with
            // bounded re-enqueues. Existence-check errors fail open
            // (publish inline): a possibly-early patch beats a guaranteed
            // queue hop on every DB blip.
            let row_exists = trace_exists(&db.pool, project_id, trace_id)
                .await
                .unwrap_or_else(|e| {
                    log::error!(
                        "user-task: trace existence check failed for trace [{trace_id}]: {e:?}"
                    );
                    true
                });
            if !row_exists {
                log::debug!(
                    "user-task: trace row [{trace_id}] not created yet, deferring inline extraction to queue"
                );
                inline_result = None;
            }
        }

        // Whether the candidate's effect (metadata publish on cache hit,
        // extraction enqueue on miss or missing-row demotion) actually
        // landed. The winner lock is written only on success — writing it
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
                    trace_wait_retries: 0,
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

        if effect_landed
            && let Err(e) = cache
                .insert_with_ttl(&lock_key, &state, USER_TASK_LOCK_TTL_SECONDS.get())
                .await
        {
            log::error!("user-task: lock state write failed for trace [{trace_id}]: {e:?}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // ---- extract_last_turn_user_parts ------------------------------------

    #[test]
    fn last_turn_takes_all_user_messages_after_latest_assistant() {
        let v = json!([
            {"role": "user", "content": "old task"},
            {"role": "assistant", "content": "done"},
            {"role": "user", "content": "part one"},
            {"role": "tool", "content": "tool result"},
            {"role": "user", "content": "part two"}
        ]);
        assert_eq!(
            extract_last_turn_user_parts(&v),
            Some(vec!["part one".to_string(), "part two".to_string()])
        );
    }

    #[test]
    fn last_turn_without_assistant_takes_all_user_messages() {
        let v = json!([
            {"role": "system", "content": "sys"},
            {"role": "user", "content": "first"},
            {"role": "user", "content": "second"}
        ]);
        assert_eq!(
            extract_last_turn_user_parts(&v),
            Some(vec!["first".to_string(), "second".to_string()])
        );
    }

    #[test]
    fn last_turn_none_when_no_user_after_last_assistant() {
        let v = json!([
            {"role": "user", "content": "task"},
            {"role": "assistant", "content": "answer"}
        ]);
        assert_eq!(extract_last_turn_user_parts(&v), None);
    }

    #[test]
    fn last_turn_flattens_multipart_messages() {
        let v = json!([
            {"role": "ai", "content": "prev"},
            {"role": "human", "content": [
                {"type": "text", "text": "<env>x</env>"},
                {"type": "text", "text": "real ask"}
            ]}
        ]);
        assert_eq!(
            extract_last_turn_user_parts(&v),
            Some(vec!["<env>x</env>".to_string(), "real ask".to_string()])
        );
    }

    #[test]
    fn last_turn_gemini_contents_shape() {
        let v = json!({
            "contents": [
                {"role": "model", "parts": [{"text": "prev"}]},
                {"role": "user", "parts": [{"text": "Hello"}, {"text": "world"}]}
            ]
        });
        assert_eq!(
            extract_last_turn_user_parts(&v),
            Some(vec!["Hello".to_string(), "world".to_string()])
        );
    }

    #[test]
    fn last_turn_none_for_non_message_input() {
        assert_eq!(extract_last_turn_user_parts(&json!({"foo": "bar"})), None);
        assert_eq!(extract_last_turn_user_parts(&json!("just a string")), None);
    }

    // ---- signpost join / split -------------------------------------------

    #[test]
    fn signpost_join_and_rejoin_round_trip() {
        let parts = vec!["first part".to_string(), "second part".to_string()];
        let joined = join_parts_signposted(&parts).unwrap();
        assert_eq!(
            joined,
            "first part\n\n== lmnr_part_separator ==\n\nsecond part"
        );
        assert_eq!(
            split_signposts_and_rejoin(&joined),
            "first part\n\nsecond part"
        );
    }

    #[test]
    fn signpost_join_skips_empty_parts() {
        let parts = vec!["  ".to_string(), "task".to_string(), "".to_string()];
        assert_eq!(join_parts_signposted(&parts), Some("task".to_string()));
        assert_eq!(join_parts_signposted(&["  ".to_string()]), None);
    }

    #[test]
    fn rejoin_handles_partial_separator_whitespace() {
        // A regex capture may clip the separator's surrounding newlines;
        // splitting on the core token still cleans it up.
        let extracted = "kept one== lmnr_part_separator ==kept two";
        assert_eq!(
            split_signposts_and_rejoin(extracted),
            "kept one\n\nkept two"
        );
    }

    // ---- fingerprint_user_parts ------------------------------------------

    #[test]
    fn fingerprint_is_order_insensitive() {
        let a = vec!["<env>x</env>".to_string(), "do the thing".to_string()];
        let b = vec!["do the thing".to_string(), "<env>y</env>".to_string()];
        assert_eq!(fingerprint_user_parts(&a), fingerprint_user_parts(&b));
        assert_eq!(fingerprint_user_parts(&a), "env,/env|plain");
    }

    #[test]
    fn fingerprint_differs_for_different_shapes() {
        let a = vec!["<env>x</env>".to_string()];
        let b = vec!["plain text".to_string()];
        assert_ne!(fingerprint_user_parts(&a), fingerprint_user_parts(&b));
    }

    // ---- prepare_user_task_input -----------------------------------------

    #[test]
    fn prepare_builds_signposted_text_and_fingerprint() {
        let v = json!([
            {"role": "assistant", "content": "prev"},
            {"role": "user", "content": [
                {"type": "text", "text": "<context>c</context>"},
                {"type": "text", "text": "the task"}
            ]}
        ]);
        let prepared = prepare_user_task_input(&v).unwrap();
        assert_eq!(
            prepared.signposted_text,
            "<context>c</context>\n\n== lmnr_part_separator ==\n\nthe task"
        );
        assert_eq!(prepared.fingerprint, "context,/context|plain");
    }

    #[test]
    fn prepare_is_order_insensitive_across_part_permutations() {
        // Both derived values must be permutation-invariant: the cache
        // key (fingerprint) already is, so the regex target text has to
        // be too — a layout-sensitive regex generated from one arrival
        // order would otherwise capture empty on a permuted order and
        // mis-mark the trace as "no user request".
        let a = json!([
            {"role": "user", "content": [
                {"type": "text", "text": "<env>x</env>"},
                {"type": "text", "text": "do the thing"}
            ]}
        ]);
        let b = json!([
            {"role": "user", "content": [
                {"type": "text", "text": "do the thing"},
                {"type": "text", "text": "<env>x</env>"}
            ]}
        ]);
        let pa = prepare_user_task_input(&a).unwrap();
        let pb = prepare_user_task_input(&b).unwrap();
        assert_eq!(pa, pb);
        assert_eq!(
            pa.signposted_text,
            "<env>x</env>\n\n== lmnr_part_separator ==\n\ndo the thing"
        );
    }

    // ---- cache keys --------------------------------------------------------

    #[test]
    fn regex_cache_key_uses_dedicated_prefix() {
        let pid = Uuid::nil();
        let key = regex_cache_key(pid, Some("abc"), "plain");
        assert!(key.starts_with("user_task_regex:"));
        assert!(key.contains(":abc:"));
        // Same fingerprint → same key; different → different.
        assert_eq!(key, regex_cache_key(pid, Some("abc"), "plain"));
        assert_ne!(key, regex_cache_key(pid, Some("abc"), "env,/env"));
    }

    #[test]
    fn lock_key_scopes_by_project_and_trace() {
        let p = Uuid::new_v4();
        let t = Uuid::new_v4();
        assert_eq!(lock_cache_key(p, t), format!("user_task_lock:{p}:{t}"));
    }

    // ---- UserTaskLockState::should_override --------------------------------

    fn state(cost: f64, depth: usize, sig: &str) -> UserTaskLockState {
        UserTaskLockState {
            input_cost: cost,
            depth,
            user_sig: sig.to_string(),
        }
    }

    #[test]
    fn equal_depth_override_requires_same_sig_higher_cost() {
        let prev = state(1.0, 2, "plain");
        assert!(prev.should_override(&state(2.0, 2, "plain")));
        // Deeper path — a subagent, not the main conversation.
        assert!(!prev.should_override(&state(2.0, 3, "plain")));
        // Different user signature — different (sub)agent shape.
        assert!(!prev.should_override(&state(2.0, 2, "env,/env")));
        // Not strictly higher cost — nothing new in the context.
        assert!(!prev.should_override(&state(1.0, 2, "plain")));
        assert!(!prev.should_override(&state(0.5, 2, "plain")));
    }

    #[test]
    fn shallower_candidate_overrides_regardless_of_sig_and_cost() {
        // A first-arriving deeper subagent must not hold the lock
        // against the shallower main agent, whose fingerprint differs.
        let subagent = state(5.0, 3, "env,/env");
        assert!(subagent.should_override(&state(1.0, 2, "plain")));
        // Same sig, shallower — closer to the main agent wins even at
        // lower cost.
        assert!(subagent.should_override(&state(1.0, 2, "env,/env")));
        // Deeper never overrides, regardless of sig or cost.
        assert!(!subagent.should_override(&state(50.0, 4, "env,/env")));
    }

    #[test]
    fn supersedes_is_order_aware_not_bare_inequality() {
        let snapshot = state(2.0, 2, "plain");
        // Identical lock — the snapshot IS the current winner: publish.
        assert!(!state(2.0, 2, "plain").supersedes(&snapshot));
        // Newer winner (shallower, or same-sig higher cost): drop.
        assert!(state(1.0, 1, "other").supersedes(&snapshot));
        assert!(state(3.0, 2, "plain").supersedes(&snapshot));
        // Stale OLDER lock left behind by a failed producer lock write
        // (the snapshot overrode it to get enqueued): must NOT drop.
        assert!(!state(1.0, 2, "plain").supersedes(&snapshot));
        assert!(!state(5.0, 3, "env,/env").supersedes(&snapshot));
    }

    // ---- span_depth ---------------------------------------------------------

    #[test]
    fn span_depth_matches_ingest_extended_path() {
        use crate::traces::span_attributes::SPAN_PATH;
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

    #[test]
    fn lock_state_serializes_with_short_keys() {
        let s = state(1.5, 3, "plain");
        let json = serde_json::to_string(&s).unwrap();
        assert_eq!(json, r#"{"c":1.5,"d":3,"s":"plain"}"#);
        let back: UserTaskLockState = serde_json::from_str(&json).unwrap();
        assert_eq!(back, s);
    }

    // ---- build_metadata_patch ----------------------------------------------

    #[test]
    fn extracted_outcome_writes_user_task_with_rejoined_text() {
        let result = ApplyRegexResult::Extracted(
            "part a\n\n== lmnr_part_separator ==\n\npart b".to_string(),
        );
        let patch = build_metadata_patch(&result);
        assert_eq!(
            patch.get(USER_TASK_METADATA_KEY),
            Some(&Value::String("part a\n\npart b".to_string()))
        );
        // JSONB || merge never removes keys — success must reset an
        // earlier not-found marker.
        assert_eq!(
            patch.get(USER_TASK_NOT_FOUND_METADATA_KEY),
            Some(&Value::Bool(false))
        );
    }

    #[test]
    fn no_result_outcomes_null_out_task_and_set_marker() {
        for result in [ApplyRegexResult::NoUserRequest, ApplyRegexResult::NoMatch] {
            let patch = build_metadata_patch(&result);
            assert_eq!(
                patch.get(USER_TASK_NOT_FOUND_METADATA_KEY),
                Some(&Value::Bool(true))
            );
            // A superseding winner whose extraction fails must not leave a
            // previously published task string behind — JSONB || can only
            // overwrite, so null is the strongest available "remove".
            assert_eq!(patch.get(USER_TASK_METADATA_KEY), Some(&Value::Null));
        }
    }
}
