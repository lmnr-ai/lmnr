//! Enterprise tools, compiled only with the `signals` feature: their implementations live in
//! `lmnr-private`. OSS builds don't list them at all.

use std::sync::Arc;

use rmcp::{
    ErrorData as McpError, RoleServer, handler::server::wrapper::Parameters,
    model::CallToolResponse, schemars, service::RequestContext, tool, tool_router,
};
use uuid::Uuid;

use super::{
    Audit, AuditTarget, LaminarMcpServer, ProjectParam, ProjectScope, TRACE_ID_PATTERN, ToolError,
    ToolOutput,
};
use crate::{
    audit::{AuditAction, AuditResource},
    auth::mcp_oauth::McpCaller,
};

/// Parameters for the trace context tool.
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GetTraceContextParams {
    /// The trace to summarize, as `traces.id` or `spans.trace_id` from `query_laminar_sql`.
    // Not advertised as `format: uuid`: zod maps that to the RFC-strict `z.uuid()`, which rejects
    // valid OTel trace ids. The pattern mirrors the two forms OTel/Laminar emit; `Uuid` parses both.
    #[schemars(with = "String", regex(pattern = TRACE_ID_PATTERN))]
    pub trace_id: Uuid,
    #[serde(flatten)]
    pub project: ProjectParam,
}

/// Parameters for the agent tool. The agent is project-scoped; name any specific entity inline in
/// `prompt`.
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AskAgentParams {
    /// The question, in plain language. Name any trace, signal or time range it is about.
    pub prompt: String,
    /// Server-minted id to continue a prior conversation. Omit to start fresh; the response returns
    /// the new id to pass back on the next call.
    #[serde(default)]
    pub conversation_id: Option<String>,
    #[serde(flatten)]
    pub project: ProjectParam,
}

#[tool_router(router = enterprise_tools, vis = "pub(super)")]
impl LaminarMcpServer {
    /// Get an LLM-optimized summary of a trace. Returns span hierarchy with timing,
    /// inputs/outputs for LLM spans, and any errors.
    ///
    /// Use this when you have a specific trace_id and want to understand what happened.
    /// Use query_laminar_sql first to find trace IDs, then this tool to drill down.
    ///
    /// Output includes:
    /// - Span tree with parent-child relationships
    /// - Duration and timing for each span
    /// - Full input/output for LLM spans (truncated for others)
    /// - Exception details if any spans failed
    ///
    /// If you need full information that is truncated, you should use query_laminar_sql tool to query spans that you're interested in.
    ///
    #[tool(
        name = "get_trace_context",
        title = "Get trace context",
        annotations(
            title = "Get trace context",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn get_trace_context(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<GetTraceContextParams>,
    ) -> Result<CallToolResponse, McpError> {
        let audit = Audit::new(AuditResource::Trace, AuditAction::View)
            .target(AuditTarget::id(params.trace_id));
        self.run(
            "get_trace_context",
            &context,
            params.project.project_id,
            Some(audit),
            |scope: ProjectScope| async move {
                self.get_trace_context_for_mcp(&scope, params.trace_id)
                    .await
                    .map(ToolOutput::text)
                    .map_err(|e| ToolError::message(format!("Failed to retrieve trace: {e}")))
            },
        )
        .await
    }

    /// Ask Laminar Agent a question about this project's traces in plain language and get a
    /// grounded answer. The agent runs read-only SQL and reads traces itself. The answer ends
    /// with a `conversationId`; pass it back to continue the conversation.
    #[tool(
        name = "ask_agent",
        title = "Ask Laminar Agent",
        annotations(
            title = "Ask Laminar Agent",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = false
        )
    )]
    async fn ask_agent(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<AskAgentParams>,
    ) -> Result<CallToolResponse, McpError> {
        self.run(
            "ask_agent",
            &context,
            params.project.project_id,
            Some(Audit::new(AuditResource::Agent, AuditAction::Run)),
            |scope: ProjectScope| async move {
                let (answer, conversation_id) = self
                    .run_agent_for_mcp(&scope, params.prompt, params.conversation_id)
                    .await
                    .map_err(|e| ToolError::message(format!("Agent failed: {e}")))?;
                Ok(ToolOutput::text(format!(
                    "{answer}\n\n---\nconversationId: {conversation_id}\n(Pass this `conversationId` to the next `ask_agent` call to continue this conversation.)"
                ))
                .target(AuditTarget::id(conversation_id)))
            },
        )
        .await
    }
}

