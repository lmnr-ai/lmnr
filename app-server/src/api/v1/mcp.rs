use std::{borrow::Cow, collections::HashMap, sync::Arc};

use actix_web::{HttpMessage, HttpRequest, HttpResponse, web};
use bytes::Bytes;
use rmcp::{
    ErrorData as McpError, RoleServer, ServerHandler,
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::*,
    schemars,
    service::{RequestContext, serve_directly},
    tool, tool_handler, tool_router,
    transport::OneshotTransport,
};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    auth::cli_user::{McpOAuthUserAuth, is_user_member_of_project},
    cache::Cache,
    db::{DB, project_api_keys::ProjectApiKey},
    llm::LlmClient,
    query_engine::QueryEngine,
    sql::{self, ClickhouseReadonlyClient, SqlQuerySource},
};

const OAUTH_TOOL_NAMES: &[&str] = &["query_laminar_sql", "get_trace_context"];

// ============ Per-request context ============

/// Newtype wrapper to pass project_id through rmcp extensions.
#[derive(Clone)]
pub struct ProjectId(pub Uuid);

// ============ Tool parameter structs ============

/// Parameters for the SQL query tool.
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct QuerySqlParams {
    /// ClickHouse SQL query. Must be SELECT only. See the `query_laminar_sql` tool description for the
    /// full table/column schema, enums, joins, and example queries.
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

/// Parameters for the agent tool. The agent is project-scoped; name any specific entity inline in
/// `prompt`.
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AskAgentParams {
    pub prompt: String,
    /// Server-minted id to continue a prior conversation. Omit to start fresh; the response returns
    /// the new id to pass back on the next call.
    #[serde(default)]
    pub conversation_id: Option<String>,
}

// ============ query_laminar_sql description ============

/// One-line lead for the `query_laminar_sql` tool description; the schema block is shared with the
/// Platform Agent prompt (`query_engine::schema`), the extras below are MCP-only.
const MCP_SQL_INTRO: &str = "Execute a read-only SQL query (full ClickHouse SELECT syntax) against \
this project's Laminar trace data and get rows back as a JSON array. Queries are automatically \
scoped to your project — never filter on or reference a `project_id` column. Only SELECT is allowed.";

/// MCP-only suffix (joins + parameter note + examples) appended after the shared schema block. Kept
/// out of `query_engine::schema` so it doesn't bloat the agent's system prompt (the agent learns
/// joins/examples from its own `<workflow>`/`<principles>` sections).
const MCP_SQL_EXTRAS: &str = r#"<joins>
- spans.trace_id = traces.id
- signal_events.trace_id = traces.id
- has(signal_events.clusters, clusters.id) to match events to the specific clusters they belong to
  (clusters.signal_id = signal_events.signal_id only scopes by signal — it is a many-to-many cross
  product, NOT an event-to-cluster match).
- Top-level clusters have parent_id = the nil UUID '00000000-0000-0000-0000-000000000000' (NOT SQL
  NULL): filter with parent_id = toUUID('00000000-0000-0000-0000-000000000000'), not IS NULL.
</joins>

<parameters>
Use the `parameters` argument for {name:Type} placeholders in the query, e.g. {trace_id:UUID}.
</parameters>

<examples>
- Recent traces: SELECT id, start_time, total_cost FROM traces ORDER BY start_time DESC LIMIT 10
- LLM spans: SELECT name, model, input, output FROM spans WHERE span_type = 'LLM' LIMIT 20
- Errors: SELECT trace_id, name, status FROM spans WHERE status = 'error' LIMIT 20
- Top clusters: SELECT name, num_signal_events FROM clusters ORDER BY num_signal_events DESC LIMIT 10
</examples>"#;

/// The tool name `query_laminar_sql`'s description is injected at construction (see `new`) rather than
/// taken from the `#[tool]` doc comment, so the schema has a single source (`query_engine::schema`).
const QUERY_SQL_TOOL_NAME: &str = "query_laminar_sql";

/// Compose the full `query_laminar_sql` description: MCP intro + shared schema block + MCP extras.
fn query_sql_tool_description() -> String {
    format!(
        "{MCP_SQL_INTRO}\n\n{schema}\n\n{MCP_SQL_EXTRAS}",
        schema = crate::query_engine::schema::build_schema_prompt(),
    )
}

// ============ MCP Server ============

#[derive(Clone)]
pub struct LaminarMcpServer {
    /// Stored so the `#[tool_handler(router = self.tool_router)]` macro serves THIS instance (with the
    /// injected `query_laminar_sql` description) instead of rebuilding a fresh router per request.
    tool_router: ToolRouter<Self>,
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
            tool_router: Self::tool_router_with_descriptions(),
            clickhouse,
            clickhouse_ro,
            query_engine,
            http_client,
            db,
            cache,
            llm_client,
        }
    }

    /// Build the tool router and inject the unified `query_laminar_sql` description (intro + shared
    /// `query_engine::schema` + MCP extras), so the schema has ONE source for both this tool and the
    /// Platform Agent prompt. The map is keyed by tool NAME; a missing entry means the tool was
    /// renamed without updating `QUERY_SQL_TOOL_NAME` (caught by the tests). Other tools keep their
    /// `#[tool]` doc-comment descriptions untouched. Separate from `new` so the resulting router is
    /// testable without the server's DB/CH/cache deps.
    fn tool_router_with_descriptions() -> ToolRouter<Self> {
        let mut router = Self::tool_router();
        match router.map.get_mut(QUERY_SQL_TOOL_NAME) {
            Some(route) => route.attr.description = Some(Cow::Owned(query_sql_tool_description())),
            None => log::error!(
                "MCP tool '{QUERY_SQL_TOOL_NAME}' not found in router; SQL schema not injected into its description"
            ),
        }
        router
    }

    /// Run a read-only ClickHouse SELECT against this project's Laminar data. The real description
    /// (intro + full schema + joins + examples) is injected at construction from
    /// `query_engine::schema` — see `query_sql_tool_description` / `new`.
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
            .get_trace_context_for_mcp(project_id, params.trace_id)
            .await
        {
            Ok(trace_str) => Ok(CallToolResult::success(vec![Content::text(trace_str)])),
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!(
                "Failed to retrieve trace: {}",
                e
            ))])),
        }
    }

    #[tool(name = "ask_agent")]
    async fn ask_agent(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<AskAgentParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = context
            .extensions
            .get::<ProjectId>()
            .ok_or_else(|| McpError::internal_error("Missing project context", None))?
            .0;

        match self
            .run_agent_for_mcp(project_id, params.prompt, params.conversation_id)
            .await
        {
            Ok((answer, conversation_id)) => {
                Ok(CallToolResult::success(vec![Content::text(format!(
                    "{answer}\n\n---\nconversationId: {conversation_id}\n(Pass this `conversationId` to the next `ask_agent` call to continue this conversation.)"
                ))]))
            }
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!(
                "Agent failed: {}",
                e
            ))])),
        }
    }
}

