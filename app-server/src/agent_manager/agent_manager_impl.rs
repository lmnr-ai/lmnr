use super::agent_manager_grpc::{
    agent_manager_service_client::AgentManagerServiceClient, RunAgentRequest,
};
use super::types::{AgentOutput, ModelProvider, RunAgentResponseStreamChunk};
use super::AgentManagerTrait;
use anyhow::Result;
use async_trait::async_trait;
use std::collections::HashMap;
use std::pin::Pin;
use std::sync::Arc;
use tonic::{transport::Channel, Request};
use uuid::Uuid;

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
        session_id: Uuid,
        is_chat_request: bool,
        request_api_key: Option<String>,
        parent_span_context: Option<String>,
        model_provider: Option<ModelProvider>,
        model: Option<String>,
        enable_thinking: bool,
        cookies: Vec<HashMap<String, String>>,
    ) -> Result<AgentOutput> {
        let mut client = self.client.as_ref().clone();

        let request = Request::new(RunAgentRequest {
            prompt,
            session_id: session_id.to_string(),
            is_chat_request,
            request_api_key,
            parent_span_context,
            model_provider: model_provider.map(|p| p.to_i32()),
            model,
            enable_thinking: Some(enable_thinking),
            cookies: cookies.into_iter().map(|c| c.into()).collect(),
        });

        let response = client.run_agent(request).await?;

        Ok(response.into_inner().into())
    }

    async fn run_agent_stream(
        &self,
        prompt: String,
        session_id: Uuid,
        is_chat_request: bool,
        request_api_key: Option<String>,
        parent_span_context: Option<String>,
        model_provider: Option<ModelProvider>,
        model: Option<String>,
        enable_thinking: bool,
        cookies: Vec<HashMap<String, String>>,
    ) -> Self::RunAgentStreamStream {
        let mut client = self.client.as_ref().clone();

        let request = Request::new(RunAgentRequest {
            prompt,
            session_id: session_id.to_string(),
            is_chat_request,
            request_api_key,
            parent_span_context,
            model_provider: model_provider.map(|p| p.to_i32()),
            model,
            enable_thinking: Some(enable_thinking),
            cookies: cookies.into_iter().map(|c| c.into()).collect(),
        });

        match client.run_agent_stream(request).await {
            Ok(response) => {
                let mut stream = response.into_inner();
                Box::pin(async_stream::stream! {
                    while let Some(chunk) = stream.message().await? {
                        yield Ok(chunk.into());
                    }
                })
            }
            Err(e) => {
                log::error!("Error running agent: {}", e);
                Box::pin(async_stream::stream! {
                    yield Err(anyhow::anyhow!(e));
                })
            }
        }
    }
}
