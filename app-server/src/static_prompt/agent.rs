//! Extraction agent boundary. The real agent takes several system prompts
//! sharing one naive signature and produces regexes whose matches are the
//! dynamic fragments — deleting the matches leaves the static template.

/// Mock of the extraction agent. Replace with the real agent call once it
/// lands; the signature (samples in, regex list out) is the contract the
/// consumer relies on.
pub async fn generate_static_part_regexes(
    system_prompts: &[String],
) -> anyhow::Result<Vec<String>> {
    let _ = system_prompts;
    Ok(Vec::new())
}
