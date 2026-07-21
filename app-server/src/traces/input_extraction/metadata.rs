//! Mapping an extraction outcome onto the trace-metadata patch.

use std::collections::HashMap;

use serde_json::Value;

use super::input::split_signposts_and_rejoin;
use super::regex::ApplyRegexResult;

/// The extracted user task string, or `false` when extraction ran and
/// found no user request (regex says scaffolding-only, or didn't match)
/// — distinguishes "ran and found nothing" from "never ran" (key absent).
pub const USER_TASK_METADATA_KEY: &str = "lmnr_user_task";

/// The trace's final output: latest toolless assistant text of the
/// shallowest (main-agent) spine. String only — no `false` sentinel; a
/// trace with no qualifying assistant text just has no key.
pub const TRACE_OUTPUT_METADATA_KEY: &str = "lmnr_trace_output";

/// Map an extraction outcome onto the trace-metadata patch. Extracted
/// text is signpost-split and re-joined; no-result outcomes never fall
/// back to raw text — they write `false`. Trace metadata merges with
/// JSONB `||` (additive — keys are overwritten but never removed);
/// because every outcome writes the SAME key, a later winner always
/// overwrites a superseded earlier winner's value, string or `false`.
pub fn build_metadata_patch(result: &ApplyRegexResult) -> HashMap<String, Value> {
    let value = match result {
        ApplyRegexResult::Extracted(text) => Value::String(split_signposts_and_rejoin(text)),
        ApplyRegexResult::NoUserRequest | ApplyRegexResult::NoMatch => Value::Bool(false),
    };
    HashMap::from([(USER_TASK_METADATA_KEY.to_string(), value)])
}

#[cfg(test)]
mod tests {
    use super::*;

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
        assert_eq!(patch.len(), 1);
    }

    #[test]
    fn no_result_outcomes_write_false() {
        for result in [ApplyRegexResult::NoUserRequest, ApplyRegexResult::NoMatch] {
            let patch = build_metadata_patch(&result);
            // Same key as success — JSONB || can only overwrite, so a
            // superseding winner's `false` replaces an earlier task string
            // (and vice versa) without null tricks.
            assert_eq!(patch.get(USER_TASK_METADATA_KEY), Some(&Value::Bool(false)));
            assert_eq!(patch.len(), 1);
        }
    }
}
