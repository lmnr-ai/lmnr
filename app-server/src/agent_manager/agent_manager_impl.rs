use std::pin::Pin;
use std::sync::Arc;

use anyhow::Result;
use async_trait::async_trait;
use tonic::{transport::Channel, Request};
use uuid::Uuid;

use super::agent_manager_grpc::run_agent_request::ContinueSessionMessage;
use super::agent_manager_grpc::{
    agent_manager_service_client::AgentManagerServiceClient, RunAgentRequest,
};
use super::types::{
    AgentOutput, AgentState, LaminarSpanContext, ModelProvider, RunAgentResponseStreamChunk,
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
        keep_session: bool,
        continue_session: Option<AgentState>,
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
            keep_session,
            continue_session: continue_session.map(|c| ContinueSessionMessage {
                agent_state: Some(c.into()),
            }),
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
        keep_session: bool,
        continue_session: Option<AgentState>,
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
            keep_session,
            continue_session: continue_session.map(|c| ContinueSessionMessage {
                agent_state: Some(c.into()),
            }),
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
