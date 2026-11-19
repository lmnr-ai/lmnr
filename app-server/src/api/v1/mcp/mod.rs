use std::{collections::HashMap, future::Future, sync::Arc};

use actix_web::{HttpMessage, HttpRequest, HttpResponse, http::header, web};
use bytes::Bytes;
use rmcp::{
    ErrorData as McpError, RoleServer, ServerHandler,
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::{
        CallToolResponse, CallToolResult, ClientJsonRpcMessage, ContentBlock, GetExtensions, Icon,
        Implementation, ServerCapabilities, ServerConfig,
    },
    schemars,
    service::{RequestContext, serve_directly},
    tool, tool_handler, tool_router,
    transport::OneshotTransport,
};
use serde::Serialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{
    access_policy::{self, AccessPolicy, Actor},
    audit::{
        self, AuditAction, AuditActor, AuditEventInput, AuditOutcome, AuditResource, AuditSource,
    },
    auth::{
        cli_user::is_user_member_of_project,
        mcp_oauth::{McpCaller, McpOAuthConfig, McpUser},
    },
    cache::Cache,
    db::{self, DB},
    mq::MessageQueue,
    query_engine::QueryEngine,
    sql::{self, ClickhouseReadonlyClient, SqlQueryError, SqlQuerySource},
};

#[cfg(feature = "signals")]
mod enterprise;
mod llm_profiles;
mod signals;
mod traces;

// ============ Per-request context ============

/// The caller and the project a tool call acts on, after membership checks.
#[derive(Clone)]
struct ProjectScope {
    caller: McpCaller,
    project_id: Uuid,
}

// ============ Tool parameter structs ============

/// Project selector shared by every project-scoped tool.
#[derive(Debug, Default, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProjectParam {
    /// The Laminar project to act on, as returned by `list_projects`. OAuth sessions must name
    /// it; a project API key is bound to one project and may leave it out.
    #[serde(default)]
    pub project_id: Option<Uuid>,
}

/// Parameters for the SQL query tool.
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct QuerySqlParams {
    /// The SELECT statement to run, written against the tables `get_sql_schema` describes.
    pub query: String,
    /// Values for the `{name:Type}` placeholders in `query`, keyed by name: `{"trace_id": "..."}`
    /// fills `{trace_id:UUID}`.
    #[serde(default, deserialize_with = "crate::utils::null_as_default")]
    pub parameters: HashMap<String, Value>,
    #[serde(flatten)]
    pub project: ProjectParam,
}

/// A trace id as a hyphenated GUID or the 32 hex digits OpenTelemetry emits; `Uuid` parses both.
const TRACE_ID_PATTERN: &str = r"^(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[0-9a-fA-F]{32})$";

// ============ SQL schema ============

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

/// What `get_sql_schema` returns. It is a tool result rather than part of `query_laminar_sql`'s
/// description because Claude Code truncates descriptions past 2 KB.
fn sql_schema_text() -> String {
    format!(
        "{schema}\n\n{MCP_SQL_EXTRAS}",
        schema = crate::query_engine::schema::build_schema_prompt(),
    )
}

/// Sent on `initialize`.
const SERVER_INSTRUCTIONS: &str = "Laminar is an observability platform for AI agents: traces, \
spans, evaluations and signals (LLM judges that flag patterns in traces). Every tool except \
`list_projects` and `get_sql_schema` acts on one Laminar project. With a project API key the \
project is fixed. When signed in with OAuth, call `list_projects` and pass the project's id as \
`projectId` to every other tool. To answer questions about traces, call `get_sql_schema` once, \
then `query_laminar_sql`.";

// ============ MCP Server ============

