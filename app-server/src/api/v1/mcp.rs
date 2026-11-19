use std::{borrow::Cow, collections::HashMap, sync::Arc};

use actix_web::{HttpMessage, HttpRequest, HttpResponse, web};
use bytes::Bytes;
use rmcp::{
    ErrorData as McpError, RoleServer, ServerHandler,
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::{
        CallToolResponse, CallToolResult, ClientJsonRpcMessage, ContentBlock, GetExtensions,
        Implementation, ServerCapabilities, ServerConfig,
    },
    schemars,
    service::{RequestContext, serve_directly},
    tool, tool_handler, tool_router,
    transport::OneshotTransport,
};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{
    access_policy::{self, AccessPolicy, Actor},
    audit::{
        self, AuditAction, AuditActor, AuditEventInput, AuditOutcome, AuditResource, AuditSource,
    },
    auth::{
        cli_user::is_user_member_of_project,
        mcp_oauth::{McpCaller, McpUser},
    },
    cache::Cache,
    db::{self, DB},
    mq::MessageQueue,
    query_engine::QueryEngine,
    sql::{self, ClickhouseReadonlyClient, SqlQuerySource},
};

// ============ Per-request context ============

/// The caller and the project a tool call acts on, after membership checks.
struct ProjectScope {
    caller: McpCaller,
    project_id: Uuid,
}

// ============ Tool parameter structs ============

/// Project selector shared by every project-scoped tool.
#[derive(Debug, Default, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProjectParam {
    /// Laminar project to act on. Required when signed in with OAuth: call `list_projects` and
    /// pass the project's id. Ignored for a project API key, which is bound to its project.
    #[serde(default)]
    pub project_id: Option<Uuid>,
}

/// Parameters for the SQL query tool.
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct QuerySqlParams {
    /// ClickHouse SQL query. Must be SELECT only. See the `query_laminar_sql` tool description for the
    /// full table/column schema, enums, joins, and example queries.
    pub query: String,
    /// Query parameters for {name:Type} placeholders, e.g., {trace_id:UUID}
    #[serde(default)]
    pub parameters: HashMap<String, Value>,
    #[serde(flatten)]
    pub project: ProjectParam,
}

/// Parameters for the trace context tool.
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GetTraceContextParams {
    /// The trace ID to retrieve: 32 hex digits, either as a hyphenated GUID (e.g.,
    /// '123e4567-e89b-12d3-a456-426614174000') or unhyphenated as in OpenTelemetry
    /// (e.g., '123e4567e89b12d3a456426614174000')
    // Not advertised as `format: uuid`: zod maps that to the RFC-strict `z.uuid()`, which rejects
    // valid OTel trace ids. The pattern mirrors the two forms OTel/Laminar emit; `Uuid` parses both.
    #[schemars(
        with = "String",
        regex(
            pattern = r"^(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[0-9a-fA-F]{32})$"
        )
    )]
    pub trace_id: Uuid,
    #[serde(flatten)]
    pub project: ProjectParam,
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
    #[serde(flatten)]
    pub project: ProjectParam,
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
- trace_outputs.trace_id = traces.id
- has(signal_events.clusters, clusters.id) to match events to the specific clusters they belong to
  (clusters.signal_id = signal_events.signal_id only scopes by signal — it is a many-to-many cross
  product, NOT an event-to-cluster match).
- signals.id = signal_events.signal_id (and signal_runs.signal_id, e.signal_id after ARRAY JOIN traces.signal_events AS e)
  for a signal's prompt, schema, model or version. Likewise evaluations.id =
  evaluation_trials.evaluation_id and datasets.id = dataset_datapoints.dataset_id. Names need no
  join: signal_events.signal_name, evaluation_trials.evaluation_name, dataset_datapoints.dataset_name.
- For per-trace signal/cluster questions prefer traces.signal_events and traces.clusters over joining
  signal_events. ARRAY JOIN signal_events AS e, ARRAY JOIN clusters AS c.
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

