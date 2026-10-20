/// Identity of an agent version. The model is deliberately not part of it:
/// one version runs on any number of models. `tool_version` is the span's
/// tool-definition version, empty without tools.
pub(super) fn version_hash(
    agent_hash: &str,
    system_prompt_version_hash: &str,
    tool_version: &str,
) -> String {
    let mut hasher = blake3::Hasher::new();
    hasher.update(agent_hash.as_bytes());
    hasher.update(b"\0");
    hasher.update(system_prompt_version_hash.as_bytes());
    hasher.update(b"\0");
    hasher.update(tool_version.as_bytes());
    hasher.finalize().to_hex().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_component_changes_the_hash() {
        let base = version_hash("agent", "sp", "tools");
        assert_eq!(base, version_hash("agent", "sp", "tools"));
        assert_ne!(base, version_hash("other", "sp", "tools"));
        assert_ne!(base, version_hash("agent", "sp2", "tools"));
        assert_ne!(base, version_hash("agent", "sp", ""));
    }

    #[test]
    fn components_do_not_bleed_into_each_other() {
        assert_ne!(version_hash("ab", "c", ""), version_hash("a", "bc", ""));
    }
}
