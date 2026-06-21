use std::{collections::HashMap, sync::Arc};

use actix_web::{HttpMessage, HttpRequest, HttpResponse, web};
use bytes::Bytes;
use rmcp::{
    ErrorData as McpError, RoleServer, ServerHandler,
    handler::server::wrapper::Parameters,
    model::*,
    schemars,
    service::{RequestContext, serve_directly},
    tool, tool_handler, tool_router,
    transport::OneshotTransport,
};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    cache::Cache,
    db::{DB, project_api_keys::ProjectApiKey},
    llm::LlmClient,
    query_engine::QueryEngine,
    sql::{self, ClickhouseReadonlyClient, SqlQuerySource},
};

// ============ Per-request context ============

/// Newtype wrapper to pass project_id through rmcp extensions.
#[derive(Clone)]
pub struct ProjectId(pub Uuid);

// ============ Tool parameter structs ============

/// Parameters for the SQL query tool.
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct QuerySqlParams {
    /// ClickHouse SQL query. Must be SELECT only. Tables: spans, traces, signal_events, signal_runs, clusters, logs, evaluation_datapoints, dataset_datapoints. Join: spans.trace_id = traces.id
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
    #[cfg_attr(not(feature = "signals"), allow(dead_code))]
    clickhouse: clickhouse::Client,
    clickhouse_ro: Option<Arc<ClickhouseReadonlyClient>>,
    query_engine: Arc<QueryEngine>,
    http_client: Arc<reqwest::Client>,
    db: Arc<DB>,
    cache: Arc<Cache>,
    #[cfg_attr(not(feature = "signals"), allow(dead_code))]
    llm_client: Option<Arc<LlmClient>>,
}

#[tool_router]
impl LaminarMcpServer {
    pub fn new(
        clickhouse: clickhouse::Client,
        clickhouse_ro: Option<Arc<ClickhouseReadonlyClient>>,
        query_engine: Arc<QueryEngine>,
        http_client: Arc<reqwest::Client>,
        db: Arc<DB>,
        cache: Arc<Cache>,
        llm_client: Option<Arc<LlmClient>>,
    ) -> Self {
        Self {
            clickhouse,
            clickhouse_ro,
            query_engine,
            http_client,
            db,
            cache,
            llm_client,
        }
    }

