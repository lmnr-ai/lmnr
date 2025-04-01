use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use super::agent_manager_grpc::{
    run_agent_response_stream_chunk::ChunkType as RunAgentResponseStreamChunkTypeGrpc,
    ActionResult as ActionResultGrpc, AgentOutput as AgentOutputGrpc, Cookie,
    RunAgentResponseStreamChunk as RunAgentResponseStreamChunkGrpc,
    StepChunkContent as StepChunkContentGrpc,
};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelProvider {
    Anthropic,
    Bedrock,
}

impl ModelProvider {
    pub fn to_i32(&self) -> i32 {
        match self {
            ModelProvider::Anthropic => 0,
            ModelProvider::Bedrock => 1,
        }
    }
}

#[derive(Serialize, Deserialize, Default, Clone)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct ActionResult {
    #[serde(default)]
    pub is_done: bool,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub give_control: bool,
}

impl Into<ActionResult> for ActionResultGrpc {
    fn into(self) -> ActionResult {
        ActionResult {
            is_done: self.is_done.unwrap_or_default(),
            content: self.content,
            error: self.error,
            give_control: self.give_control.unwrap_or_default(),
        }
    }
}

#[derive(Serialize, Deserialize, Default, Clone)]
pub struct AgentOutput {
    pub result: ActionResult,
    #[serde(skip_serializing)]
    pub cookies: Option<Vec<HashMap<String, String>>>,
    // pub state: String,
    pub step_count: Option<u64>,
}

impl Into<Cookie> for HashMap<String, String> {
    fn into(self) -> Cookie {
        Cookie { cookie_data: self }
    }
}

impl Into<AgentOutput> for AgentOutputGrpc {
    fn into(self) -> AgentOutput {
        let cookies = self
            .cookies
            .into_iter()
            .map(|c| c.cookie_data)
            .collect::<Vec<_>>();

        AgentOutput {
            result: self.result.unwrap().into(),
            cookies: (!cookies.is_empty()).then_some(cookies),
            step_count: self.step_count,
        }
    }
}

pub enum WorkerStreamChunk {
    AgentChunk(RunAgentResponseStreamChunk),
    ControlChunk(ControlChunk),
}

pub enum ControlChunk {
    Stop,
}

#[derive(Serialize, Clone)]
#[serde(tag = "chunkType", rename_all = "camelCase")]
pub enum RunAgentResponseStreamChunk {
    Step(StepChunkContent),
    FinalOutput(FinalOutputChunkContent),
}

impl RunAgentResponseStreamChunk {
    pub fn message_id(&self) -> Uuid {
        match self {
            RunAgentResponseStreamChunk::Step(s) => s.message_id,
            RunAgentResponseStreamChunk::FinalOutput(f) => f.message_id,
        }
    }

    pub fn created_at(&self) -> chrono::DateTime<chrono::Utc> {
        match self {
            RunAgentResponseStreamChunk::Step(s) => s.created_at,
            RunAgentResponseStreamChunk::FinalOutput(f) => f.created_at,
        }
    }

    pub fn trace_id(&self) -> Uuid {
        match self {
            RunAgentResponseStreamChunk::Step(s) => s.trace_id,
            RunAgentResponseStreamChunk::FinalOutput(f) => f.trace_id,
        }
    }
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct FinalOutputChunkContent {
    pub message_id: Uuid,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub content: AgentOutput,
    pub trace_id: Uuid,
}

impl RunAgentResponseStreamChunk {
    pub fn set_message_id(&mut self, message_id: Uuid) {
        match self {
            RunAgentResponseStreamChunk::Step(s) => s.message_id = message_id,
            RunAgentResponseStreamChunk::FinalOutput(f) => f.message_id = message_id,
        }
    }

    pub fn message_content(&self) -> Value {
        match self {
            RunAgentResponseStreamChunk::Step(step) => serde_json::json!({
                "summary": step.summary,
                "actionResult": step.action_result,
            }),
            RunAgentResponseStreamChunk::FinalOutput(final_output) => serde_json::json!({
                "text": final_output.content.result.content.clone().unwrap_or_default(),
                "actionResult": final_output.content.result,
            }),
        }
    }
}

impl Into<RunAgentResponseStreamChunk> for RunAgentResponseStreamChunkGrpc {
    fn into(self) -> RunAgentResponseStreamChunk {
        match self.chunk_type.unwrap() {
            RunAgentResponseStreamChunkTypeGrpc::StepChunkContent(s) => {
                RunAgentResponseStreamChunk::Step(s.into())
            }
            RunAgentResponseStreamChunkTypeGrpc::AgentOutput(a) => {
                RunAgentResponseStreamChunk::FinalOutput(FinalOutputChunkContent {
                    message_id: Uuid::new_v4(),
                    created_at: chrono::Utc::now(),
                    trace_id: Uuid::parse_str(&a.trace_id).unwrap_or(Uuid::new_v4()),
                    content: a.into(),
                })
            }
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StepChunkContent {
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub message_id: Uuid,
    pub action_result: ActionResult,
    pub summary: String,
    pub trace_id: Uuid,
}

impl Into<StepChunkContent> for StepChunkContentGrpc {
    fn into(self) -> StepChunkContent {
        StepChunkContent {
            created_at: chrono::Utc::now(),
            message_id: Uuid::new_v4(),
            action_result: self.action_result.unwrap().into(),
            summary: self.summary,
            trace_id: Uuid::parse_str(&self.trace_id).unwrap_or(Uuid::new_v4()),
        }
    }
}