#[derive(Clone)]
pub struct LaminarMcpServer {
    /// Every area's tools, summed once; the `#[tool_handler]` default would serve only this file's.
    tool_router: ToolRouter<Self>,
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
            tool_router: Self::all_tools(),
            clickhouse,
            clickhouse_ro,
            query_engine,
            http_client,
            db,
            cache,
            queue,
        }
    }

    /// Every area's router; a new tool file's must be added here, or its tools are silently
    /// missing. Separate from `new` so tests can list the tools without the server's deps.
    fn all_tools() -> ToolRouter<Self> {
        let router = Self::tool_router()
            + Self::signal_tools()
            + Self::llm_profile_tools()
            + Self::trace_tools();
        #[cfg(feature = "signals")]
        let router = router + Self::enterprise_tools();
        router
    }

    /// Run a read-only ClickHouse SELECT on the project's Laminar data and get the rows back as
    /// a JSON array. Call `get_sql_schema` first for the tables, columns, enum values, joins and
    /// examples. Queries are already scoped to the project: never filter on or select a
    /// `project_id` column.
    #[tool(
        name = "query_laminar_sql",
        title = "Query Laminar SQL",
        annotations(
            title = "Query Laminar SQL",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn query_laminar_sql(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<QuerySqlParams>,
    ) -> Result<CallToolResponse, McpError> {
        let query = params.query.clone();
        let audit = Audit::new(AuditResource::Sql, AuditAction::Query)
            .metadata(json!({ "query": query, "tables": [] }));
        self.run(
            "query_laminar_sql",
            &context,
            params.project.project_id,
            Some(audit),
            |scope: ProjectScope| async move {
                let ro_client = self.clickhouse_ro.clone().ok_or_else(|| {
                    ToolError::Internal(anyhow::anyhow!(
                        "ClickHouse read-only client not configured"
                    ))
                })?;
                let output = sql::run_sql_query(
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
                .await
                .map_err(|e| match e {
                    SqlQueryError::ValidationError(_) | SqlQueryError::BadResponseError(_) => {
                        ToolError::message(format!(
                            "{e}\n\nCall `get_sql_schema` for the tables and columns you can query."
                        ))
                    }
                    e => ToolError::message(e.to_string()),
                })?;
                Ok(ToolOutput::json(&output.rows)
                    .metadata(json!({ "query": query, "tables": output.tables })))
            },
        )
        .await
    }

    /// Get the schema `query_laminar_sql` runs against: every table with its columns and what
    /// they mean, the accepted enum values, join keys and example queries. It is the same for
    /// every project, so one call per session is enough.
    #[tool(
        name = "get_sql_schema",
        title = "Get SQL schema",
        annotations(
            title = "Get SQL schema",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn get_sql_schema(&self) -> Result<CallToolResponse, McpError> {
        Ok(CallToolResult::success(vec![ContentBlock::text(sql_schema_text())]).into())
    }

    /// List the Laminar projects this connection can act on, each with its `id`, `name` and
    /// (for OAuth sessions) workspace. Pass a project's `id` as `projectId` to the other tools.
    #[tool(
        name = "list_projects",
        title = "List projects",
        annotations(
            title = "List projects",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
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

// ============ Tool runner ============

/// Why a tool call failed. The model reads `Message`; an `Internal` cause is logged, not shown.
enum ToolError {
    Message(String),
    Internal(anyhow::Error),
}

impl ToolError {
    fn message(message: impl Into<String>) -> Self {
        Self::Message(message.into())
    }

    fn into_response(self, tool: &str) -> CallToolResponse {
        match self {
            Self::Message(message) => tool_error(message),
            Self::Internal(e) => {
                log::error!("MCP tool {tool} failed: {e:?}");
                // The cause stays in the logs: it can name internal hosts or queries.
                tool_error(format!(
                    "`{tool}` failed on Laminar's side, not because of its arguments. \
                     Retry shortly; if it keeps failing, report it to Laminar support."
                ))
            }
        }
    }
}

impl From<anyhow::Error> for ToolError {
    fn from(e: anyhow::Error) -> Self {
        Self::Internal(e)
    }
}

/// A successful tool call: the response, plus what its audit event names when that is only
/// known after the call (a created resource's id, the tables a query read).
struct ToolOutput {
    response: CallToolResponse,
    target: Option<AuditTarget>,
    metadata: Option<Value>,
}

impl ToolOutput {
    fn json<T: Serialize>(value: &T) -> Self {
        Self::text(serde_json::to_string_pretty(value).unwrap_or_default())
    }

    fn text(text: impl Into<String>) -> Self {
        Self {
            response: CallToolResult::success(vec![ContentBlock::text(text.into())]).into(),
            target: None,
            metadata: None,
        }
    }

    fn target(mut self, target: AuditTarget) -> Self {
        self.target = Some(target);
        self
    }

    fn metadata(mut self, metadata: Value) -> Self {
        self.metadata = Some(metadata);
        self
    }
}

/// The audit event a tool emits. `target` and `metadata` describe a failed call; a successful
/// call's [`ToolOutput`] can replace them.
struct Audit {
    resource: AuditResource,
    action: AuditAction,
    target: AuditTarget,
    metadata: Option<Value>,
}

impl Audit {
    fn new(resource: AuditResource, action: AuditAction) -> Self {
        Self {
            resource,
            action,
            target: AuditTarget::default(),
            metadata: None,
        }
    }

    fn target(mut self, target: AuditTarget) -> Self {
        self.target = target;
        self
    }

    fn metadata(mut self, metadata: Value) -> Self {
        self.metadata = Some(metadata);
        self
    }
}

/// The written resource an audit event names.
#[derive(Default)]
struct AuditTarget {
    id: Option<String>,
    label: Option<String>,
}

impl AuditTarget {
    fn id(id: impl ToString) -> Self {
        Self {
            id: Some(id.to_string()),
            label: None,
        }
    }

    fn named(id: impl ToString, label: impl Into<String>) -> Self {
        Self {
            id: Some(id.to_string()),
            label: Some(label.into()),
        }
    }
}

impl LaminarMcpServer {
    /// Every project-scoped tool goes through here: resolve the project, run the body, emit
    /// `audit` (when given), and render the result. A failed project check is not audited.
    async fn run<Fut>(
        &self,
        tool: &str,
        context: &RequestContext<RoleServer>,
        project_id: Option<Uuid>,
        audit: Option<Audit>,
        body: impl FnOnce(ProjectScope) -> Fut,
    ) -> Result<CallToolResponse, McpError>
    where
        Fut: Future<Output = Result<ToolOutput, ToolError>>,
    {
        let scope = match self.project_scope(context, project_id).await {
            Ok(scope) => scope,
            Err(e) => return Ok(e.into_response(tool)),
        };
        let mut result = body(scope.clone()).await;
        if let Some(audit) = audit {
            let (success, target, metadata) = match &mut result {
                Ok(output) => (
                    true,
                    output.target.take().unwrap_or(audit.target),
                    output.metadata.take().or(audit.metadata),
                ),
                Err(_) => (false, audit.target, audit.metadata),
            };
            self.emit_audit(
                &scope,
                audit.resource,
                audit.action,
                success,
                target,
                metadata,
            );
        }
        Ok(match result {
            Ok(output) => output.response,
            Err(e) => e.into_response(tool),
        })
    }
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
    ) -> Result<ProjectScope, ToolError> {
        let Some(caller) = context.extensions.get::<McpCaller>().cloned() else {
            return Err(ToolError::Internal(anyhow::anyhow!(
                "missing caller context"
            )));
        };
        let user = match &caller {
            McpCaller::ApiKey(key) => {
                return match requested {
                    Some(project_id) if project_id != key.project_id => {
                        Err(ToolError::message(format!(
                            "This connection uses a project API key for project {}; it cannot access project {project_id}.",
                            key.project_id
                        )))
                    }
                    _ => Ok(ProjectScope {
                        project_id: key.project_id,
                        caller,
                    }),
                };
            }
            McpCaller::User(user) => user,
        };

        let Some(project_id) = requested else {
            return Err(ToolError::message(
                "Pass `projectId`. Call `list_projects` to see your projects.",
            ));
        };

        match is_user_member_of_project(&self.db.pool, &self.cache, user.user_id, project_id).await
        {
            Ok(true) => Ok(ProjectScope { caller, project_id }),
            Ok(false) => Err(ToolError::message(format!(
                "Project {project_id} not found or you are not a member of it. Call `list_projects` to see your projects."
            ))),
            Err(e) => {
                log::error!("MCP membership check failed: {e}");
                Err(ToolError::message("Failed to verify project membership"))
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
    fn emit_audit(
        &self,
        scope: &ProjectScope,
        resource: AuditResource,
        action: AuditAction,
        success: bool,
        target: AuditTarget,
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
        input.resource_id = target.id;
        input.resource_label = target.label;
        input.metadata = metadata;
        audit::emit_detached(
            self.db.clone(),
            self.cache.clone(),
            self.queue.clone(),
            input,
        );
    }
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for LaminarMcpServer {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(server_info())
            .with_instructions(SERVER_INSTRUCTIONS)
    }
}

/// Sent on `initialize` and in the server card. The card caps `description` at 100 characters.
fn server_info() -> Implementation {
    let icons = vec![
        Icon::new("https://laminar.sh/brand/icon.svg")
            .with_mime_type("image/svg+xml")
            .with_sizes(vec!["any".to_string()]),
        Icon::new("https://laminar.sh/brand/logo-square.png")
            .with_mime_type("image/png")
            .with_sizes(vec!["560x560".to_string()]),
    ];
    Implementation::new("laminar", env!("CARGO_PKG_VERSION"))
        .with_title("Laminar")
        .with_description(
            "Query your AI agents' traces with SQL and manage the signals that analyze them.",
        )
        .with_website_url("https://laminar.sh/docs/platform/mcp")
        .with_icons(icons)
}

/// GET /v1/mcp/server-card: the public MCP Server Card (SEP-2127) that directories read before
/// connecting. It advertises `MCP_RESOURCE_URL`, so a deployment without OAuth has no card.
pub async fn server_card(oauth: web::Data<Option<McpOAuthConfig>>) -> HttpResponse {
    let Some(oauth) = oauth.as_ref() else {
        return HttpResponse::NotFound().finish();
    };
    let info = server_info();
    let card = json!({
        "$schema": "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
        "name": "sh.laminar/mcp",
        "version": info.version,
        "title": info.title,
        "description": info.description,
        "websiteUrl": info.website_url,
        "icons": info.icons,
        "remotes": [{ "type": "streamable-http", "url": oauth.resource() }],
    });
    HttpResponse::Ok()
        .content_type("application/mcp-server-card+json")
        .insert_header((header::ACCESS_CONTROL_ALLOW_ORIGIN, "*"))
        .insert_header((header::CACHE_CONTROL, "public, max-age=3600"))
        .body(card.to_string())
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

    fn tool(name: &str) -> Tool {
        LaminarMcpServer::all_tools()
            .get(name)
            .unwrap_or_else(|| panic!("tool '{name}' not registered in router"))
            .clone()
    }

    /// Exactly the expected tools are exposed, with the right names: nothing dropped or added by
    /// merging the per-area routers.
    #[test]
    fn router_exposes_expected_tools() {
        let names: Vec<String> = LaminarMcpServer::all_tools()
            .list_all()
            .into_iter()
            .map(|t| t.name.to_string())
            .collect();
        let mut expected = vec![
            "add_trace_tags",
            "create_llm_profile",
            "create_signal",
            "delete_llm_profile",
            "delete_signal",
            "get_llm_profile",
            "get_signal",
            "get_sql_schema",
            "list_llm_profiles",
            "list_projects",
            "list_signal_versions",
            "list_signals",
            "query_laminar_sql",
            "update_llm_profile",
            "update_signal",
        ];
        // Enterprise tools are listed only when their implementation is compiled in.
        if cfg!(feature = "signals") {
            expected.extend(["ask_agent", "get_trace_context"]);
            expected.sort();
        }
        assert_eq!(
            names, expected,
            "unexpected MCP tool set (list_all is sorted by name)"
        );
    }

    /// Claude's connector directory requires a title and an explicit read/destructive hint on every
    /// tool; clients use them to decide which calls run without confirmation.
    #[test]
    fn every_tool_has_title_and_safety_hints() {
        for tool in LaminarMcpServer::all_tools().list_all() {
            let name = tool.name.to_string();
            assert!(tool.title.is_some(), "{name} has no title");
            let annotations = tool
                .annotations
                .unwrap_or_else(|| panic!("{name} has no annotations"));
            assert!(
                annotations.title.is_some(),
                "{name} has no annotations.title"
            );
            let read_only = annotations
                .read_only_hint
                .unwrap_or_else(|| panic!("{name} has no readOnlyHint"));
            let destructive = annotations.destructive_hint;
            assert!(
                read_only || destructive.is_some(),
                "write tool {name} has no destructiveHint"
            );
            let is_read = ["list_", "get_", "query_", "ask_"]
                .iter()
                .any(|p| name.starts_with(p));
            assert_eq!(
                read_only, is_read,
                "{name} readOnlyHint disagrees with its name"
            );
            if name.starts_with("update_") || name.starts_with("delete_") {
                assert_eq!(destructive, Some(true), "{name} must be destructive");
            }
        }
    }

    /// Every tool but `list_projects` and `get_sql_schema` acts on a project, so each advertises
    /// `projectId`, and flattened inputs (signal / LLM profile bodies) land as top-level properties.
    #[test]
    fn project_scoped_tools_advertise_project_id() {
        for tool in LaminarMcpServer::all_tools().list_all() {
            let properties = tool
                .input_schema
                .get("properties")
                .and_then(Value::as_object)
                .cloned()
                .unwrap_or_default();
            assert!(
                tool.description.as_deref().is_some_and(|d| !d.is_empty()),
                "{} has no description",
                tool.name
            );
            if matches!(tool.name.as_ref(), "list_projects" | "get_sql_schema") {
                continue;
            }
            assert!(
                properties.contains_key("projectId"),
                "{} lacks projectId: {properties:?}",
                tool.name
            );
        }
        let create_signal = tool("create_signal");
        let properties = create_signal.input_schema.get("properties").unwrap();
        for field in [
            "name",
            "prompt",
            "structuredOutput",
            "trigger",
            "filters",
            "mode",
        ] {
            assert!(
                properties.get(field).is_some(),
                "create_signal lacks {field}"
            );
        }
    }

    /// Claude Code truncates each tool description and the server instructions past 2 KB.
    #[test]
    fn metadata_fits_claude_code_limit() {
        const LIMIT: usize = 2048;
        assert!(SERVER_INSTRUCTIONS.len() < LIMIT, "server instructions");
        for tool in LaminarMcpServer::all_tools().list_all() {
            let len = tool.description.as_deref().unwrap_or_default().len();
            assert!(len < LIMIT, "{} description is {len} bytes", tool.name);
        }
    }

    #[test]
    fn query_sql_tool_input_schema_has_params() {
        let schema = serde_json::to_string(&tool("query_laminar_sql").input_schema)
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

    /// Schema-driven clients send `null` for every optional field they leave unset; each one
    /// must read as absent instead of failing the call before the handler runs.
    #[test]
    fn null_optional_fields_read_as_absent() {
        let project = Uuid::new_v4();
        let update: signals::UpdateSignalParams = serde_json::from_value(serde_json::json!({
            "signalId": Uuid::new_v4(),
            "projectId": project,
            "clearSampleRate": null,
            "sampleRate": null,
            "prompt": null,
        }))
        .expect("update_signal accepts nulls");
        assert!(!update.clear_sample_rate);

        let create: llm_profiles::CreateLlmProfileParams =
            serde_json::from_value(serde_json::json!({
                "name": "p",
                "provider": "anthropic",
                "config": null,
                "secrets": null,
                "models": ["m"],
                "projectId": project,
            }))
            .expect("create_llm_profile accepts null config and secrets");
        assert!(create.profile.secrets.api_key.is_none());

        let nested: llm_profiles::CreateLlmProfileParams =
            serde_json::from_value(serde_json::json!({
                "name": "p",
                "provider": "anthropic",
                "config": { "auth": null, "headerNames": null, "region": null },
                "secrets": { "headers": null, "apiKey": null },
                "models": ["m"],
            }))
            .expect("nested profile fields accept nulls");
        assert!(nested.profile.config.header_names.is_empty());
        assert!(nested.profile.secrets.headers.is_empty());

        let update: llm_profiles::UpdateLlmProfileParams =
            serde_json::from_value(serde_json::json!({
                "profileId": Uuid::new_v4(),
                "name": null,
                "config": null,
                "secrets": null,
                "models": null,
            }))
            .expect("update_llm_profile accepts nulls");
        assert!(update.secrets.api_key.is_none());

        let query: QuerySqlParams = serde_json::from_value(serde_json::json!({
            "query": "SELECT 1",
            "parameters": null,
        }))
        .expect("query_laminar_sql accepts null parameters");
        assert!(query.parameters.is_empty());
    }

    /// `deserialize_with` must not change what the fields advertise.
    #[test]
    fn null_tolerant_fields_keep_their_schema() {
        let schema = tool("update_signal").input_schema;
        assert_eq!(
            schema["properties"]["clearSampleRate"]["type"],
            serde_json::json!("boolean")
        );
        let schema = tool("query_laminar_sql").input_schema;
        assert_eq!(
            schema["properties"]["parameters"]["type"],
            serde_json::json!("object")
        );
    }
}
