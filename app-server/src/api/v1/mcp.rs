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
    /// ClickHouse SQL query. Must be SELECT only. Tables: spans, traces, events, signal_events, signal_runs, logs, tags, evaluation_datapoints, dataset_datapoints. Join: spans.trace_id = traces.id
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
    /// Available tables and their columns:
    ///
    /// spans: span_id (UUID), name (String), span_type (String), start_time (DateTime64), end_time (DateTime64), duration (Float64), input_cost (Float64), output_cost (Float64), total_cost (Float64), input_tokens (Int64), output_tokens (Int64), total_tokens (Int64), request_model (String), response_model (String), model (String), trace_id (UUID), provider (String), path (String), input (String), output (String), status (String), parent_span_id (UUID), attributes (String), tags (Array(String))
    ///
    /// traces: id (UUID), start_time (DateTime64), end_time (DateTime64), input_tokens (Int64), output_tokens (Int64), total_tokens (Int64), input_cost (Float64), output_cost (Float64), total_cost (Float64), duration (Float64), metadata (String), session_id (String), user_id (String), status (String), top_span_id (UUID), top_span_name (String), top_span_type (String), trace_type (String), tags (Array(String)), has_browser_session (Bool)
    ///
    /// events: id (UUID), span_id (UUID), name (String), timestamp (DateTime64), attributes (String), user_id (String), session_id (String), trace_id (UUID), source (String)
    ///
    /// signal_events: id (UUID), signal_id (UUID), trace_id (UUID), run_id (UUID), name (String), payload (String), timestamp (DateTime64)
    ///
    /// signal_runs: signal_id (UUID), job_id (UUID), trigger_id (UUID), run_id (UUID), trace_id (UUID), status (String), event_id (UUID), updated_at (DateTime64)
    ///
    /// logs: log_id (UUID), time (DateTime64), observed_time (DateTime64), severity_number (UInt8), severity_text (String), body (String), attributes (String), trace_id (UUID), span_id (UUID), flags (UInt32), event_name (String)
    ///
    /// tags: id (UUID), span_id (UUID), name (String), created_at (DateTime64), source (String)
    ///
    /// evaluation_datapoints: id (UUID), evaluation_id (UUID), data (String), target (String), metadata (String), executor_output (String), index (UInt64), trace_id (UUID), group_id (String), scores (String), created_at (DateTime64), dataset_id (UUID), dataset_datapoint_id (UUID), dataset_datapoint_created_at (DateTime64)
    ///
    /// dataset_datapoints: id (UUID), created_at (DateTime64), dataset_id (UUID), data (String), target (String), metadata (String)
    ///
    /// Joins: spans.trace_id = traces.id, events.trace_id = traces.id, logs.trace_id = traces.id
    ///
    /// Example queries:
    /// - Recent traces: SELECT id, start_time, total_cost FROM traces ORDER BY start_time DESC LIMIT 10
    /// - LLM spans: SELECT name, model, input, output FROM spans WHERE span_type = 'LLM'
    /// - Errors: SELECT trace_id, name, status FROM spans WHERE status != 'success'
    /// - Logs: SELECT time, severity_text, body FROM logs ORDER BY time DESC LIMIT 20
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
