//! Agent version-hash computation for checkpoints.
//!
//! Agent + agent-version persistence lives in `crate::db::agents`.

/// Compute the single version hash over an agent's "shape": the non-dynamic
/// system prompt, the tool-definitions hash, and the model. Stored as
/// `agent_versions.version_hash` (BLAKE3-256) and, together with `project_id`,
/// uniquely identifies a version.
pub fn compute_version_hash(
    non_dynamic_system_prompt: &str,
    tool_definitions_hash: &str,
    model: &str,
) -> [u8; 32] {
    let combined = format!("{non_dynamic_system_prompt}\u{0}{tool_definitions_hash}\u{0}{model}");
    *blake3::hash(combined.as_bytes()).as_bytes()
}
