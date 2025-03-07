use std::sync::Arc;

use anyhow::Result;
use async_trait::async_trait;
use tonic::{transport::Channel, Request};

use super::agent_manager_grpc::{
    agent_manager_service_client::AgentManagerServiceClient, LaminarSpanContext, RunAgentRequest,
    RunAgentResponse,
};
use super::AgentManagerTrait;

#[derive(Clone)]
pub struct AgentManagerImpl {
    client: Arc<AgentManagerServiceClient<Channel>>,
}

impl AgentManagerImpl {
    pub fn new(client: Arc<AgentManagerServiceClient<Channel>>) -> Self {
        Self { client }
    }
}

#[async_trait]
impl AgentManagerTrait for AgentManagerImpl {
    async fn run_agent(
        &self,
        prompt: String,
        request_api_key: Option<String>,
        span_context: Option<LaminarSpanContext>,
    ) -> Result<RunAgentResponse> {
        let mut client = self.client.as_ref().clone();

        let request = Request::new(RunAgentRequest {
            prompt,
            request_api_key,
            span_context,
        });

        let response = client.run_agent(request).await?;

        Ok(response.into_inner())
    }
}