    /// Execute a SQL query (Full support of ClickHouse syntax) against Laminar trace data. Returns results as JSON array.
    /// Queries are automatically scoped to your project. Only SELECT queries allowed.
    ///
    /// Available tables and their columns:
    ///
    /// spans: span_id (UUID), name (String), span_type (String, options: DEFAULT, LLM, TOOL), start_time (DateTime64), end_time (DateTime64), duration (Float64), input_cost (Float64), output_cost (Float64), total_cost (Float64), input_tokens (Int64), output_tokens (Int64), total_tokens (Int64), request_model (String), response_model (String), model (String), trace_id (UUID), provider (String), path (String), input (String), output (String), status (String), parent_span_id (UUID), attributes (String), tags (Array(String))
    ///
    /// traces: id (UUID), start_time (DateTime64), end_time (DateTime64), input_tokens (Int64), output_tokens (Int64), total_tokens (Int64), input_cost (Float64), output_cost (Float64), total_cost (Float64), duration (Float64), metadata (String), session_id (String), user_id (String), status (String), top_span_id (UUID), top_span_name (String), top_span_type (String), trace_type (String), tags (Array(String)), has_browser_session (Bool)
    ///
    /// signal_events: id (UUID), signal_id (UUID), trace_id (UUID), run_id (UUID), name (String), payload (String), timestamp (DateTime64), severity (UInt8, 0=INFO 1=WARNING 2=CRITICAL), summary (String), clusters (Array(UUID), cluster ids this event belongs to, excludes L0)
    ///
    /// signal_runs: signal_id (UUID), job_id (UUID), trigger_id (UUID), run_id (UUID), trace_id (UUID), status (String), event_id (UUID), updated_at (DateTime64)
    ///
    /// clusters: id (UUID), signal_id (UUID), name (String), level (UInt8, higher = coarser grouping), parent_id (UUID, zero/nil UUID '00000000-0000-0000-0000-000000000000' for top-level clusters — NOT SQL NULL, so filter top-level with parent_id = toUUID('00000000-0000-0000-0000-000000000000'), not IS NULL), num_signal_events (UInt32), num_children_clusters (UInt16), created_at (DateTime64), updated_at (DateTime64) — hierarchical groupings of similar signal events, excludes L0 clusters
    ///
    /// evaluation_datapoints: id (UUID), evaluation_id (UUID), data (String), target (String), metadata (String), executor_output (String), index (UInt64), trace_id (UUID), group_id (String), scores (String), created_at (DateTime64), dataset_id (UUID), dataset_datapoint_id (UUID), dataset_datapoint_created_at (DateTime64)
    ///
    /// dataset_datapoints: id (UUID), created_at (DateTime64), dataset_id (UUID), data (String), target (String), metadata (String)
    ///
    /// Joins: spans.trace_id = traces.id, has(signal_events.clusters, clusters.id) to match events to the specific clusters they belong to (use clusters.signal_id = signal_events.signal_id only to scope by signal — it is a many-to-many cross product, not an event-to-cluster match)
    ///
    /// Example queries:
    /// - Recent traces: SELECT id, start_time, total_cost FROM traces ORDER BY start_time DESC LIMIT 10
    /// - LLM spans: SELECT name, model, input, output FROM spans WHERE span_type = 'LLM'
    /// - Errors: SELECT trace_id, name, status FROM spans WHERE status == 'error'
    /// - Top clusters: SELECT name, num_signal_events FROM clusters ORDER BY num_signal_events DESC LIMIT 10
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

        let ro_client = self.clickhouse_ro.clone().ok_or_else(|| {
            McpError::internal_error("ClickHouse read-only client not configured", None)
        })?;

        match sql::execute_sql_query(
            params.query,
            project_id,
            params.parameters,
            SqlQuerySource::Public,
            ro_client,
            self.query_engine.clone(),
            self.http_client.clone(),
            self.db.clone(),
            self.cache.clone(),
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
    ///
    /// If you need full information that is truncated, you should use query_laminar_sql tool to query spans that you're interested in.
    ///
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

        match self
            .compress_trace_for_mcp(project_id, params.trace_id)
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

#[cfg(feature = "signals")]
impl LaminarMcpServer {
    async fn compress_trace_for_mcp(
        &self,
        project_id: Uuid,
        trace_id: Uuid,
    ) -> anyhow::Result<String> {
        use crate::signals::private::compression::{TraceCompressor, render};
        use crate::signals::private::spans::get_trace_ch_spans;
        use crate::traces::previews::PreviewExtractor;

        let llm_client = self.llm_client.clone().ok_or_else(|| {
            anyhow::anyhow!(
                "LLM client unavailable; configure LLM_PROVIDER + credentials to use get_trace_context"
            )
        })?;

        let spans = get_trace_ch_spans(self.clickhouse.clone(), project_id, trace_id).await?;
        if spans.is_empty() {
            return Ok(format!(
                "No spans found for trace {trace_id}. Either the trace does not exist in this project or there are no spans in the trace."
            ));
        }

        let extractor = Arc::new(PreviewExtractor::new(
            self.cache.clone(),
            llm_client.clone(),
        ));
        let compressor = TraceCompressor::new(extractor, self.cache.clone(), llm_client);
        let compressed = compressor
            .compress_for_chat(&spans, project_id, trace_id, None)
            .await
            .map_err(|e| anyhow::anyhow!("Trace compression failed: {}", e))?;

        Ok(render(&compressed))
    }
}

#[cfg(not(feature = "signals"))]
impl LaminarMcpServer {
    async fn compress_trace_for_mcp(
        &self,
        _project_id: Uuid,
        _trace_id: Uuid,
    ) -> anyhow::Result<String> {
        Ok(
            "get_trace_context is unavailable in this build (signals feature disabled)."
                .to_string(),
        )
    }
}

#[tool_handler]
impl ServerHandler for LaminarMcpServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("laminar", env!("CARGO_PKG_VERSION")))
    }
}