/// Sent on `initialize`; tells the model how project selection works.
const SERVER_INSTRUCTIONS: &str = "Laminar is an observability platform for AI agents. Every \
tool acts on one Laminar project. With a project API key the project is fixed. When signed in \
with OAuth, call `list_projects` and pass the project's id as `projectId` to every other tool.";

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
    queue: Arc<MessageQueue>,
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
        queue: Arc<MessageQueue>,
    ) -> Self {
        Self {
            tool_router: Self::tool_router_with_descriptions(),
            clickhouse,
            clickhouse_ro,
            query_engine,
            http_client,
            db,
            cache,
            queue,
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
    ) -> Result<CallToolResponse, McpError> {
        let scope = match self
            .project_scope(&context, params.project.project_id)
            .await
        {
            Ok(scope) => scope,
            Err(error) => return Ok(error),
        };

        let ro_client = self.clickhouse_ro.clone().ok_or_else(|| {
            McpError::internal_error("ClickHouse read-only client not configured", None)
        })?;

        let query = params.query.clone();
        let result = sql::run_sql_query(
            params.query,
            scope.project_id,
            params.parameters,
            SqlQuerySource::Public,
            self.policy(&scope).await,
            ro_client,
            self.query_engine.clone(),
            self.http_client.clone(),
            self.db.clone(),
            self.cache.clone(),
        )
        .await;
        let tables = result.as_ref().map(|output| output.tables.clone());
        self.audit(
            &scope,
            AuditResource::Sql,
            AuditAction::Query,
            result.is_ok(),
            None,
            Some(json!({ "query": query, "tables": tables.unwrap_or_default() })),
        )
        .await;
        match result {
            Ok(output) => Ok(CallToolResult::success(vec![ContentBlock::text(
                serde_json::to_string_pretty(&output.rows).unwrap_or_default(),
            )])
            .into()),
            Err(e) => Ok(CallToolResult::error(vec![ContentBlock::text(e.to_string())]).into()),
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
    ) -> Result<CallToolResponse, McpError> {
        let scope = match self
            .project_scope(&context, params.project.project_id)
            .await
        {
            Ok(scope) => scope,
            Err(error) => return Ok(error),
        };

        let result = self
            .get_trace_context_for_mcp(&scope, params.trace_id)
            .await;
        self.audit(
            &scope,
            AuditResource::Trace,
            AuditAction::View,
            result.is_ok(),
            Some(params.trace_id.to_string()),
            None,
        )
        .await;
        match result {
            Ok(trace_str) => {
                Ok(CallToolResult::success(vec![ContentBlock::text(trace_str)]).into())
            }
            Err(e) => Ok(CallToolResult::error(vec![ContentBlock::text(format!(
                "Failed to retrieve trace: {}",
                e
            ))])
            .into()),
        }
    }

    #[tool(name = "ask_agent")]
    async fn ask_agent(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<AskAgentParams>,
    ) -> Result<CallToolResponse, McpError> {
        let scope = match self
            .project_scope(&context, params.project.project_id)
            .await
        {
            Ok(scope) => scope,
            Err(error) => return Ok(error),
        };

        let result = self
            .run_agent_for_mcp(&scope, params.prompt, params.conversation_id)
            .await;
        self.audit(
            &scope,
            AuditResource::Agent,
            AuditAction::Run,
            result.is_ok(),
            result.as_ref().ok().map(|(_, id)| id.to_string()),
            None,
        )
        .await;
        match result {
            Ok((answer, conversation_id)) => {
                Ok(CallToolResult::success(vec![ContentBlock::text(format!(
                    "{answer}\n\n---\nconversationId: {conversation_id}\n(Pass this `conversationId` to the next `ask_agent` call to continue this conversation.)"
                ))]).into())
            }
            Err(e) => Ok(CallToolResult::error(vec![ContentBlock::text(format!(
                "Agent failed: {}",
                e
            ))]).into()),
        }
    }

    /// List the Laminar projects this connection can act on, with their workspaces. Pass a
    /// project's `id` as `projectId` to the other tools.
    #[tool(name = "list_projects")]
    async fn list_projects(
        &self,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, McpError> {
        let Some(caller) = context.extensions.get::<McpCaller>() else {
            return Err(McpError::internal_error("Missing caller context", None));
        };
        let projects = match caller {
            McpCaller::User(user) => self.user_projects(user).await,
            McpCaller::ApiKey(key) => {
                db::projects::get_project_name(&self.db.pool, &key.project_id)
                    .await
                    .map(|name| vec![json!({ "id": key.project_id, "name": name })])
            }
        };
        match projects {
            Ok(projects) => Ok(CallToolResult::success(vec![ContentBlock::text(
                serde_json::to_string_pretty(&json!({ "projects": projects })).unwrap_or_default(),
            )])
            .into()),
            Err(e) => Ok(tool_error(format!("Failed to list projects: {e}"))),
        }
    }
}

fn tool_error(message: impl Into<String>) -> CallToolResponse {
    CallToolResult::error(vec![ContentBlock::text(message.into())]).into()
}

impl LaminarMcpServer {
    async fn user_projects(&self, user: &McpUser) -> anyhow::Result<Vec<Value>> {
        let projects = db::projects::get_projects_for_user(&self.db.pool, &user.user_id).await?;
        Ok(projects
            .into_iter()
            .map(|project| serde_json::to_value(project).unwrap_or_default())
            .collect())
    }

    /// Resolve the project a tool call acts on. An API key is bound to its project. An OAuth
    /// user must pass `projectId`; membership is checked on every call. The error is a tool result the model reads.
    async fn project_scope(
        &self,
        context: &RequestContext<RoleServer>,
        requested: Option<Uuid>,
    ) -> Result<ProjectScope, CallToolResponse> {
        let Some(caller) = context.extensions.get::<McpCaller>().cloned() else {
            return Err(tool_error("Missing caller context"));
        };
        let user = match &caller {
            McpCaller::ApiKey(key) => {
                return match requested {
                    Some(project_id) if project_id != key.project_id => Err(tool_error(format!(
                        "This connection uses a project API key for project {}; it cannot access project {project_id}.",
                        key.project_id
                    ))),
                    _ => Ok(ProjectScope {
                        project_id: key.project_id,
                        caller,
                    }),
                };
            }
            McpCaller::User(user) => user,
        };

        let Some(project_id) = requested else {
            return Err(tool_error(
                "Pass `projectId`. Call `list_projects` to see your projects.",
            ));
        };

        match is_user_member_of_project(&self.db.pool, &self.cache, user.user_id, project_id).await
        {
            Ok(true) => Ok(ProjectScope { caller, project_id }),
            Ok(false) => Err(tool_error(format!(
                "Project {project_id} not found or you are not a member of it. Call `list_projects` to see your projects."
            ))),
            Err(e) => {
                log::error!("MCP membership check failed: {e}");
                Err(tool_error("Failed to verify project membership"))
            }
        }
    }

    /// API keys read under the `ApiKey` policy; OAuth users under the `Cli` one, since an MCP
    /// session is an agent acting for the user (docs/internal/rbac.md).
    async fn policy(&self, scope: &ProjectScope) -> AccessPolicy {
        let actor = match scope.caller {
            McpCaller::ApiKey(_) => Actor::ApiKey,
            McpCaller::User(_) => Actor::Cli,
        };
        access_policy::for_actor_or_masked(
            &actor,
            scope.project_id,
            self.db.clone(),
            self.cache.clone(),
        )
        .await
    }

    /// Record a tool call made by the request's API key or user.
    async fn audit(
        &self,
        scope: &ProjectScope,
        resource: AuditResource,
        action: AuditAction,
        success: bool,
        resource_id: Option<String>,
        metadata: Option<Value>,
    ) {
        let outcome = if success {
            AuditOutcome::Success
        } else {
            AuditOutcome::Error
        };
        let actor = match &scope.caller {
            McpCaller::ApiKey(key) => AuditActor::api_key(key),
            McpCaller::User(user) => AuditActor::User {
                user_id: user.user_id,
            },
        };
        let mut input = AuditEventInput::new(actor, AuditSource::Mcp, resource, action, outcome);
        input.project_id = Some(scope.project_id);
        input.resource_id = resource_id;
        input.metadata = metadata;
        audit::emit_detached(
            self.db.clone(),
            self.cache.clone(),
            self.queue.clone(),
            input,
        );
    }
}

#[cfg(feature = "signals")]
const LICENSE_REQUIRED_MESSAGE: &str =
    "This tool requires a Laminar enterprise license. Add a license key in Settings → License.";

#[cfg(feature = "signals")]
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

#[cfg(not(feature = "signals"))]
impl LaminarMcpServer {
    async fn get_trace_context_for_mcp(
        &self,
        _scope: &ProjectScope,
        _trace_id: Uuid,
    ) -> anyhow::Result<String> {
        Ok(
            "get_trace_context is unavailable in this build (signals feature disabled)."
                .to_string(),
        )
    }

    async fn run_agent_for_mcp(
        &self,
        _scope: &ProjectScope,
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
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("laminar", env!("CARGO_PKG_VERSION")))
            .with_instructions(SERVER_INSTRUCTIONS)
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
        queue: Arc<MessageQueue>,
    ) -> Self {
        Self {
            server: LaminarMcpServer::new(
                clickhouse,
                clickhouse_ro,
                query_engine,
                http_client,
                db,
                cache,
                queue,
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
            // Hand the authenticated caller (from `mcp_auth`) to the tools.
            let extensions = request.request.extensions_mut();
            if let Some(caller) = req.extensions().get::<McpCaller>() {
                extensions.insert(caller.clone());
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

#[cfg(test)]
mod tests {
    use super::*;
    use rmcp::model::Tool;

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
            vec![
                "ask_agent",
                "get_trace_context",
                "list_projects",
                "query_laminar_sql"
            ],
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
        assert!(
            schema.contains("projectId"),
            "flattened `projectId` missing from input schema"
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
}
