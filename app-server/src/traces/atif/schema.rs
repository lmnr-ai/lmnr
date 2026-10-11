//! Serde model of a Harbor ATIF trajectory (Agent Trajectory Interchange
//! Format, RFC v1.8). Lenient by design: every field is optional, `null` reads
//! as absent, and unknown fields are ignored, so trajectories from older or
//! newer producers still convert. Token ids and logprobs are not modelled.

use serde::{Deserialize, Deserializer};
use serde_json::Value;

#[derive(Deserialize, Default, Debug)]
#[serde(default)]
pub struct Trajectory {
    pub schema_version: Option<String>,
    /// Run-scoped, may be shared by sibling subagents and continuations.
    pub session_id: Option<String>,
    /// Document-scoped; the resolution key of embedded subagent refs.
    pub trajectory_id: Option<String>,
    #[serde(deserialize_with = "null_as_default")]
    pub agent: Agent,
    #[serde(deserialize_with = "null_as_default")]
    pub steps: Vec<Step>,
    pub notes: Option<String>,
    pub final_metrics: Option<Value>,
    pub continued_trajectory_ref: Option<Value>,
    pub extra: Option<Value>,
    #[serde(deserialize_with = "null_as_default")]
    pub subagent_trajectories: Vec<Trajectory>,
}

#[derive(Deserialize, Default, Debug)]
#[serde(default)]
pub struct Agent {
    pub name: Option<String>,
    pub version: Option<String>,
    pub model_name: Option<String>,
    /// OpenAI function-calling schema.
    pub tool_definitions: Option<Vec<Value>>,
    pub extra: Option<Value>,
}

#[derive(Deserialize, Default, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum StepSource {
    System,
    User,
    Agent,
    #[default]
    #[serde(other)]
    Other,
}

#[derive(Deserialize, Default, Debug)]
#[serde(default)]
pub struct Step {
    pub step_id: Option<Value>,
    /// ISO 8601.
    pub timestamp: Option<String>,
    #[serde(deserialize_with = "null_as_default")]
    pub source: StepSource,
    pub model_name: Option<String>,
    pub reasoning_effort: Option<Value>,
    pub message: Option<Content>,
    pub reasoning_content: Option<String>,
    #[serde(deserialize_with = "null_as_default")]
    pub tool_calls: Vec<ToolCall>,
    pub observation: Option<Observation>,
    pub metrics: Option<Metrics>,
    pub extra: Option<Value>,
    /// `0` marks a deterministic dispatch step that made no LLM call.
    pub llm_call_count: Option<i64>,
    pub is_copied_context: Option<bool>,
}

#[derive(Deserialize, Default, Debug)]
#[serde(default)]
pub struct ToolCall {
    pub tool_call_id: Option<String>,
    pub function_name: Option<String>,
    pub arguments: Option<Value>,
    pub extra: Option<Value>,
}

#[derive(Deserialize, Default, Debug)]
#[serde(default)]
pub struct Observation {
    #[serde(deserialize_with = "null_as_default")]
    pub results: Vec<ObservationResult>,
}

#[derive(Deserialize, Default, Debug)]
#[serde(default)]
pub struct ObservationResult {
    pub source_call_id: Option<String>,
    pub content: Option<Content>,
    #[serde(deserialize_with = "null_as_default")]
    pub subagent_trajectory_ref: Vec<SubagentRef>,
    pub extra: Option<Value>,
}

#[derive(Deserialize, Default, Debug)]
#[serde(default)]
pub struct SubagentRef {
    pub trajectory_id: Option<String>,
    /// File-ref form; files can't be read server-side, so these stay
    /// unresolved and are surfaced as an attribute.
    pub trajectory_path: Option<String>,
    pub session_id: Option<String>,
    pub extra: Option<Value>,
}

/// `prompt_tokens` includes cached tokens, matching `gen_ai.usage.input_tokens`.
#[derive(Deserialize, Default, Debug)]
#[serde(default)]
pub struct Metrics {
    pub prompt_tokens: Option<i64>,
    pub completion_tokens: Option<i64>,
    pub cached_tokens: Option<i64>,
    pub cost_usd: Option<f64>,
}

#[derive(Deserialize, Debug)]
#[serde(untagged)]
pub enum Content {
    Text(String),
    Parts(Vec<ContentPart>),
    Other(Value),
}

#[derive(Deserialize, Default, Debug)]
#[serde(default)]
pub struct ContentPart {
    #[serde(rename = "type")]
    pub kind: Option<String>,
    pub text: Option<String>,
    pub source: Option<MediaSource>,
}

#[derive(Deserialize, Default, Debug)]
#[serde(default)]
pub struct MediaSource {
    pub media_type: Option<String>,
    pub path: Option<String>,
}

fn null_as_default<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    D: Deserializer<'de>,
    T: Default + Deserialize<'de>,
{
    Ok(Option::<T>::deserialize(deserializer)?.unwrap_or_default())
}

impl Step {
    pub fn results(&self) -> &[ObservationResult] {
        self.observation
            .as_ref()
            .map(|observation| observation.results.as_slice())
            .unwrap_or(&[])
    }

    pub fn is_copied_context(&self) -> bool {
        self.is_copied_context.unwrap_or(false)
    }

    /// A system step whose observation replaces the agent's whole context
    /// (RFC §VII, e.g. compaction).
    pub fn replaces_context(&self) -> bool {
        self.source == StepSource::System
            && self
                .extra
                .as_ref()
                .and_then(|extra| extra.pointer("/context_management/boundary"))
                .and_then(Value::as_str)
                == Some("replace")
    }
}