#[cfg(feature = "signals")]
impl LaminarMcpServer {
    async fn get_trace_context_for_mcp(
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

        let extractor = Arc::new(PreviewExtractor::new());
        let compressor = TraceCompressor::new(extractor, self.cache.clone(), llm_client);
        let compressed = compressor
            .compress_for_chat(&spans, project_id, trace_id, None)
            .await
            .map_err(|e| anyhow::anyhow!("Trace compression failed: {}", e))?;

        Ok(render(&compressed))
    }

    /// Run the agent for one question, returning `(answer, conversation_id)`. An existing
    /// `conversation_id` appends to that session; otherwise a fresh `mcp` session is minted.
    async fn run_agent_for_mcp(
        &self,
        project_id: Uuid,
        prompt: String,
        conversation_id: Option<String>,
    ) -> anyhow::Result<(String, String)> {
        use crate::agent::agent::{AgentContext, AgentSource, finalize, run_agent};
        use crate::agent::persist;
        use crate::agent::stream::AgentEvent;
        use tokio::sync::mpsc;

        let llm_client = self.llm_client.clone().ok_or_else(|| {
            anyhow::anyhow!(
                "LLM client unavailable; configure LLM_PROVIDER + credentials to use ask_agent"
            )
        })?;
        let clickhouse_ro = self.clickhouse_ro.clone().ok_or_else(|| {
            anyhow::anyhow!(
                "Read-only ClickHouse client not configured; ask_agent needs it for query_sql"
            )
        })?;

        let internal_project_id =
            std::env::var(crate::env::private::agent::TRACE_CHAT_INTERNAL_PROJECT_ID)
                .ok()
                .and_then(|s| s.parse().ok());

        // Continue the supplied conversation only if it's a user-less (MCP/shared) session; otherwise
        // mint a fresh `mcp` key. The `userless_session_exists` guard stops a project-API caller from
        // continuing another member's user-owned UI/CLI conversation by passing its uuid.
        let conversation_id = match conversation_id {
            Some(key)
                if persist::userless_session_exists(&self.db.pool, &key, project_id).await? =>
            {
                key
            }
            _ => {
                let key = Uuid::now_v7().to_string();
                // MCP is project-key authed — the conversation has no owning user.
                persist::ensure_chat_session(
                    &self.db.pool,
                    &key,
                    project_id,
                    AgentSource::Mcp.as_channel_type(),
                    None,
                )
                .await?;
                key
            }
        };

        let ctx = AgentContext {
            db: self.db.clone(),
            clickhouse: self.clickhouse.clone(),
            project_id,
            llm_client,
            cache: self.cache.clone(),
            query_engine: self.query_engine.clone(),
            clickhouse_ro,
            http_client: self.http_client.clone(),
            internal_project_id,
            // Persist so a follow-up `ask_agent` with the same conversationId sees this turn.
            persist: Some(conversation_id.clone()),
            // MCP names any target entity inline in the prompt; no separate first-turn note.
            system_note: None,
            source: AgentSource::Mcp,
            user_external_id: None,
        };

        // Persistence mode: the agent loop loads prior history; send only the new user turn. `_rx` is
        // unread (MCP is buffered, not streamed); the `message` frames `finalize` emits are no-ops.
        let (tx, _rx) = mpsc::unbounded_channel::<AgentEvent>();
        let run = run_agent(&ctx, &tx, prompt, conversation_id.clone())
            .await
            .map_err(|e| anyhow::anyhow!("Agent run failed: {e:#}"))?;

        // Persist the terminal assistant row so a follow-up `ask_agent` sees this turn.
        finalize(&ctx, &tx, run.final_parts, None, false)
            .await
            .map_err(|e| anyhow::anyhow!("Persisting the agent reply failed: {e:#}"))?;

        let final_text = run.final_text;
        if final_text.is_empty() {
            anyhow::bail!("Agent finished without producing a textual answer.");
        }

        // Keep the conversation off a future GC sweep. Best-effort — never fail an answered turn.
        if let Err(e) = persist::touch_chat_session(&self.db.pool, &conversation_id).await {
            log::warn!("Failed to touch chat session {conversation_id}: {e:#}");
        }

        Ok((final_text, conversation_id))
    }
}

