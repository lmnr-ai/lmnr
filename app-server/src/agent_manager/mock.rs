use super::types::{AgentOutput, FinalOutputChunkContent, RunAgentResponseStreamChunk};
use super::AgentManagerTrait;
use anyhow::Result;
use async_trait::async_trait;
use std::pin::Pin;
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

    async fn run_agent(&self, _params: super::RunAgentParams) -> Result<AgentOutput> {
        log::debug!("MockAgentManager::run_agent called");
        Ok(AgentOutput::default())
    }

    async fn run_agent_stream(&self, _params: super::RunAgentParams) -> Self::RunAgentStreamStream {
        log::debug!("MockAgentManager::run_agent_stream called");
        Box::pin(futures::stream::once(async move {
            Ok(RunAgentResponseStreamChunk::FinalOutput(
                FinalOutputChunkContent::default(),
            ))
        }))
    }
}
