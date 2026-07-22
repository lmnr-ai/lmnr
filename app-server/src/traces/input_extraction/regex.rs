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
use crate::cache::keys::USER_TASK_REGEX_CACHE_KEY;
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
}
