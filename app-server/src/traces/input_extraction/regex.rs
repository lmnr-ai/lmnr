//! Regex application and the regex cache.
//!
//! Regexes run on `fancy-regex`: the patterns are LLM-generated, and
//! while the prompt asks for simple constructs, the engine must accept
//! backreferences and lookarounds when the model produces them. A
//! backtrack limit bounds pathological patterns — hitting it degrades
//! to `NoMatch`, never hangs the worker.

use std::sync::Arc;

use fancy_regex::RegexBuilder;
use sha3::{Digest, Sha3_256};
use uuid::Uuid;

use super::generate::{GenerationVerdict, generate_extraction_regex};
use super::input::split_signposts_and_rejoin;
use super::self_tracing::{self, SpanBuilder, SpanScope};
use crate::cache::keys::{USER_TASK_REGEX_CACHE_KEY, USER_TASK_VERSION_REGEX_CACHE_KEY};
use crate::cache::{Cache, CacheTrait};
use crate::llm::LlmClient;

const REGEX_CACHE_TTL_SECONDS: u64 = 7 * 24 * 60 * 60;
/// Backtracking budget per regex application. LLM-generated patterns can
/// backtrack heavily on large inputs; exceeding the budget aborts the
/// match (treated as `NoMatch`) instead of burning CPU indefinitely.
const REGEX_BACKTRACK_LIMIT: usize = 1_000_000;

// ---------------------------------------------------------------------------
// Regex application
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ApplyRegexResult {
    /// Regex matched and the (trimmed) capture group is non-empty.
    Extracted(String),
    /// Regex matched but the capture is empty/whitespace-only — the
    /// input is pure scaffolding with no actual user request.
    NoUserRequest,
    /// Regex did not compile, did not match, exceeded the backtrack
    /// budget, or had no capture group 1.
    NoMatch,
}

/// Apply an LLM-generated pattern (e.g. `(?s).*</wrapper>\s*(.*)`) to
/// the joined user text and return the trimmed contents of the first
/// capture group.
pub fn apply_regex(pattern: &str, text: &str) -> ApplyRegexResult {
    let regex = match RegexBuilder::new(pattern)
        .backtrack_limit(REGEX_BACKTRACK_LIMIT)
        .build()
    {
        Ok(r) => r,
        Err(_) => return ApplyRegexResult::NoMatch,
    };
    let captured = match regex.captures(text) {
        Ok(Some(captures)) => match captures.get(1) {
            Some(m) => m.as_str(),
            None => return ApplyRegexResult::NoMatch,
        },
        // `Err` here is a runtime abort (backtrack limit) — same outcome
        // as not matching.
        Ok(None) | Err(_) => return ApplyRegexResult::NoMatch,
    };
    let trimmed = captured.trim();
    if trimmed.is_empty() {
        ApplyRegexResult::NoUserRequest
    } else {
        ApplyRegexResult::Extracted(trimmed.to_string())
    }
}

/// Final outcome of a generation run plus the facts the consumer stamps
/// as trace-level metadata flags on its root span.
pub struct ExtractionOutcome {
    pub result: ApplyRegexResult,
    /// The pattern whose application produced `result`.
    pub pattern: String,
    /// The generation loop exhausted its call budget without an accepted
    /// submit and `result` came from the passthrough fallback.
    pub budget_exhausted: bool,
    /// LLM generation failed outright (transient-retry budget exhausted
    /// or a non-retryable provider error) and `result` came from the
    /// passthrough fallback.
    pub llm_failed: bool,
}

/// The capture-everything passthrough the prompt prescribes when no
/// reliable static anchor exists. Also the fallback applied when the
/// generation loop exhausts its call budget without a verdict.
pub const PASSTHROUGH_REGEX: &str = "(?s)(.*)";

/// Whether a pattern is the capture-everything passthrough (`(?s)(.*)`,
/// modulo optional `^`/`$` anchors).
pub fn is_passthrough_regex(pattern: &str) -> bool {
    let p = pattern.trim();
    let p = p.strip_prefix("(?s)").unwrap_or(p);
    let p = p.strip_prefix('^').unwrap_or(p);
    let p = p.strip_suffix('$').unwrap_or(p);
    p == "(.*)"
}