#[cfg(not(feature = "signals"))]
impl LaminarMcpServer {
    async fn get_trace_context_for_mcp(
        &self,
        _project_id: Uuid,
        _trace_id: Uuid,
    ) -> anyhow::Result<String> {
        Ok(
            "get_trace_context is unavailable in this build (signals feature disabled)."
                .to_string(),
        )
    }

    async fn run_agent_for_mcp(
        &self,
        _project_id: Uuid,
        _prompt: String,
        _conversation_id: Option<String>,
    ) -> anyhow::Result<(String, String)> {
        Ok((
            "ask_agent is unavailable in this build (signals feature disabled).".to_string(),
            String::new(),
        ))
    }
}

#[tool_handler(router = self.tool_router)]
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

            serve_request(request, &state).await
        }
    }
}

async fn serve_request(
    request: JsonRpcRequest<ClientRequest>,
    state: &web::Data<McpState>,
) -> HttpResponse {
    let (transport, mut receiver) =
        OneshotTransport::<RoleServer>::new(ClientJsonRpcMessage::Request(request));
    let service_handle = serve_directly(state.server.clone(), transport, None);

    tokio::spawn(async move {
        let _ = service_handle.waiting().await;
    });

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

fn json_rpc_error(id: Value, code: i64, message: &str) -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": { "code": code, "message": message },
    }))
}

