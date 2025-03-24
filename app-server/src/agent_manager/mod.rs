use agent_manager_impl::AgentManagerImpl;
use anyhow::Result;
use async_trait::async_trait;
use mock::MockAgentManager;
use types::{AgentOutput, ModelProvider, RunAgentResponseStreamChunk};
use uuid::Uuid;

pub mod agent_manager_grpc;
pub mod agent_manager_impl;
pub mod channel;
mod cookies;
pub mod mock;
pub mod types;
pub mod worker;

#[enum_delegate::implement(AgentManagerTrait)]
pub enum AgentManager {
    Grpc(AgentManagerImpl),
    Mock(MockAgentManager),
}

#[async_trait]
#[enum_delegate::register]
pub trait AgentManagerTrait {
    type RunAgentStreamStream: futures::stream::Stream<Item = Result<RunAgentResponseStreamChunk>>;

    async fn run_agent(
        &self,
        prompt: String,
        session_id: Option<Uuid>,
        request_api_key: Option<String>,
        parent_span_context: Option<String>,
        agent_state: Option<String>,
        model_provider: Option<ModelProvider>,
        model: Option<String>,
        enable_thinking: bool,
    ) -> Result<AgentOutput>;

    async fn run_agent_stream(
        &self,
        prompt: String,
        session_id: Option<Uuid>,
        request_api_key: Option<String>,
        parent_span_context: Option<String>,
        agent_state: Option<String>,
        model_provider: Option<ModelProvider>,
        model: Option<String>,
        enable_thinking: bool,
    ) -> Self::RunAgentStreamStream;
}
