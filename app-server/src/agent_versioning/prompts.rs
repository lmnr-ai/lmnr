//! Agents' system prompts, read back from stored spans.

use serde_json::Value;

use crate::traces::prompt_hash::extract_system_message;

pub(super) fn system_message(input: &str) -> String {
    serde_json::from_str::<Value>(input)
        .ok()
        .and_then(|input| extract_system_message(&input))
        .map(|(text, _)| text)
        .unwrap_or_default()
}
