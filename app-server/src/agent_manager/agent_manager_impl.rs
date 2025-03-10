use std::pin::Pin;
use std::sync::Arc;

use anyhow::Result;
use async_trait::async_trait;
use tonic::{transport::Channel, Request};
use uuid::Uuid;

use super::agent_manager_grpc::{
    agent_manager_service_client::AgentManagerServiceClient, RunAgentRequest,
};
use super::types::{AgentOutput, LaminarSpanContext, ModelProvider, RunAgentResponseStreamChunk};
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
    type RunAgentStreamStream = Pin<
        Box<
            dyn futures::stream::Stream<Item = Result<RunAgentResponseStreamChunk>>
                + Send
                + 'static,
        >,
    >;

    async fn run_agent(
        &self,
        prompt: String,
        chat_id: Uuid,
        request_api_key: Option<String>,
        span_context: Option<LaminarSpanContext>,
        model_provider: Option<ModelProvider>,
        model: Option<String>,
        enable_thinking: bool,
    ) -> Result<AgentOutput> {
        let mut client = self.client.as_ref().clone();

        let request = Request::new(RunAgentRequest {
            prompt,
            chat_id: chat_id.to_string(),
            request_api_key,
            span_context: span_context.map(|c| c.into()),
            model_provider: model_provider.map(|p| p.to_i32()),
            model,
            enable_thinking: Some(enable_thinking),
        });

        let response = client.run_agent(request).await?;

        Ok(response.into_inner().into())
    }

    async fn run_agent_stream(
        &self,
        prompt: String,
        chat_id: Uuid,
        request_api_key: Option<String>,
        span_context: Option<LaminarSpanContext>,
        model_provider: Option<ModelProvider>,
        model: Option<String>,
        enable_thinking: bool,
    ) -> Self::RunAgentStreamStream {
        let mut client = self.client.as_ref().clone();

        let request = Request::new(RunAgentRequest {
            prompt,
            chat_id: chat_id.to_string(),
            request_api_key,
            span_context: span_context.map(|c| c.into()),
            model_provider: model_provider.map(|p| p.to_i32()),
            model,
            enable_thinking: Some(enable_thinking),
        });

        let response = client.run_agent_stream(request).await.unwrap();
        let mut stream = response.into_inner();

        Box::pin(async_stream::stream! {
            while let Some(chunk) = stream.message().await? {
                yield Ok(chunk.into());
            }
        })
    }
}
