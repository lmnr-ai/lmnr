use std::{borrow::Cow, collections::HashMap, future::Future, sync::Arc};

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
        mcp_oauth::{McpCaller, McpUser},
    },
    cache::Cache,
    db::{self, DB},
    mq::MessageQueue,
    query_engine::QueryEngine,
    sql::{self, ClickhouseReadonlyClient, SqlQuerySource},
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

/// A trace id as a hyphenated GUID or the 32 hex digits OpenTelemetry emits; `Uuid` parses both.
const TRACE_ID_PATTERN: &str = r"^(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[0-9a-fA-F]{32})$";

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
        let mut router = Self::tool_router()
            + Self::signal_tools()
            + Self::llm_profile_tools()
            + Self::trace_tools();
        #[cfg(feature = "signals")]
        {
            router = router + Self::enterprise_tools();
        }
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
                .map_err(|e| ToolError::message(e.to_string()))?;
                Ok(ToolOutput::json(&output.rows)
                    .metadata(json!({ "query": query, "tables": output.tables })))
            },
        )
        .await
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
                tool_error("Internal server error")
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

    /// Exactly the expected tools are exposed, with the right names: nothing dropped or added by
    /// merging the per-area routers.
    #[test]
    fn router_exposes_expected_tools() {
        let names: Vec<String> = LaminarMcpServer::tool_router_with_descriptions()
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

    /// Every tool but `list_projects` acts on a project, so each advertises `projectId`, and
    /// flattened inputs (signal / LLM profile bodies) land as top-level properties.
    #[test]
    fn project_scoped_tools_advertise_project_id() {
        for tool in LaminarMcpServer::tool_router_with_descriptions().list_all() {
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
            if tool.name == "list_projects" {
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
        let signals = tool("list_signals")
            .description
            .expect("list_signals keeps its doc-comment description")
            .to_string();
        assert!(
            signals.contains("List the project's signals"),
            "list_signals description changed unexpectedly: {signals}"
        );
    }
}
