use anyhow::Result;
use async_trait::async_trait;

use agent_manager_impl::AgentManagerImpl;
use mock::MockAgentManager;
use types::{AgentOutput, LaminarSpanContext, ModelProvider, RunAgentResponseStreamChunk};

pub mod agent_manager_grpc;
pub mod agent_manager_impl;
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
        request_api_key: Option<String>,
        span_context: Option<LaminarSpanContext>,
        model_provider: Option<ModelProvider>,
        model: Option<String>,
    ) -> Result<AgentOutput>;

    async fn run_agent_stream(
        &self,
        prompt: String,
        request_api_key: Option<String>,
        span_context: Option<LaminarSpanContext>,
        model_provider: Option<ModelProvider>,
        model: Option<String>,
    ) -> Self::RunAgentStreamStream;
}
