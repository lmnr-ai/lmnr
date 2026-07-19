//! Mapping an extraction outcome onto the trace-metadata patch.

use std::collections::HashMap;

use serde_json::Value;
use uuid::Uuid;

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

/// Per-subagent keys, namespaced under `lmnr.internal.` and suffixed
/// with the locator span's bare dashed UUID. Each full dotted string is
/// one independent top-level JSONB key under `||` merge, so each
/// subagent's slot overwrites independently.
pub const SUBAGENT_INPUT_METADATA_KEY_PREFIX: &str = "lmnr.internal.lmnr_subagent_input";
pub const SUBAGENT_OUTPUT_METADATA_KEY_PREFIX: &str = "lmnr.internal.lmnr_subagent_output";
/// Dot-joined name-path down to the locator, published alongside every
/// winning subagent-input patch as a display label.
pub const SUBAGENT_PATH_METADATA_KEY_PREFIX: &str = "lmnr.internal.lmnr_subagent_path";

pub fn subagent_input_metadata_key(locator: Uuid) -> String {
    format!("{SUBAGENT_INPUT_METADATA_KEY_PREFIX}.{locator}")
}

pub fn subagent_output_metadata_key(locator: Uuid) -> String {
    format!("{SUBAGENT_OUTPUT_METADATA_KEY_PREFIX}.{locator}")
}

pub fn subagent_path_metadata_key(locator: Uuid) -> String {
    format!("{SUBAGENT_PATH_METADATA_KEY_PREFIX}.{locator}")
}

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

/// Subagent-input patch: same string-or-`false` semantics as the main
/// task under `lmnr.internal.lmnr_subagent_input.<uuid>`, plus the
/// display label under `lmnr.internal.lmnr_subagent_path.<uuid>` (LWW
/// alongside every winning patch).
pub fn build_subagent_metadata_patch(
    result: &ApplyRegexResult,
    locator: Uuid,
    label: &str,
) -> HashMap<String, Value> {
    let value = match result {
        ApplyRegexResult::Extracted(text) => Value::String(split_signposts_and_rejoin(text)),
        ApplyRegexResult::NoUserRequest | ApplyRegexResult::NoMatch => Value::Bool(false),
    };
    HashMap::from([
        (subagent_input_metadata_key(locator), value),
        (
            subagent_path_metadata_key(locator),
            Value::String(label.to_string()),
        ),
    ])
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

    #[test]
    fn subagent_patch_writes_input_and_path_keys() {
        let locator = Uuid::parse_str("00000000-0000-0000-d2c3-61d0ea548a38").unwrap();
        let result = ApplyRegexResult::Extracted("task".to_string());
        let patch = build_subagent_metadata_patch(&result, locator, "agent.tool_call");
        assert_eq!(
            patch.get(&format!("lmnr.internal.lmnr_subagent_input.{locator}")),
            Some(&Value::String("task".to_string()))
        );
        assert_eq!(
            patch.get(&format!("lmnr.internal.lmnr_subagent_path.{locator}")),
            Some(&Value::String("agent.tool_call".to_string()))
        );
        assert_eq!(patch.len(), 2);
        // No-result outcomes write `false` but still stamp the label.
        let patch = build_subagent_metadata_patch(&ApplyRegexResult::NoMatch, locator, "a.b");
        assert_eq!(
            patch.get(&format!("lmnr.internal.lmnr_subagent_input.{locator}")),
            Some(&Value::Bool(false))
        );
    }
}
