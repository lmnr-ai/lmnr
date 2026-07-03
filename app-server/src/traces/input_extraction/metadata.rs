//! Mapping an extraction outcome onto the trace-metadata patch.

use std::collections::HashMap;

use serde_json::Value;

use super::input::split_signposts_and_rejoin;
use super::regex::ApplyRegexResult;

pub const USER_TASK_METADATA_KEY: &str = "lmnr_user_task";
/// Written instead of `lmnr_user_task` when extraction ran but found no
/// user request (regex says scaffolding-only, or didn't match) —
/// distinguishes "ran and found nothing" from "never ran".
pub const USER_TASK_NOT_FOUND_METADATA_KEY: &str = "lmnr_user_task_not_found";

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
