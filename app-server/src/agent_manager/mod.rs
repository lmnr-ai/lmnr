use agent_manager_impl::AgentManagerImpl;
use anyhow::Result;
use async_trait::async_trait;
use mock::MockAgentManager;
use types::{AgentOutput, ModelProvider, RunAgentResponseStreamChunk};
use uuid::Uuid;

pub mod agent_manager_grpc;
pub mod agent_manager_impl;
pub mod channel;
pub mod mock;
mod storage_state;
pub mod types;
pub mod worker;

#[enum_delegate::implement(AgentManagerTrait)]
pub enum AgentManager {
    Grpc(AgentManagerImpl),
    Mock(MockAgentManager),
}

pub struct RunAgentParams {
    pub prompt: String,
    pub session_id: Uuid,
    pub is_chat_request: bool,
    pub request_api_key: Option<String>,
    pub parent_span_context: Option<String>,
    pub model_provider: Option<ModelProvider>,
    pub model: Option<String>,
    pub enable_thinking: bool,
    pub storage_state: Option<String>,
    pub agent_state: Option<String>,
    pub return_screenshots: bool,
    pub return_agent_state: bool,
    pub return_storage_state: bool,
    pub timeout: Option<u64>,
    pub cdp_url: Option<String>,
    pub max_steps: Option<u64>,
    pub thinking_token_budget: Option<u64>,
    pub start_url: Option<String>,
}

#[async_trait]
#[enum_delegate::register]
pub trait AgentManagerTrait {
    type RunAgentStreamStream: futures_util::stream::Stream<
        Item = Result<RunAgentResponseStreamChunk>,
    >;

    async fn run_agent(&self, params: RunAgentParams) -> Result<AgentOutput>;

    async fn run_agent_stream(&self, params: RunAgentParams) -> Self::RunAgentStreamStream;
}