/// Render an application result as the FINAL user-visible outcome: the
/// extracted text is signpost-stripped exactly like the stored metadata
/// (`extraction_outcome_value` applies the same strip). Serves both as the
/// probe-tool response shown to the generation model and as the tool-span
/// output, so what the model judges is what the user gets.
pub fn apply_result_to_json(result: &ApplyRegexResult) -> serde_json::Value {
    match result {
        ApplyRegexResult::Extracted(text) => serde_json::json!({
            "result": "extracted",
            "user_task": split_signposts_and_rejoin(text),
        }),
        ApplyRegexResult::NoUserRequest => serde_json::json!({
            "result": "no_user_request",
            "detail": "the regex matched but capture group 1 is empty/whitespace-only",
        }),
        ApplyRegexResult::NoMatch => serde_json::json!({
            "result": "no_match",
            "detail": "the regex did not compile, did not match, or had no capture group 1",
        }),
    }
}

/// Apply a pattern and emit a single info span for the application to
/// the external observability backend (currently Sentry). Default
/// `target` routes the span to the external OTEL layer only — never the
/// `lmnr::internal` tree (the two providers carry disjoint filters, see
/// `instrumentation/mod.rs`). Covers every authoritative application
/// (cached and freshly generated); the generation loop's probe
/// applications are not "applications" in this sense and stay untraced
/// here.
fn apply_regex_externally_traced(
    pattern: &str,
    text: &str,
    project_id: Uuid,
    trace_id: Uuid,
    from_cache: bool,
) -> ApplyRegexResult {
    let external_observability_span = tracing::info_span!(
        "user_task.apply_regex",
        project_id = %project_id,
        trace_id = %trace_id,
        regex = pattern,
        regex_from_cache = from_cache,
        passthrough_regex = is_passthrough_regex(pattern),
        success = tracing::field::Empty,
    );
    let result = external_observability_span.in_scope(|| apply_regex(pattern, text));
    // Success mirrors the trace-metadata `regex_failed` flag: `NoMatch`
    // (no compile / no match / backtrack abort / no group 1) is the only
    // failure; an empty capture (`NoUserRequest`) is a working regex.
    external_observability_span.record("success", !matches!(result, ApplyRegexResult::NoMatch));
    result
}

/// Apply a freshly generated pattern and trace the application as an
/// `apply_regex` tool span — the one authoritative application whose
/// result becomes the metadata patch (the generation loop's probe
/// applications are traced under the probe tool name instead). Cached
/// regexes skip the internal tool span ([`try_apply_cached_regex`]);
/// both paths emit the external-observability application span.
fn apply_regex_traced(pattern: &str, text: &str, scope: &SpanScope) -> ApplyRegexResult {
    let span = SpanBuilder::tool(scope, "apply_regex")
        .input(&serde_json::json!({ "regex": pattern }))
        .build();
    let result = apply_regex_externally_traced(
        pattern,
        text,
        scope.source_project_id,
        scope.trace_id,
        false,
    );
    self_tracing::set_output(&span, &apply_result_to_json(&result));
    result
}

// ---------------------------------------------------------------------------
// Regex cache
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

/// Version-keyed regex cache key. The prompt VERSION replaces the user-message
/// tag fingerprint, so a change to the system prompt's static part — not the
/// noisier variation in the user message's tag set — is what regenerates the
/// regex. `agent_hash` stays in the key because `version_hash` is only 32 bits
/// (`sp_versioning::similarity::version_hash` truncates to 8 hex chars), and
/// `has_history` stays because a first turn and a follow-up carry different
/// layouts.
pub fn versioned_regex_cache_key(
    project_id: Uuid,
    agent_hash: &str,
    version_hash: &str,
    has_history: bool,
) -> String {
    let history = if has_history { "h" } else { "n" };
    format!(
        "{USER_TASK_VERSION_REGEX_CACHE_KEY}:{project_id}:{agent_hash}:{version_hash}:{history}"
    )
}

