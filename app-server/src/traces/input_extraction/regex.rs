//! Extraction-spec application and the spec cache.
//!
//! Regexes run on `fancy-regex`: the patterns are LLM-generated, and
//! while the prompt asks for simple constructs, the engine must accept
//! backreferences and lookarounds when the model produces them. A
//! backtrack limit bounds pathological patterns — hitting it degrades
//! to `NoMatch`, never hangs the worker.

use std::sync::Arc;

use fancy_regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};
use sha3::{Digest, Sha3_256};
use uuid::Uuid;

use super::generate::generate_extraction_spec;
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
/// Cap on a remove spec's pattern list. Written literally ("1-8") in the
/// generation prompt and tool schema — keep them in sync.
pub const MAX_REMOVE_PATTERNS: usize = 8;

// ---------------------------------------------------------------------------
// Extraction spec
// ---------------------------------------------------------------------------

/// What the generation pipeline produces and the cache stores: either one
/// pattern that KEEPS the instruction, or a list of patterns that REMOVE
/// every injected block so the instruction is what remains.
///
/// Untagged on purpose: `Keep` serializes as a bare JSON string —
/// byte-identical to the legacy cache format (a plain pattern string) —
/// so existing cache entries deserialize as `Keep` without a key bump,
/// and `Remove` as a JSON array.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ExtractionSpec {
    /// One pattern with exactly one capture group; group 1 is the
    /// instruction.
    Keep(String),
    /// Patterns with no capture groups; every match of every pattern is
    /// deleted and the trimmed remainder is the instruction.
    Remove(Vec<String>),
}

/// Structured `{mode, patterns}` rendering for span inputs and probe-tool
/// echoes — the untagged serde shape (bare string / bare array) is for the
/// cache, not for humans reading traces.
pub fn spec_to_json(spec: &ExtractionSpec) -> serde_json::Value {
    match spec {
        ExtractionSpec::Keep(pattern) => serde_json::json!({
            "mode": "keep",
            "patterns": [pattern],
        }),
        ExtractionSpec::Remove(patterns) => serde_json::json!({
            "mode": "remove",
            "patterns": patterns,
        }),
    }
}

/// Validate a candidate spec's patterns before probing or submitting:
/// keep needs exactly one capture group, remove patterns need none. The
/// error string is model-facing — it goes back as a tool response so the
/// model can self-correct.
pub fn validate_spec(spec: &ExtractionSpec) -> Result<(), String> {
    match spec {
        ExtractionSpec::Keep(pattern) => {
            let regex =
                build_regex(pattern).map_err(|e| format!("the pattern does not compile: {e}"))?;
            if regex.captures_len() != 2 {
                return Err(format!(
                    "keep mode requires exactly one capture group; the pattern has {}",
                    regex.captures_len() - 1
                ));
            }
            Ok(())
        }
        ExtractionSpec::Remove(patterns) => {
            if patterns.is_empty() {
                return Err(
                    "remove mode requires at least one pattern; to keep the whole \
                     message use keep mode with the passthrough pattern (?s)(.*)"
                        .to_string(),
                );
            }
            if patterns.len() > MAX_REMOVE_PATTERNS {
                return Err(format!(
                    "remove mode allows at most {MAX_REMOVE_PATTERNS} patterns; got {}",
                    patterns.len()
                ));
            }
            for (i, pattern) in patterns.iter().enumerate() {
                let regex = build_regex(pattern)
                    .map_err(|e| format!("pattern {i} does not compile: {e}"))?;
                if regex.captures_len() != 1 {
                    return Err(format!(
                        "remove patterns must have no capture groups (use (?:…) for \
                         grouping); pattern {i} has {}",
                        regex.captures_len() - 1
                    ));
                }
            }
            Ok(())
        }
    }
}

// ---------------------------------------------------------------------------
// Spec application
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ApplyRegexResult {
    /// The spec produced a non-empty (trimmed) instruction.
    Extracted(String),
    /// The spec applied but yielded only empty/whitespace — the input is
    /// pure scaffolding with no actual user request.
    NoUserRequest,
    /// The spec is stale or broken for this text: keep — no compile, no
    /// match, backtrack abort, or no capture group 1; remove — not a
    /// single pattern matched anything.
    NoMatch,
}