fn decorate_oauth_tools_response(response: &mut Value) {
    let Some(tools) = response
        .pointer_mut("/result/tools")
        .and_then(Value::as_array_mut)
    else {
        return;
    };
    tools.retain(|tool| {
        tool.get("name")
            .and_then(Value::as_str)
            .is_some_and(|name| OAUTH_TOOL_NAMES.contains(&name))
    });
    for tool in tools.iter_mut() {
        if let Some(schema) = tool.get_mut("inputSchema").and_then(Value::as_object_mut) {
            let properties = schema
                .entry("properties")
                .or_insert_with(|| serde_json::json!({}));
            if let Some(properties) = properties.as_object_mut() {
                properties.insert(
                    "projectId".to_string(),
                    serde_json::json!({
                        "type": "string",
                        "format": "uuid",
                        "description": "Laminar project ID returned by list_laminar_projects"
                    }),
                );
            }
            let required = schema
                .entry("required")
                .or_insert_with(|| serde_json::json!([]));
            if let Some(required) = required.as_array_mut() {
                required.push(Value::String("projectId".to_string()));
            }
        }
    }
    tools.insert(
        0,
        serde_json::json!({
            "name": "list_laminar_projects",
            "description": "List the Laminar projects the signed-in user can inspect. Call this before querying traces.",
            "inputSchema": { "type": "object", "properties": {} }
        }),
    );
}

