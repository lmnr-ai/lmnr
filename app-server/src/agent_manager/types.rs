use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use super::agent_manager_grpc::{
    run_agent_response_stream_chunk::ChunkType as RunAgentResponseStreamChunkTypeGrpc,
    ActionResult as ActionResultGrpc, AgentOutput as AgentOutputGrpc,
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
    pub state: String,
    pub result: ActionResult,
}

impl Into<AgentOutput> for AgentOutputGrpc {
    fn into(self) -> AgentOutput {
        AgentOutput {
            state: self.agent_state,
            result: self.result.unwrap().into(),
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
}
// Frontend does not need the full agent output, so we have a thinner version
// of final output for it
#[derive(Serialize, Clone)]
#[serde(tag = "chunkType", rename_all = "camelCase")]
pub enum RunAgentResponseStreamChunkFrontend {
    Step(StepChunkContent),
    FinalOutput(FinalOutputChunkContentFrontend),
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AgentOutputFrontend {
    pub result: ActionResult,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FinalOutputChunkContentFrontend {
    pub message_id: Uuid,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub content: AgentOutputFrontend,
}

impl Into<RunAgentResponseStreamChunkFrontend> for RunAgentResponseStreamChunk {
    fn into(self) -> RunAgentResponseStreamChunkFrontend {
        match self {
            RunAgentResponseStreamChunk::Step(s) => RunAgentResponseStreamChunkFrontend::Step(s),
            RunAgentResponseStreamChunk::FinalOutput(f) => {
                RunAgentResponseStreamChunkFrontend::FinalOutput(FinalOutputChunkContentFrontend {
                    message_id: f.message_id,
                    created_at: chrono::Utc::now(),
                    content: AgentOutputFrontend {
                        result: f.content.result,
                    },
                })
            }
        }
    }
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
                "action_result": step.action_result,
            }),
            RunAgentResponseStreamChunk::FinalOutput(final_output) => serde_json::json!({
                "text": final_output.content.result.content.clone().unwrap_or_default(),
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
}

impl Into<StepChunkContent> for StepChunkContentGrpc {
    fn into(self) -> StepChunkContent {
        StepChunkContent {
            created_at: chrono::Utc::now(),
            message_id: Uuid::new_v4(),
            action_result: self.action_result.unwrap().into(),
            summary: self.summary,
        }
    }
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct FinalOutputChunkContent {
    pub message_id: Uuid,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub content: AgentOutput,
}
