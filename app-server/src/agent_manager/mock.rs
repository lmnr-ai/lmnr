use super::types::{
    AgentOutput, FinalOutputChunkContent, ModelProvider, RunAgentResponseStreamChunk,
};
use super::AgentManagerTrait;
use anyhow::Result;
use async_trait::async_trait;
use std::collections::HashMap;
use std::pin::Pin;
use uuid::Uuid;
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
        _session_id: Option<Uuid>,
        _request_api_key: Option<String>,
        _parent_span_context: Option<String>,
        _agent_state: Option<String>,
        _model_provider: Option<ModelProvider>,
        _model: Option<String>,
        _enable_thinking: bool,
        _cookies: Vec<HashMap<String, String>>,
    ) -> Result<AgentOutput> {
        log::debug!("MockAgentManager::run_agent called");
        Ok(AgentOutput::default())
    }

    async fn run_agent_stream(
        &self,
        _prompt: String,
        _session_id: Option<Uuid>,
        _request_api_key: Option<String>,
        _parent_span_context: Option<String>,
        _agent_state: Option<String>,
        _model_provider: Option<ModelProvider>,
        _model: Option<String>,
        _enable_thinking: bool,
        _cookies: Vec<HashMap<String, String>>,
    ) -> Self::RunAgentStreamStream {
        log::debug!("MockAgentManager::run_agent_stream called");
        Box::pin(futures::stream::once(async move {
            Ok(RunAgentResponseStreamChunk::FinalOutput(
                FinalOutputChunkContent::default(),
            ))
        }))
    }
}