// ============ Actix-web handler ============

/// Shared state for the MCP endpoint, passed via actix-web `Data`.
pub struct McpState {
    server: LaminarMcpServer,
}

impl McpState {
    pub fn new(
        clickhouse: clickhouse::Client,
        clickhouse_ro: Option<Arc<ClickhouseReadonlyClient>>,
        query_engine: Arc<QueryEngine>,
        http_client: Arc<reqwest::Client>,
        db: Arc<DB>,
        cache: Arc<Cache>,
        llm_client: Option<Arc<LlmClient>>,
    ) -> Self {
        Self {
            server: LaminarMcpServer::new(
                clickhouse,
                clickhouse_ro,
                query_engine,
                http_client,
                db,
                cache,
                llm_client,
            ),
        }
    }
}

/// POST /v1/mcp — Stateless Streamable HTTP MCP endpoint.
///
/// Follows the MCP Streamable HTTP spec:
/// - Requests → routed through rmcp's ServerHandler, response as JSON
/// - Notifications → 202 Accepted (no body)
#[actix_web::post("")]
pub async fn mcp_handler(
    req: HttpRequest,
    body: web::Bytes,
    state: web::Data<McpState>,
) -> HttpResponse {
    // Parse JSON-RPC message
    let message: ClientJsonRpcMessage = match serde_json::from_slice(&body) {
        Ok(msg) => msg,
        Err(e) => {
            let error_body = serde_json::json!({ "error": format!("Invalid JSON-RPC: {e}") });
            return HttpResponse::BadRequest()
                .content_type("application/json")
                .body(error_body.to_string());
        }
    };

    match message {
        // Notifications (e.g. notifications/initialized) → 202 Accepted
        ClientJsonRpcMessage::Notification(_) => HttpResponse::Accepted().finish(),

        // Responses/Errors from client → 202 Accepted
        ClientJsonRpcMessage::Response(_) | ClientJsonRpcMessage::Error(_) => {
            HttpResponse::Accepted().finish()
        }

        // Requests (initialize, tools/list, tools/call, etc.) → process via rmcp
        ClientJsonRpcMessage::Request(mut request) => {
            // Inject project_id from auth middleware into rmcp extensions
            if let Some(api_key) = req.extensions().get::<ProjectApiKey>() {
                request
                    .request
                    .extensions_mut()
                    .insert(ProjectId(api_key.project_id));
            }

            // Use rmcp's OneshotTransport + serve_directly (same pattern as the
            // official tower handler) to route through our ServerHandler.
            let (transport, mut receiver) =
                OneshotTransport::<RoleServer>::new(ClientJsonRpcMessage::Request(request));
            let service_handle = serve_directly(state.server.clone(), transport, None);

            tokio::spawn(async move {
                let _ = service_handle.waiting().await;
            });

            // Collect the response from the channel
            match receiver.recv().await {
                Some(response) => {
                    let body = serde_json::to_vec(&response).unwrap_or_else(|_| b"{}".to_vec());
                    HttpResponse::Ok()
                        .content_type("application/json")
                        .body(Bytes::from(body))
                }
                None => HttpResponse::InternalServerError()
                    .content_type("application/json")
                    .body("{\"error\": \"No response from handler\"}"),
            }
        }
    }
}

/// Catch-all for non-POST methods (GET, DELETE, etc.) → 405 Method Not Allowed.
/// MCP Streamable HTTP spec requires 405 (not 404) when a method is unsupported.
pub async fn method_not_allowed() -> HttpResponse {
    HttpResponse::MethodNotAllowed()
        .insert_header(("Allow", "POST"))
        .finish()
}