const LICENSE_REQUIRED_MESSAGE: &str =
    "This tool requires a Laminar enterprise license. Add a license key in Settings → License.";

impl LaminarMcpServer {
    async fn get_trace_context_for_mcp(
        &self,
        scope: &ProjectScope,
        trace_id: Uuid,
    ) -> anyhow::Result<String> {
        use crate::signals::private::compression::{
            CompressPlan, TraceCompressor, budget::BudgetConfig, render, shape,
        };
        use crate::signals::private::spans::get_trace_ch_spans;
        use crate::traces::previews::PreviewExtractor;

        if !crate::license::is_ee_enabled(&self.db, &self.cache).await {
            anyhow::bail!(LICENSE_REQUIRED_MESSAGE);
        }

        let spans = get_trace_ch_spans(
            self.clickhouse.clone(),
            scope.project_id,
            trace_id,
            &self.policy(scope).await,
        )
        .await?;
        if spans.is_empty() {
            return Ok(format!(
                "No spans found for trace {trace_id}. Either the trace does not exist in this project or there are no spans in the trace."
            ));
        }

        // Every span, raw prompts.
        let compressor = TraceCompressor::new(Arc::new(PreviewExtractor::new()));
        let plan = CompressPlan {
            budget: BudgetConfig::for_chat(),
            ..CompressPlan::default()
        };
        let compressed = compressor
            .compress(shape(&spans, trace_id), plan)
            .await
            .map_err(|e| anyhow::anyhow!("Trace compression failed: {}", e))?;

        Ok(render(&compressed))
    }

    /// Run the agent for one question, returning `(answer, conversation_id)`. The turn runs in the
    /// frontend (`/api/internal/projects/{id}/agent/chat`), which continues `conversation_id` when it
    /// is an MCP conversation of this project and starts a fresh one otherwise.
    async fn run_agent_for_mcp(
        &self,
        scope: &ProjectScope,
        prompt: String,
        conversation_id: Option<String>,
    ) -> anyhow::Result<(String, String)> {
        #[derive(serde::Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct AgentReply {
            #[serde(default)]
            answer: String,
            #[serde(default)]
            conversation_id: String,
            #[serde(default)]
            error: Option<String>,
        }

        if !crate::license::is_ee_enabled(&self.db, &self.cache).await {
            anyhow::bail!(LICENSE_REQUIRED_MESSAGE);
        }

        // API-key conversations have no owning user; OAuth ones belong to the user.
        let user_id = match &scope.caller {
            McpCaller::ApiKey(_) => None,
            McpCaller::User(user) => Some(user.user_id),
        };
        let response = crate::next_api::open(
            &self.http_client,
            scope.project_id,
            user_id,
            "agent/chat",
            serde_json::json!({
                "source": "mcp",
                "message": prompt,
                "conversationId": conversation_id,
            }),
            "application/json",
        )
        .await?;
        let status = response.status();
        let reply: AgentReply = response
            .json()
            .await
            .map_err(|e| anyhow::anyhow!("unexpected agent response ({status}): {e}"))?;
        if let Some(error) = reply.error {
            anyhow::bail!("{error}");
        }
        if !status.is_success() {
            anyhow::bail!("the agent responded with {status}");
        }
        if reply.answer.trim().is_empty() {
            anyhow::bail!("Agent finished without producing a textual answer.");
        }
        Ok((reply.answer, reply.conversation_id))
    }
}
