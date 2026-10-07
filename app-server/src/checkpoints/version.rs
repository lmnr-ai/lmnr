//! Agent version-hash computation for checkpoints.
//!
//! Agent + agent-version persistence lives in `crate::db::agents`.

/// Compute the single version hash over an agent's "shape": the non-dynamic
/// system prompt, the tool-definitions hash, and the model. Returns the
/// BLAKE3-256 digest hex-encoded (64 chars) — this is the canonical form
/// stored in `agent_versions.version_hash` (`text`) and, together with
/// `project_id`, uniquely identifies a version.
pub fn compute_version_hash(
    non_dynamic_system_prompt: &str,
    tool_definitions_hash: &str,
    model: &str,
) -> String {
    let combined = format!("{non_dynamic_system_prompt}\u{0}{tool_definitions_hash}\u{0}{model}");
    hex::encode(blake3::hash(combined.as_bytes()).as_bytes())
}