/// A spec application plus its remove-mode diagnostics. `patterns_matched`
/// is `Some` only for remove specs: per-pattern match counts, in pattern
/// order, surfaced to the generation model so a dead pattern is visible
/// even when the overall extraction looks right.
pub struct ApplySpecOutcome {
    pub result: ApplyRegexResult,
    pub patterns_matched: Option<Vec<usize>>,
}

fn build_regex(pattern: &str) -> Result<Regex, fancy_regex::Error> {
    RegexBuilder::new(pattern)
        .backtrack_limit(REGEX_BACKTRACK_LIMIT)
        .build()
}

/// Apply a keep pattern (e.g. `(?s).*</wrapper>\s*(.*)`) to the joined
/// user text and return the trimmed contents of the first capture group.
pub fn apply_regex(pattern: &str, text: &str) -> ApplyRegexResult {
    let regex = match build_regex(pattern) {
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

/// Delete every non-overlapping match of `regex` from `text`, returning
/// the remainder and the match count. `None` on a runtime abort
/// (backtrack limit) — the caller treats the pattern as matching nothing.
fn remove_all(regex: &Regex, text: &str) -> Option<(String, usize)> {
    let mut out = String::with_capacity(text.len());
    let mut last = 0;
    let mut count = 0;
    for m in regex.find_iter(text) {
        let m = m.ok()?;
        out.push_str(&text[last..m.start()]);
        last = m.end();
        count += 1;
    }
    out.push_str(&text[last..]);
    Some((out, count))
}

/// Apply remove patterns sequentially — each pattern runs against the
/// text already reduced by the previous ones — and return the trimmed
/// remainder. A pattern that doesn't compile or aborts counts as zero
/// matches. Staleness is all-or-nothing: `NoMatch` (→ cache eviction)
/// only when NOT A SINGLE pattern matched; with at least one match the
/// spec still fits the template, and the counts expose the dead patterns.
fn apply_remove(patterns: &[String], text: &str) -> (ApplyRegexResult, Vec<usize>) {
    let mut remaining = text.to_string();
    let mut counts = Vec::with_capacity(patterns.len());
    for pattern in patterns {
        let count = match build_regex(pattern) {
            Ok(regex) => match remove_all(&regex, &remaining) {
                Some((next, count)) => {
                    remaining = next;
                    count
                }
                None => 0,
            },
            Err(_) => 0,
        };
        counts.push(count);
    }
    if counts.iter().all(|&c| c == 0) {
        return (ApplyRegexResult::NoMatch, counts);
    }
    let trimmed = remaining.trim();
    let result = if trimmed.is_empty() {
        ApplyRegexResult::NoUserRequest
    } else {
        ApplyRegexResult::Extracted(trimmed.to_string())
    };
    (result, counts)
}

/// Apply an extraction spec to the joined user text.
pub fn apply_spec(spec: &ExtractionSpec, text: &str) -> ApplySpecOutcome {
    match spec {
        ExtractionSpec::Keep(pattern) => ApplySpecOutcome {
            result: apply_regex(pattern, text),
            patterns_matched: None,
        },
        ExtractionSpec::Remove(patterns) => {
            let (result, counts) = apply_remove(patterns, text);
            ApplySpecOutcome {
                result,
                patterns_matched: Some(counts),
            }
        }
    }
}

/// Render an application as the FINAL user-visible outcome: the extracted
/// text is signpost-stripped exactly like the stored metadata
/// (`build_metadata_patch` applies the same strip). Serves both as the
/// probe-tool response shown to the generation model and as the tool-span
/// output, so what the model judges is what the user gets. Remove
/// outcomes carry the per-pattern match counts.
pub fn apply_outcome_to_json(outcome: &ApplySpecOutcome) -> serde_json::Value {
    let is_remove = outcome.patterns_matched.is_some();
    let mut json = match &outcome.result {
        ApplyRegexResult::Extracted(text) => serde_json::json!({
            "result": "extracted",
            "user_task": split_signposts_and_rejoin(text),
        }),
        ApplyRegexResult::NoUserRequest => serde_json::json!({
            "result": "no_user_request",
            "detail": if is_remove {
                "nothing remains after removing the matches — the message is scaffolding only"
            } else {
                "the regex matched but capture group 1 is empty/whitespace-only"
            },
        }),
        ApplyRegexResult::NoMatch => serde_json::json!({
            "result": "no_match",
            "detail": if is_remove {
                "not a single pattern matched anything in the message"
            } else {
                "the regex did not compile, did not match, or had no capture group 1"
            },
        }),
    };
    if let Some(counts) = &outcome.patterns_matched {
        json["patterns_matched"] = serde_json::json!(counts);
    }
    json
}

/// Apply a spec and trace the application as an `apply_regex` tool span —
/// the one authoritative application whose result becomes the metadata
/// patch, whether the spec came from the cache or was freshly generated
/// (the generation loop's probe applications are traced under the probe
/// tool name instead). `cached` is stamped on the span so the two sources
/// stay distinguishable.
fn apply_spec_traced(
    spec: &ExtractionSpec,
    text: &str,
    cached: bool,
    tracing: Option<&SpanScope>,
) -> ApplyRegexResult {
    let span = tracing.map(|scope| {
        SpanBuilder::tool(scope, "apply_regex")
            .input(&spec_to_json(spec))
            .build()
    });
    let outcome = apply_spec(spec, text);
    if let Some(span) = span.as_ref() {
        self_tracing::set_attr_str(
            span,
            "user_task.regex_cached",
            if cached { "true" } else { "false" },
        );
        self_tracing::set_output(span, &apply_outcome_to_json(&outcome));
    }
    outcome.result
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

/// Consult the spec cache and apply on hit. `None` means "no usable
/// cached spec" — either a true miss or a stale entry (keep no longer
/// matches; remove has zero matching patterns), removed so the consumer
/// regenerates. `tracing` must stay `None` on the producer (ingest)
/// path — see `self_tracing`.
pub async fn try_apply_cached_regex(
    cache: &Arc<Cache>,
    key: &str,
    signposted_text: &str,
    tracing: Option<&SpanScope>,
) -> Option<ApplyRegexResult> {
    let cached = cache.get::<ExtractionSpec>(key).await.ok().flatten()?;
    match apply_spec_traced(&cached, signposted_text, true, tracing) {
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

/// Generate a fresh spec from the signposted text, apply it, and persist
/// it unless the result was `NoMatch` (a spec wrong for its own sample is
/// not worth caching). Errors only on transport failure (timeout /
/// provider error) so the consumer can requeue as transient. A deliberate
/// empty submit from the model ("no valid pattern can be produced") is
/// terminal, not retryable: it maps to `NoUserRequest` (→ not-found
/// patch) so the message finishes instead of looping through an LLM call
/// per requeue. Nothing is cached for it — a later trace of the same
/// shape gets a fresh chance at a real spec.
pub async fn generate_and_apply_regex(
    cache: &Arc<Cache>,
    llm_client: &Arc<LlmClient>,
    key: &str,
    signposted_text: &str,
    tracing: Option<&SpanScope>,
) -> anyhow::Result<ApplyRegexResult> {
    let Some(generated) = generate_extraction_spec(llm_client, signposted_text, tracing).await?
    else {
        return Ok(ApplyRegexResult::NoUserRequest);
    };
    let result = apply_spec_traced(&generated, signposted_text, false, tracing);
    if !matches!(result, ApplyRegexResult::NoMatch) {
        let _ = cache
            .insert_with_ttl(key, generated, REGEX_CACHE_TTL_SECONDS)
            .await;
    }
    Ok(result)
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

    // ---- apply_spec: remove mode ---------------------------------------------

    #[test]
    fn apply_remove_deletes_all_matches_and_trims() {
        let text = "<env>a</env>\nreal ask\n<env>b</env>\n<meta>m</meta>";
        let spec = ExtractionSpec::Remove(vec![
            r"(?s)<env>.*?</env>".to_string(),
            r"(?s)<meta>.*?</meta>".to_string(),
        ]);
        let outcome = apply_spec(&spec, text);
        assert_eq!(
            outcome.result,
            ApplyRegexResult::Extracted("real ask".to_string())
        );
        assert_eq!(outcome.patterns_matched, Some(vec![2, 1]));
    }

    #[test]
    fn apply_remove_partial_match_is_not_stale() {
        // One dead pattern doesn't evict the spec: the other still fits
        // the template, and the counts expose the dead one.
        let spec = ExtractionSpec::Remove(vec![
            r"(?s)<env>.*?</env>".to_string(),
            r"(?s)<gone>.*?</gone>".to_string(),
        ]);
        let outcome = apply_spec(&spec, "<env>x</env>\ndo it");
        assert_eq!(
            outcome.result,
            ApplyRegexResult::Extracted("do it".to_string())
        );
        assert_eq!(outcome.patterns_matched, Some(vec![1, 0]));
    }

    #[test]
    fn apply_remove_zero_matches_is_no_match() {
        let spec = ExtractionSpec::Remove(vec![r"(?s)<env>.*?</env>".to_string()]);
        let outcome = apply_spec(&spec, "plain text, no tags");
        assert_eq!(outcome.result, ApplyRegexResult::NoMatch);
        assert_eq!(outcome.patterns_matched, Some(vec![0]));
    }

    #[test]
    fn apply_remove_everything_removed_is_no_user_request() {
        let spec = ExtractionSpec::Remove(vec![r"(?s)<env>.*?</env>".to_string()]);
        let outcome = apply_spec(&spec, "<env>x</env>\n  <env>y</env>  ");
        assert_eq!(outcome.result, ApplyRegexResult::NoUserRequest);
        assert_eq!(outcome.patterns_matched, Some(vec![2]));
    }

    #[test]
    fn apply_remove_invalid_pattern_counts_as_zero_matches() {
        let spec =
            ExtractionSpec::Remove(vec![r"((".to_string(), r"(?s)<env>.*?</env>".to_string()]);
        let outcome = apply_spec(&spec, "<env>x</env>\ntask");
        assert_eq!(
            outcome.result,
            ApplyRegexResult::Extracted("task".to_string())
        );
        assert_eq!(outcome.patterns_matched, Some(vec![0, 1]));
    }

    #[test]
    fn apply_remove_patterns_run_sequentially_on_reduced_text() {
        // The second pattern's delimiters only become adjacent after the
        // first pattern removes the block between them.
        let spec = ExtractionSpec::Remove(vec![
            r"(?s)<inner>.*?</inner>".to_string(),
            r"(?s)<outer>\s*</outer>".to_string(),
        ]);
        let outcome = apply_spec(&spec, "<outer> <inner>x</inner> </outer>\nask");
        assert_eq!(
            outcome.result,
            ApplyRegexResult::Extracted("ask".to_string())
        );
        assert_eq!(outcome.patterns_matched, Some(vec![1, 1]));
    }

    // ---- ExtractionSpec serde --------------------------------------------------

    #[test]
    fn spec_legacy_plain_string_deserializes_as_keep() {
        // Pre-spec cache entries are bare JSON strings; they must load as
        // Keep without a cache-key bump.
        let legacy = serde_json::to_vec(&"(?s)(.*)").unwrap();
        let spec: ExtractionSpec = serde_json::from_slice(&legacy).unwrap();
        assert_eq!(spec, ExtractionSpec::Keep("(?s)(.*)".to_string()));
        // And Keep round-trips back to the bare string.
        assert_eq!(
            serde_json::to_string(&spec).unwrap(),
            "\"(?s)(.*)\"".to_string()
        );
    }

    #[test]
    fn spec_remove_round_trips_as_array() {
        let spec = ExtractionSpec::Remove(vec!["a".to_string(), "b".to_string()]);
        let json = serde_json::to_string(&spec).unwrap();
        assert_eq!(json, r#"["a","b"]"#);
        assert_eq!(serde_json::from_str::<ExtractionSpec>(&json).unwrap(), spec);
    }

    // ---- validate_spec -----------------------------------------------------------

    #[test]
    fn validate_spec_keep_requires_exactly_one_group() {
        assert!(validate_spec(&ExtractionSpec::Keep(r"(?s)(.*)".to_string())).is_ok());
        assert!(validate_spec(&ExtractionSpec::Keep(r"(?s).*".to_string())).is_err());
        assert!(validate_spec(&ExtractionSpec::Keep(r"(?s)(a)(b)".to_string())).is_err());
        assert!(validate_spec(&ExtractionSpec::Keep(r"((".to_string())).is_err());
    }

    #[test]
    fn validate_spec_remove_requires_no_groups() {
        assert!(
            validate_spec(&ExtractionSpec::Remove(vec![
                r"(?s)<env>.*?</env>".to_string(),
                r"(?s)(?:<a>|<b>).*?</x>".to_string(),
            ]))
            .is_ok()
        );
        assert!(
            validate_spec(&ExtractionSpec::Remove(vec![
                r"(?s)<env>(.*?)</env>".to_string()
            ]))
            .is_err()
        );
        assert!(validate_spec(&ExtractionSpec::Remove(vec![])).is_err());
        assert!(
            validate_spec(&ExtractionSpec::Remove(vec![
                r"a".to_string();
                MAX_REMOVE_PATTERNS + 1
            ]))
            .is_err()
        );
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
