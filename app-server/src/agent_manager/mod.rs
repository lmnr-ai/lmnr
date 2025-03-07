use anyhow::Result;
use async_trait::async_trait;

use agent_manager_grpc::{LaminarSpanContext as LaminarSpanContextGrpc, RunAgentResponse};
use enum_dispatch::enum_dispatch;

use agent_manager_impl::AgentManagerImpl;
use mock::MockAgentManager;
use serde::Deserialize;

pub mod agent_manager_grpc;
pub mod agent_manager_impl;
pub mod mock;

#[derive(Debug, Clone, Deserialize)]
pub struct LaminarSpanContext {
    pub trace_id: String,
    pub span_id: String,
    pub is_remote: bool,
}

impl Into<LaminarSpanContextGrpc> for LaminarSpanContext {
    fn into(self) -> LaminarSpanContextGrpc {
        LaminarSpanContextGrpc {
            trace_id: self.trace_id,
            span_id: self.span_id,
            is_remote: self.is_remote,
        }
    }
}

#[enum_dispatch]
pub enum AgentManager {
    Grpc(AgentManagerImpl),
    Mock(MockAgentManager),
}

#[async_trait]
#[enum_dispatch(AgentManager)]
pub trait AgentManagerTrait {
    async fn run_agent(
        &self,
        prompt: String,
        request_api_key: Option<String>,
        span_context: Option<LaminarSpanContextGrpc>,
    ) -> Result<RunAgentResponse>;
}
