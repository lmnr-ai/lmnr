use std::pin::Pin;

use anyhow::Result;
use async_trait::async_trait;

use super::types::{AgentOutput, LaminarSpanContext, ModelProvider, RunAgentResponseStreamChunk};
use super::AgentManagerTrait;

pub struct MockAgentManager;

#[async_trait]
impl AgentManagerTrait for MockAgentManager {
    type RunAgentStreamStream = Pin<
        Box<
            dyn futures::stream::Stream<Item = Result<RunAgentResponseStreamChunk>>
                + Send
                + 'static,
        >,
    >;

    async fn run_agent(
        &self,
        _prompt: String,
        _request_api_key: Option<String>,
        _span_context: Option<LaminarSpanContext>,
        _model_provider: Option<ModelProvider>,
        _model: Option<String>,
    ) -> Result<AgentOutput> {
        Ok(AgentOutput::default())
    }
    async fn run_agent_stream(
        &self,
        _prompt: String,
        _request_api_key: Option<String>,
        _span_context: Option<LaminarSpanContext>,
        _model_provider: Option<ModelProvider>,
        _model: Option<String>,
    ) -> Self::RunAgentStreamStream {
        Box::pin(futures::stream::empty())
    }
}