/// The regex cache lookup a candidate resolves to.
pub enum RegexTarget {
    /// A key that may hold a regex. `version` is `Some` on the version-keyed
    /// path and `None` for the legacy buckets.
    Keyed {
        key: String,
        version: Option<String>,
    },
    /// The prompt has no live version, so nothing can be cached against it and
    /// extraction is a one-shot direct LLM call.
    Unversioned,
}

/// Pick the cache key for a candidate. With `VersionedInputExtraction` off this
/// is always the legacy agent-hash + tag-fingerprint key.
///
/// With it on there are three cases, and the middle one is the reason this
/// returns an enum: a span with NO system message can never have a version, so
/// it keeps the legacy keying permanently rather than paying an LLM call every
/// trace forever; a span whose version simply hasn't been minted yet gets no key
/// at all, because the two keyings hold regexes generated under different
/// cohort definitions and must never read each other's entries.
pub fn regex_target(
    project_id: Uuid,
    agent_hash: Option<&str>,
    version_hash: Option<&str>,
    fingerprint: &str,
    has_history: bool,
) -> RegexTarget {
    let legacy = || RegexTarget::Keyed {
        key: regex_cache_key(project_id, agent_hash, fingerprint),
        version: None,
    };
    if !crate::features::is_feature_enabled(crate::features::Feature::VersionedInputExtraction) {
        return legacy();
    }
    match (agent_hash, version_hash) {
        (Some(agent), Some(version)) => RegexTarget::Keyed {
            key: versioned_regex_cache_key(project_id, agent, version, has_history),
            version: Some(version.to_string()),
        },
        (None, _) => RegexTarget::Keyed {
            key: regex_cache_key(project_id, None, fingerprint),
            version: None,
        },
        (Some(_), None) => RegexTarget::Unversioned,
    }
}

/// How a candidate's extraction was resolved. Recorded per candidate so the
/// fallback rate — the health metric for version-keyed extraction — is
/// queryable. There is deliberately no `Stale` variant: a cached regex that
/// stopped matching already shows up as `regex_from_cache=true` with
/// `success=false` on the application span below.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Resolution {
    /// A cached regex for the resolved version was applied.
    Cached,
    /// The version resolved but carried no regex yet, so a direct LLM
    /// extraction ran. Should trend to zero as cohorts accumulate samples.
    Fallback,
    /// No live version for this prompt — a cold-start agent, or an LLM span with
    /// no system message at all (permanent for those).
    NoVersion,
}

impl Resolution {
    fn as_str(self) -> &'static str {
        match self {
            Resolution::Cached => "cached",
            Resolution::Fallback => "fallback",
            Resolution::NoVersion => "no_version",
        }
    }
}

/// Emit the per-candidate resolution to the external observability backend.
/// Default `target` keeps it out of the `lmnr::internal` tree, so it is safe on
/// the ingest path (see [`apply_regex_externally_traced`]).
pub fn record_resolution(
    resolution: Resolution,
    project_id: Uuid,
    trace_id: Uuid,
    version_hash: Option<&str>,
    has_history: bool,
) {
    tracing::info_span!(
        "user_task.resolve",
        project_id = %project_id,
        trace_id = %trace_id,
        resolution = resolution.as_str(),
        version_hash = version_hash.unwrap_or(""),
        has_history,
    );
}