/// POST /v1/mcp/oauth — user-scoped OAuth MCP for agent integrations.
///
/// The OAuth token supplies identity only. Project selection is an explicit
/// `projectId` tool argument and membership is checked before project context
/// reaches the existing read-only Laminar tools.
#[actix_web::post("")]
pub async fn oauth_mcp_handler(
    req: HttpRequest,
    body: web::Bytes,
    state: web::Data<McpState>,
) -> HttpResponse {
    let user = match req.extensions().get::<McpOAuthUserAuth>().cloned() {
        Some(user) => user,
        None => return HttpResponse::Unauthorized().finish(),
    };
    let mut raw: Value = match serde_json::from_slice(&body) {
        Ok(value) => value,
        Err(e) => {
            return HttpResponse::BadRequest().json(serde_json::json!({ "error": e.to_string() }));
        }
    };
    let id = raw.get("id").cloned().unwrap_or(Value::Null);
    let method = raw
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    if method == "notifications/initialized" {
        return HttpResponse::Accepted().finish();
    }

    if method == "tools/call" {
        let name = raw
            .pointer("/params/name")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if name == "list_laminar_projects" {
            let projects = match crate::db::projects::get_projects_for_user(
                &state.server.db.pool,
                &user.user_id,
            )
            .await
            {
                Ok(projects) => projects,
                Err(e) => {
                    log::error!("OAuth MCP project discovery failed: {e}");
                    return json_rpc_error(id, -32603, "Failed to list Laminar projects");
                }
            };
            let text = serde_json::to_string_pretty(&projects).unwrap_or_else(|_| "[]".to_string());
            return HttpResponse::Ok().json(serde_json::json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": {
                    "content": [{ "type": "text", "text": text }],
                    "isError": false
                }
            }));
        }
        if !OAUTH_TOOL_NAMES.contains(&name) {
            return json_rpc_error(
                id,
                -32601,
                "Tool is not available on the OAuth MCP resource",
            );
        }

        let project_id = match raw
            .pointer("/params/arguments/projectId")
            .and_then(Value::as_str)
            .and_then(|value| Uuid::parse_str(value).ok())
        {
            Some(project_id) => project_id,
            None => return json_rpc_error(id, -32602, "A valid projectId is required"),
        };
        match is_user_member_of_project(
            &state.server.db.pool,
            &state.server.cache,
            user.user_id,
            project_id,
        )
        .await
        {
            Ok(true) => {}
            Ok(false) => {
                return json_rpc_error(
                    id,
                    -32602,
                    "You do not have access to this Laminar project",
                );
            }
            Err(e) => {
                log::error!("OAuth MCP membership check failed: {e}");
                return json_rpc_error(id, -32603, "Failed to verify Laminar project access");
            }
        }

        if let Some(arguments) = raw
            .pointer_mut("/params/arguments")
            .and_then(Value::as_object_mut)
        {
            arguments.remove("projectId");
        }
        let mut message: ClientJsonRpcMessage = match serde_json::from_value(raw) {
            Ok(message) => message,
            Err(e) => return json_rpc_error(id, -32602, &format!("Invalid tool call: {e}")),
        };
        if let ClientJsonRpcMessage::Request(request) = &mut message {
            request
                .request
                .extensions_mut()
                .insert(ProjectId(project_id));
        }
        return match message {
            ClientJsonRpcMessage::Request(request) => serve_request(request, &state).await,
            _ => json_rpc_error(id, -32600, "Expected a JSON-RPC request"),
        };
    }

    let message: ClientJsonRpcMessage = match serde_json::from_value(raw) {
        Ok(message) => message,
        Err(e) => return json_rpc_error(id, -32600, &format!("Invalid JSON-RPC request: {e}")),
    };
    let request = match message {
        ClientJsonRpcMessage::Request(request) => request,
        ClientJsonRpcMessage::Notification(_)
        | ClientJsonRpcMessage::Response(_)
        | ClientJsonRpcMessage::Error(_) => {
            return HttpResponse::Accepted().finish();
        }
    };

    if method != "tools/list" {
        return serve_request(request, &state).await;
    }

    // Ask the existing server for its canonical schemas, then expose the two
    // read-only trace tools with a required project selector plus discovery.
    let (transport, mut receiver) =
        OneshotTransport::<RoleServer>::new(ClientJsonRpcMessage::Request(request));
    let service_handle = serve_directly(state.server.clone(), transport, None);
    tokio::spawn(async move {
        let _ = service_handle.waiting().await;
    });
    let Some(response) = receiver.recv().await else {
        return json_rpc_error(id, -32603, "No response from Laminar MCP");
    };
    let mut response = serde_json::to_value(response).unwrap_or_else(|_| serde_json::json!({}));
    decorate_oauth_tools_response(&mut response);
    HttpResponse::Ok().json(response)
}

/// Catch-all for non-POST methods (GET, DELETE, etc.) → 405 Method Not Allowed.
/// MCP Streamable HTTP spec requires 405 (not 404) when a method is unsupported.
pub async fn method_not_allowed() -> HttpResponse {
    HttpResponse::MethodNotAllowed()
        .insert_header(("Allow", "POST"))
        .finish()
}

