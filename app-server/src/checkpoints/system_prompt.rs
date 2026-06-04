//! System-prompt processing for checkpoints (steps 1–2).

/// Step 1: Extract the non-dynamic (stable) portion of a system prompt.
///
/// Strips volatile content (timestamps, injected context, environment details,
/// etc.) so the remainder is a stable fingerprint of the agent's prompt
/// template — usable for version comparison across runs.
pub fn extract_non_dynamic_system_prompt(system_prompt: &str) -> String {
    // TODO: implement stripping of dynamic content.
    system_prompt.to_string()
}

/// Step 2: Hash the non-dynamic system prompt into a stable identifier.
///
/// The result is stored as `agent_versions.sys_prompt_hash` and is one third
/// of the agent fingerprint (alongside the tool-definitions hash and model).
pub fn hash_system_prompt(non_dynamic_system_prompt: &str) -> String {
    // TODO: implement hashing.
    let _ = non_dynamic_system_prompt;
    String::new()
}
