use std::{collections::HashMap, sync::Arc};

use rmcp::{
    ErrorData as McpError, RoleServer, ServerHandler,
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::*,
    schemars, service::RequestContext,
    tool, tool_handler, tool_router,
};
use rmcp::transport::streamable_http_server::session::local::LocalSessionManager;
use rmcp_actix_web::transport::StreamableHttpService;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    db::project_api_keys::ProjectApiKey,
    query_engine::QueryEngine,
    signals::spans::get_trace_structure_as_string,
    sql::{self, ClickhouseReadonlyClient},
};

// ============ Per-request context ============

/// Newtype wrapper to pass project_id through rmcp extensions.
#[derive(Clone)]
pub struct ProjectId(pub Uuid);

// ============ Tool parameter structs ============

/// Parameters for the SQL query tool.
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct QuerySqlParams {
    /// ClickHouse SQL query. Must be SELECT only. Tables: spans, traces. Join: spans.trace_id = traces.id
    pub query: String,
    /// Query parameters for {name:Type} placeholders, e.g., {trace_id:UUID}
    #[serde(default)]
    pub parameters: HashMap<String, Value>,
}

/// Parameters for the trace context tool.
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GetTraceContextParams {
    /// The trace ID to retrieve (UUID format, e.g., '123e4567-e89b-12d3-a456-426614174000')
    pub trace_id: Uuid,
}

// ============ MCP Server ============

#[derive(Clone)]
pub struct LaminarMcpServer {
    clickhouse: clickhouse::Client,
    clickhouse_ro: Option<Arc<ClickhouseReadonlyClient>>,
    query_engine: Arc<QueryEngine>,
    tool_router: ToolRouter<LaminarMcpServer>,
}

#[tool_router]
impl LaminarMcpServer {
    pub fn new(
        clickhouse: clickhouse::Client,
        clickhouse_ro: Option<Arc<ClickhouseReadonlyClient>>,
        query_engine: Arc<QueryEngine>,
    ) -> Self {
        Self {
            clickhouse,
            clickhouse_ro,
            query_engine,
            tool_router: Self::tool_router(),
        }
    }

    /// Execute a SQL query against Laminar trace data. Returns results as JSON array.
    /// Queries are automatically scoped to your project. Only SELECT queries allowed.
    ///
    /// Available tables and key columns:
    /// - spans: span_id, trace_id, name, span_type (0=DEFAULT, 1=LLM, 6=TOOL), start_time, end_time, input, output, status, parent_span_id, model, provider, input_tokens, output_tokens, total_tokens, total_cost, path
    /// - traces: id, start_time, end_time, duration, total_tokens, total_cost, session_id, user_id, status, tags, top_span_name, num_spans, span_names
    ///
    /// Join: spans.trace_id = traces.id
    ///
    /// Example queries:
    /// - Recent traces: SELECT id, start_time, total_cost FROM traces ORDER BY start_time DESC LIMIT 10
    /// - LLM spans: SELECT name, model, input, output FROM spans WHERE span_type = 1
    /// - Errors: SELECT trace_id, name, status FROM spans WHERE status != 'success'
    #[tool(name = "query_laminar_sql")]
    async fn query_laminar_sql(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<QuerySqlParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = context
            .extensions
            .get::<ProjectId>()
            .ok_or_else(|| McpError::internal_error("Missing project context", None))?
            .0;

        let ro_client = self
            .clickhouse_ro
            .clone()
            .ok_or_else(|| {
                McpError::internal_error("ClickHouse read-only client not configured", None)
            })?;

        match sql::execute_sql_query(
            params.query,
            project_id,
            params.parameters,
            ro_client,
            self.query_engine.clone(),
        )
        .await
        {
            Ok(result) => Ok(CallToolResult::success(vec![Content::text(
                serde_json::to_string_pretty(&result).unwrap_or_default(),
            )])),
            Err(e) => Ok(CallToolResult::error(vec![Content::text(e.to_string())])),
        }
    }

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
    #[tool(name = "get_trace_context")]
    async fn get_trace_context(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<GetTraceContextParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = context
            .extensions
            .get::<ProjectId>()
            .ok_or_else(|| McpError::internal_error("Missing project context", None))?
            .0;

        match get_trace_structure_as_string(
            self.clickhouse.clone(),
            project_id,
            params.trace_id,
        )
        .await
        {
            Ok(trace_str) => Ok(CallToolResult::success(vec![Content::text(trace_str)])),
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!(
                "Failed to retrieve trace: {}",
                e
            ))])),
        }
    }
}

#[tool_handler]
impl ServerHandler for LaminarMcpServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            protocol_version: ProtocolVersion::V_2024_11_05,
            capabilities: ServerCapabilities::builder().enable_tools().build(),
            server_info: Implementation {
                name: "laminar".to_string(),
                title: None,
                version: env!("CARGO_PKG_VERSION").to_string(),
                icons: None,
                website_url: None,
            },
            instructions: None,
        }
    }
}

// ============ Service builder ============

pub fn build_mcp_service(
    clickhouse: clickhouse::Client,
    clickhouse_ro: Option<Arc<ClickhouseReadonlyClient>>,
    query_engine: Arc<QueryEngine>,
) -> StreamableHttpService<LaminarMcpServer, LocalSessionManager> {
    StreamableHttpService::builder()
        .service_factory({
            let clickhouse = clickhouse.clone();
            let clickhouse_ro = clickhouse_ro.clone();
            let query_engine = query_engine.clone();
            Arc::new(move || {
                Ok(LaminarMcpServer::new(
                    clickhouse.clone(),
                    clickhouse_ro.clone(),
                    query_engine.clone(),
                ))
            })
        })
        .session_manager(Arc::new(LocalSessionManager::default()))
        .stateful_mode(true)
        .on_request_fn(|http_req, mcp_ext| {
            use actix_web::HttpMessage;
            if let Some(api_key) = http_req.extensions().get::<ProjectApiKey>() {
                mcp_ext.insert(ProjectId(api_key.project_id));
            }
        })
        .build()
}
