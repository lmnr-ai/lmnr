//! Mapping an extraction outcome onto the trace-input value.

use serde_json::Value;

use super::input::split_signposts_and_rejoin;
use super::regex::ApplyRegexResult;

/// The extracted user task string, or an empty string when extraction ran
/// and found no user request (regex says scaffolding-only, or didn't
/// match) — "never ran" is the key being absent.
pub const USER_TASK_METADATA_KEY: &str = "lmnr_user_task";

/// The extracted trace output (the agent's final answer). Written by the
/// inline output pass; no LLM/regex — the latest toolless assistant text
/// from the shallowest LLM span.
pub const TRACE_OUTPUT_METADATA_KEY: &str = "lmnr_trace_output";

/// Map an extraction outcome onto the raw trace-input value (fed to
/// `publish_trace_input_update`). Extracted text is signpost-split and
/// re-joined; no-result outcomes never fall back to raw text — they
/// write an empty string. A later winner always overwrites a superseded
/// earlier winner's value.
pub fn extraction_outcome_value(result: &ApplyRegexResult) -> Value {
    match result {
        ApplyRegexResult::Extracted(text) => Value::String(split_signposts_and_rejoin(text)),
        ApplyRegexResult::NoUserRequest | ApplyRegexResult::NoMatch => Value::String(String::new()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracted_outcome_writes_rejoined_text() {
        let result = ApplyRegexResult::Extracted(
            "part a\n\n== lmnr_part_separator ==\n\npart b".to_string(),
        );
        assert_eq!(
            extraction_outcome_value(&result),
            Value::String("part a\n\npart b".to_string())
        );
    }

    #[test]
    fn no_result_outcomes_write_empty_string() {
        for result in [ApplyRegexResult::NoUserRequest, ApplyRegexResult::NoMatch] {
            // A superseding winner's empty string overwrites an earlier
            // task string (and vice versa).
            assert_eq!(
                extraction_outcome_value(&result),
                Value::String(String::new())
            );
        }
    }
}