/// Consult the regex cache and apply on hit. `None` means "no
/// usable cached regex" — either a true miss or a stale entry that no
/// longer matches (removed so the consumer regenerates). Emits no
/// internal (`lmnr::internal`) spans — self-tracing only follows actual
/// LLM generation runs — but every application, hit or stale, emits the
/// external-observability application span.
pub async fn try_apply_cached_regex(
    cache: &Arc<Cache>,
    key: &str,
    signposted_text: &str,
    project_id: Uuid,
    trace_id: Uuid,
) -> Option<ApplyRegexResult> {
    let cached = cache.get::<String>(key).await.ok().flatten()?;
    match apply_regex_externally_traced(&cached, signposted_text, project_id, trace_id, true) {
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
/// own sample is not worth caching). Infallible by design: the message
/// finishes on the first pass instead of looping through an LLM call
/// per requeue. Every no-pattern ending falls back to the passthrough
/// regex — the full reconstructed input beats a wrong empty value:
/// - an exhausted call budget means the model never delivered an
///   accepted submit;
/// - an LLM failure (per-call retry budget exhausted or a non-retryable
///   provider error) means generation never finished.
///
/// Neither fallback caches anything — a later trace of the same shape
/// gets a fresh chance at a real regex.
pub async fn generate_and_apply_regex(
    cache: &Arc<Cache>,
    llm_client: &Arc<LlmClient>,
    key: &str,
    signposted_text: &str,
    scope: &SpanScope,
) -> ExtractionOutcome {
    let generated = match generate_extraction_regex(llm_client, signposted_text, scope).await {
        Ok(GenerationVerdict::Pattern(pattern)) => pattern,
        Ok(GenerationVerdict::Exhausted) => {
            return ExtractionOutcome {
                result: apply_regex_traced(PASSTHROUGH_REGEX, signposted_text, scope),
                pattern: PASSTHROUGH_REGEX.to_string(),
                budget_exhausted: true,
                llm_failed: false,
            };
        }
        Err(e) => {
            log::error!("user-task: regex generation failed, falling back to passthrough: {e:?}");
            return ExtractionOutcome {
                result: apply_regex_traced(PASSTHROUGH_REGEX, signposted_text, scope),
                pattern: PASSTHROUGH_REGEX.to_string(),
                budget_exhausted: false,
                llm_failed: true,
            };
        }
    };
    let result = apply_regex_traced(&generated, signposted_text, scope);
    if !matches!(result, ApplyRegexResult::NoMatch) {
        let _ = cache
            .insert_with_ttl(key, &generated, REGEX_CACHE_TTL_SECONDS)
            .await;
    }
    ExtractionOutcome {
        result,
        pattern: generated,
        budget_exhausted: false,
        llm_failed: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---- apply_regex --------------------------------------------------------

    /// The two keyings must never collide: a version-keyed entry and a legacy
    /// entry for the same agent hold regexes generated under different cohort
    /// definitions.
    #[test]
    fn version_and_legacy_keys_never_collide() {
        let project_id = Uuid::new_v4();
        let versioned = versioned_regex_cache_key(project_id, "agent01", "deadbeef", false);
        let legacy = regex_cache_key(project_id, Some("agent01"), "plain");
        assert_ne!(versioned, legacy);
        assert!(versioned.starts_with(USER_TASK_VERSION_REGEX_CACHE_KEY));
        assert!(legacy.starts_with(USER_TASK_REGEX_CACHE_KEY));
    }

    #[test]
    fn version_key_forks_on_every_component() {
        let project_id = Uuid::new_v4();
        let base = versioned_regex_cache_key(project_id, "agent01", "deadbeef", false);
        // has_history: a first turn and a follow-up carry different layouts.
        assert_ne!(
            base,
            versioned_regex_cache_key(project_id, "agent01", "deadbeef", true)
        );
        // A new version is the whole point — it regenerates the regex.
        assert_ne!(
            base,
            versioned_regex_cache_key(project_id, "agent01", "cafebabe", false)
        );
        // The agent hash is in the key because `version_hash` is only 32 bits.
        assert_ne!(
            base,
            versioned_regex_cache_key(project_id, "agent02", "deadbeef", false)
        );
        assert_ne!(
            base,
            versioned_regex_cache_key(Uuid::new_v4(), "agent01", "deadbeef", false)
        );
    }

    #[test]
    fn apply_regex_extracts_capture_group_one() {
        assert_eq!(
            apply_regex(r"(?s).*</env>\s*(.*)", "<env>x</env>\n  do the thing  "),
            ApplyRegexResult::Extracted("do the thing".to_string())
        );
    }

    #[test]
    fn apply_regex_empty_capture_is_no_user_request() {
        assert_eq!(
            apply_regex(r"(?s).*</env>\s*(.*)", "<env>x</env>   "),
            ApplyRegexResult::NoUserRequest
        );
        assert_eq!(
            apply_regex(r"(?s)()", "<env>x</env>"),
            ApplyRegexResult::NoUserRequest
        );
    }

    #[test]
    fn apply_regex_no_match_cases() {
        // No match at all.
        assert_eq!(
            apply_regex(r"(?s)^(.*?)<wrapper>", "no wrapper here"),
            ApplyRegexResult::NoMatch
        );
        // Invalid pattern.
        assert_eq!(apply_regex(r"(?s)((", "text"), ApplyRegexResult::NoMatch);
        // No capture group 1.
        assert_eq!(apply_regex(r"(?s).*", "text"), ApplyRegexResult::NoMatch);
    }

    #[test]
    fn apply_regex_supports_backreferences_and_lookarounds() {
        // Named group + backreference pairs the closing tag with the
        // opening one; the instruction stays capture group 1.
        assert_eq!(
            apply_regex(
                r"(?s)^(?:<(?<t>\w+)>.*?</\k<t>>\s*)+(.*)",
                "<ctx>a</ctx>\n<ctx>b</ctx>\nreal ask"
            ),
            // Group 1 is the named `t` group ("ctx") — the point is that
            // the engine accepts the syntax and matches; the group-1
            // contract is the prompt's job.
            ApplyRegexResult::Extracted("ctx".to_string())
        );
        // Lookahead: capture everything before the trailing wrapper.
        assert_eq!(
            apply_regex(r"(?s)^(.*?)(?=<footer>)", "the task<footer>f</footer>"),
            ApplyRegexResult::Extracted("the task".to_string())
        );
    }

    #[test]
    fn apply_regex_backtrack_limit_degrades_to_no_match() {
        // Classic catastrophic backtracking: nested quantifiers against a
        // non-matching tail. Must return NoMatch, not hang.
        let text = format!("{}!", "a".repeat(60));
        assert_eq!(
            apply_regex(r"(?s)^(?:a+)+b(.*)", &text),
            ApplyRegexResult::NoMatch
        );
    }

    // ---- is_passthrough_regex -------------------------------------------------

    #[test]
    fn passthrough_regex_detection() {
        assert!(is_passthrough_regex("(?s)(.*)"));
        assert!(is_passthrough_regex("(?s)^(.*)$"));
        assert!(is_passthrough_regex("(.*)"));
        assert!(is_passthrough_regex("  (?s)(.*)  "));
        assert!(!is_passthrough_regex(r"(?s).*</env>\s*(.*)"));
        assert!(!is_passthrough_regex("(?s)(.*?)"));
        assert!(!is_passthrough_regex("(?s)()"));
    }

    // ---- regex_cache_key ------------------------------------------------------

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

    /// LAM-2049 end-to-end: the key is built from the system prompt's
    /// FIRST-SENTENCE hash, so permuting the system prompt's XML
    /// scaffolding must not re-trigger user-regex generation.
    #[test]
    fn regex_cache_key_survives_system_prompt_tag_permutations() {
        use crate::traces::prompt_hash::prompt_hashes;

        let pid = Uuid::nil();
        let sp_a = "You are an AI agent for testing.\n<alpha>x</alpha>";
        let sp_b = "You are an AI agent for testing.\n<gamma>z</gamma><beta>y</beta>";
        let key_for = |sp: &str| {
            regex_cache_key(
                pid,
                Some(&prompt_hashes(sp).first_sentence),
                "plain,env,/env",
            )
        };
        assert_eq!(key_for(sp_a), key_for(sp_b));
        // A genuinely different agent still gets its own key.
        assert_ne!(
            key_for(sp_a),
            key_for("You are Claude Code, an AI coding assistant.\n<alpha>x</alpha>")
        );
    }
}
