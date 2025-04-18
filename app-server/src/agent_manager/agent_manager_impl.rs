use crate::agent_manager::types::ErrorChunkContent;

use super::agent_manager_grpc::{
    agent_manager_service_client::AgentManagerServiceClient, RunAgentRequest,
};
use super::types::{AgentOutput, RunAgentResponseStreamChunk};
use super::AgentManagerTrait;
use anyhow::Result;
use async_trait::async_trait;
use chrono::Utc;
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

    async fn run_agent(&self, params: super::RunAgentParams) -> Result<AgentOutput> {
        let mut client = self.client.as_ref().clone();

        let request = Request::new(RunAgentRequest {
            prompt: params.prompt,
            session_id: params.session_id.to_string(),
            is_chat_request: params.is_chat_request,
            request_api_key: params.request_api_key,
            parent_span_context: params.parent_span_context,
            model_provider: params.model_provider.map(|p| p.to_i32()),
            model: params.model,
            enable_thinking: Some(params.enable_thinking),
            storage_state: params.storage_state,
            agent_state: params.agent_state,
            return_screenshots: Some(params.return_screenshots),
            timeout: params.timeout,
            return_agent_state: Some(params.return_agent_state),
            return_storage_state: Some(params.return_storage_state),
            cdp_url: params.cdp_url,
            max_steps: params.max_steps,
            thinking_token_budget: params.thinking_token_budget,
        });

        let response = client.run_agent(request).await?;

        Ok(response.into_inner().into())
    }

    async fn run_agent_stream(&self, params: super::RunAgentParams) -> Self::RunAgentStreamStream {
        let mut client = self.client.as_ref().clone();

        let request = Request::new(RunAgentRequest {
            prompt: params.prompt,
            session_id: params.session_id.to_string(),
            is_chat_request: params.is_chat_request,
            request_api_key: params.request_api_key,
            parent_span_context: params.parent_span_context,
            model_provider: params.model_provider.map(|p| p.to_i32()),
            model: params.model,
            enable_thinking: Some(params.enable_thinking),
            storage_state: params.storage_state,
            agent_state: params.agent_state,
            return_screenshots: Some(params.return_screenshots),
            timeout: params.timeout,
            return_agent_state: Some(params.return_agent_state),
            return_storage_state: Some(params.return_storage_state),
            cdp_url: params.cdp_url,
            max_steps: params.max_steps,
            thinking_token_budget: params.thinking_token_budget,
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
                Box::pin(futures::stream::once(async move {
                    Ok(RunAgentResponseStreamChunk::Error(ErrorChunkContent {
                        created_at: Utc::now(),
                        message_id: Uuid::new_v4(),
                        error: e.to_string(),
                    }))
                }))
            }
        }
    }
}
