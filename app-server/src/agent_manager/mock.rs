use anyhow::Result;
use async_trait::async_trait;

use super::{
    agent_manager_grpc::{LaminarSpanContext, RunAgentResponse},
    AgentManagerTrait,
};

pub struct MockAgentManager;

#[async_trait]
impl AgentManagerTrait for MockAgentManager {
    async fn run_agent(
        &self,
        _prompt: String,
        _request_api_key: Option<String>,
        _span_context: Option<LaminarSpanContext>,
    ) -> Result<RunAgentResponse> {
        Ok(RunAgentResponse::default())
    }
}
