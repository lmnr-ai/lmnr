//! Ingest side: the producer reduces an LLM span's agent prompt to line
//! hashes; the consumer stores them in `agent_prompts`.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::normalize::line_set;
use crate::{
    ch::agent_prompts::CHAgentPrompt,
    db::{spans::Span, trace::TraceType},
    env::connections::CHECKPOINTS_INTERNAL_PROJECT_ID,
    features::{Feature, is_feature_enabled},
    utils::{sanitize_string, truncate_chars},
};

/// Rides the span message from producer to consumer.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AgentPrompt {
    pub agent_hash: String,
    pub line_hashes: Vec<u64>,
    pub model: String,
    /// `SpanAttributes::release`, empty when the SDK sent none.
    #[serde(default)]
    pub release: String,
}

/// `None` unless the feature is on and the span is production traffic of
/// a user project.
pub fn agent_prompt(
    span: &Span,
    agent_hash: &str,
    system_prompt: &str,
    tool_text: &str,
) -> Option<AgentPrompt> {
    if !is_feature_enabled(Feature::AgentVersioning)
        || matches!(
            span.attributes.trace_type(),
            Some(TraceType::EVALUATION | TraceType::PLAYGROUND)
        )
        || is_internal_project(span.project_id)
    {
        return None;
    }
    let model = span
        .attributes
        .response_model()
        .filter(|m| !m.trim().is_empty())
        .or_else(|| span.attributes.request_model())
        .map(|m| truncate_chars(&sanitize_string(m.trim()), 256))
        .unwrap_or_default();
    Some(AgentPrompt {
        agent_hash: agent_hash.to_string(),
        line_hashes: line_set(system_prompt, tool_text),
        model,
        release: span.attributes.release().unwrap_or_default(),
    })
}

/// The project tracing our own LLM calls; versioning it would recurse.
fn is_internal_project(project_id: Uuid) -> bool {
    std::env::var(CHECKPOINTS_INTERNAL_PROJECT_ID)
        .is_ok_and(|id| Uuid::parse_str(&id).is_ok_and(|id| id == project_id))
}

pub fn row(span: &Span, prompt: AgentPrompt) -> CHAgentPrompt {
    CHAgentPrompt {
        project_id: span.project_id,
        agent_hash: prompt.agent_hash,
        trace_id: span.trace_id,
        span_id: span.span_id,
        start_time: span.start_time.timestamp_nanos_opt().unwrap_or(i64::MAX),
        model: prompt.model,
        line_hashes: prompt.line_hashes,
        release: prompt.release,
    }
}
