//! System-prompt processing for checkpoints.

use std::sync::Arc;

use crate::{cache::Cache, llm::LlmClient};

/// Extract the non-dynamic (stable) portion of a system prompt.
///
/// Strips volatile content (timestamps, injected context, environment details,
/// etc.) so the remainder is a stable fingerprint of the agent's prompt
/// template — usable for version comparison across runs.
pub async fn extract_stable_system_prompt(
    system_prompt: &str,
    cache: Arc<Cache>,
    llm_client: Option<Arc<LlmClient>>,
) -> String {
    // TODO: implement stripping of dynamic content.
    let _ = (cache, llm_client);
    system_prompt.to_string()
}
