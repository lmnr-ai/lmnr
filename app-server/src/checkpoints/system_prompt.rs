//! System-prompt processing for checkpoints.

/// Step 1: Extract the non-dynamic (stable) portion of a system prompt.
///
/// Strips volatile content (timestamps, injected context, environment details,
/// etc.) so the remainder is a stable fingerprint of the agent's prompt
/// template — usable for version comparison across runs.
pub fn extract_non_dynamic_system_prompt(system_prompt: &str) -> String {
    // TODO: implement stripping of dynamic content.
    system_prompt.to_string()
}
