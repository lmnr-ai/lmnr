//! Agents' system prompts, read back from stored spans.

use serde_json::Value;
use uuid::Uuid;

use crate::{ch::agent_prompts::fetch_agent_doc, traces::prompt_hash::extract_system_message};

/// The span's system prompt, read back from `spans_v1`; `None` when the span
/// is not stored or has none.
pub(super) async fn span_system_prompt(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    trace_id: Uuid,
    span_id: Uuid,
) -> anyhow::Result<Option<String>> {
    let doc = fetch_agent_doc(clickhouse, project_id, trace_id, span_id).await?;
    Ok(doc
        .map(|(input, _)| system_message(&input))
        .filter(|prompt| !prompt.is_empty()))
}

pub(super) fn system_message(input: &str) -> String {
    serde_json::from_str::<Value>(input)
        .ok()
        .and_then(|input| extract_system_message(&input))
        .map(|(text, _)| text)
        .unwrap_or_default()
}