/// RFC 9728 protected-resource metadata for OAuth MCP discovery.
pub async fn oauth_protected_resource_metadata() -> HttpResponse {
    let resource = std::env::var(crate::env::notifications::LAMINAR_MCP_RESOURCE_URL)
        .unwrap_or_else(|_| "http://localhost:8000/v1/mcp/oauth".to_string());
    let frontend = std::env::var(crate::env::notifications::NEXT_PUBLIC_URL)
        .unwrap_or_else(|_| "http://localhost:3000".to_string())
        .trim_end_matches('/')
        .to_string();
    HttpResponse::Ok().json(serde_json::json!({
        "resource": resource,
        "authorization_servers": [format!("{frontend}/api/auth")],
        "scopes_supported": ["mcp:read"],
        "bearer_methods_supported": ["header"]
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Look up a tool's definition from the fully-built (description-injected) router.
    fn tool(name: &str) -> Tool {
        LaminarMcpServer::tool_router_with_descriptions()
            .get(name)
            .unwrap_or_else(|| panic!("tool '{name}' not registered in router"))
            .clone()
    }

    /// Exactly the three expected tools are exposed, with the right names — nothing dropped or added
    /// by the router/description refactor.
    #[test]
    fn router_exposes_expected_tools() {
        let names: Vec<String> = LaminarMcpServer::tool_router_with_descriptions()
            .list_all()
            .into_iter()
            .map(|t| t.name.to_string())
            .collect();
        assert_eq!(
            names,
            vec!["ask_agent", "get_trace_context", "query_laminar_sql"],
            "unexpected MCP tool set (list_all is sorted by name)"
        );
    }

    /// `query_laminar_sql`'s description is the INJECTED one (intro + shared schema + MCP extras),
    /// not the trimmed one-line doc comment. The schema block is keyed by tool name, so a rename
    /// without updating `QUERY_SQL_TOOL_NAME` would silently drop it — this catches that in CI.
    #[test]
    fn query_sql_tool_has_injected_schema_description() {
        let desc = tool(QUERY_SQL_TOOL_NAME)
            .description
            .expect("query_laminar_sql must have a description")
            .to_string();
        assert!(
            desc.contains("full ClickHouse SELECT syntax"),
            "intro missing"
        );
        assert!(desc.contains("TABLE spans"), "shared schema block missing");
        assert!(
            desc.contains("TABLE clusters"),
            "shared schema missing clusters"
        );
        assert!(desc.contains("span_type:"), "shared enum block missing");
        assert!(desc.contains("<examples>"), "MCP extras missing");
        assert!(
            !desc.contains("The real description"),
            "doc comment leaked instead of the injected description"
        );
    }

    /// The query tool still advertises its two input params after the param-doc slimming.
    #[test]
    fn query_sql_tool_input_schema_has_params() {
        let schema = serde_json::to_string(&tool(QUERY_SQL_TOOL_NAME).input_schema)
            .expect("input_schema serializes");
        assert!(
            schema.contains("query"),
            "`query` param missing from input schema"
        );
        assert!(
            schema.contains("parameters"),
            "`parameters` missing from input schema"
        );
    }

    /// The OTHER tools keep their `#[tool]` doc-comment descriptions — the refactor only touches
    /// `query_laminar_sql`.
    #[test]
    fn other_tools_keep_doc_comment_descriptions() {
        let trace = tool("get_trace_context")
            .description
            .expect("get_trace_context keeps its doc-comment description")
            .to_string();
        assert!(
            trace.contains("LLM-optimized summary of a trace"),
            "get_trace_context description changed unexpectedly: {trace}"
        );
    }

    #[test]
    fn oauth_tool_list_is_read_only_and_requires_project_selection() {
        let mut response = serde_json::json!({
            "result": {
                "tools": [
                    { "name": "ask_agent", "inputSchema": { "type": "object", "properties": {} } },
                    { "name": "get_trace_context", "inputSchema": { "type": "object", "properties": {} } },
                    { "name": "query_laminar_sql", "inputSchema": { "type": "object", "properties": {} } }
                ]
            }
        });

        decorate_oauth_tools_response(&mut response);

        let tools = response["result"]["tools"].as_array().expect("tools array");
        let names: Vec<_> = tools
            .iter()
            .filter_map(|tool| tool["name"].as_str())
            .collect();
        assert_eq!(
            names,
            vec![
                "list_laminar_projects",
                "get_trace_context",
                "query_laminar_sql"
            ]
        );
        for tool in tools.iter().skip(1) {
            assert_eq!(
                tool["inputSchema"]["properties"]["projectId"]["format"],
                "uuid"
            );
            assert_eq!(
                tool["inputSchema"]["required"],
                serde_json::json!(["projectId"])
            );
        }
    }
}
