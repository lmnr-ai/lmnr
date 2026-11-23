//! Usage events: `sql:query` per `/v1/sql/query` or `/v1/cli/sql/query` call,
//! and `mcp:initialized` / `mcp:tool_called` from the MCP handler. Requests
//! that never authenticated are not counted.

use actix_web::{
    Error, HttpMessage, HttpRequest,
    body::MessageBody,
    dev::{ServiceRequest, ServiceResponse},
    http::header::USER_AGENT,
    middleware::Next,
    web,
};
use rmcp::model::ClientRequest;
use serde_json::{Map, Value, json};
use uuid::Uuid;

use super::{PostHog, UsageActor, UsageEvent};
use crate::{
    auth::{cli_user::CliProjectAuth, mcp_oauth::McpCaller},
    db::project_api_keys::ProjectApiKey,
};

/// Wraps the `/v1/sql` and `/v1/cli/sql` scopes. Only `query` is counted; the
/// CLI scope also serves the static schema.
pub async fn sql_query_usage(
    req: ServiceRequest,
    next: Next<impl MessageBody>,
) -> Result<ServiceResponse<impl MessageBody>, Error> {
    let res = next.call(req).await?;

    let request = res.request();
    if !request
        .match_pattern()
        .is_some_and(|pattern| pattern.ends_with("/sql/query"))
    {
        return Ok(res);
    }
    let Some(posthog) = request.app_data::<web::Data<PostHog>>() else {
        return Ok(res);
    };
    let Some((actor, project_id, source)) = sql_caller(request) else {
        return Ok(res);
    };
    let status = res.status();
    let mut properties = Map::new();
    properties.insert("source".to_string(), json!(source));
    properties.insert("status".to_string(), json!(status.as_u16()));
    properties.insert("success".to_string(), json!(status.is_success()));
    insert_user_agent(&mut properties, request);

    posthog.capture(UsageEvent {
        name: "sql:query",
        actor,
        project_id: Some(project_id),
        properties,
    });
    Ok(res)
}

fn sql_caller(req: &HttpRequest) -> Option<(UsageActor, Uuid, &'static str)> {
    let extensions = req.extensions();
    if let Some(key) = extensions.get::<ProjectApiKey>() {
        return Some((UsageActor::api_key(key), key.project_id, "api"));
    }
    extensions
        .get::<CliProjectAuth>()
        .map(|auth| (UsageActor::User(auth.user_id), auth.project_id, "cli"))
}

fn insert_user_agent(properties: &mut Map<String, Value>, req: &HttpRequest) {
    if let Some(user_agent) = req.headers().get(USER_AGENT).and_then(|v| v.to_str().ok()) {
        properties.insert("user_agent".to_string(), json!(user_agent));
    }
}

/// An MCP request worth counting, read before the request is handed to rmcp.
pub struct McpCall {
    name: &'static str,
    /// The `projectId` a tool call names; OAuth callers pick their project per call.
    requested_project: Option<Uuid>,
    properties: Map<String, Value>,
}

impl McpCall {
    pub fn from_request(request: &ClientRequest) -> Option<Self> {
        let mut properties = Map::new();
        let mut requested_project = None;
        let name = match request {
            ClientRequest::InitializeRequest(r) => {
                let client = &r.params.client_info;
                properties.insert("client_name".to_string(), json!(client.name));
                properties.insert("client_version".to_string(), json!(client.version));
                "mcp:initialized"
            }
            ClientRequest::CallToolRequest(r) => {
                properties.insert("tool".to_string(), json!(r.params.name));
                // Only the project is read; other arguments (SQL, prompts) never leave the server.
                requested_project = r
                    .params
                    .arguments
                    .as_ref()
                    .and_then(|args| args.get("projectId"))
                    .and_then(Value::as_str)
                    .and_then(|id| Uuid::parse_str(id).ok());
                "mcp:tool_called"
            }
            _ => return None,
        };
        properties.insert("source".to_string(), json!("mcp"));
        Some(Self {
            name,
            requested_project,
            properties,
        })
    }

    /// `response` is the serialized JSON-RPC response.
    pub fn capture(self, req: &HttpRequest, response: &Value) {
        let Some(posthog) = req.app_data::<web::Data<PostHog>>() else {
            return;
        };
        let Some(caller) = req.extensions().get::<McpCaller>().cloned() else {
            return;
        };
        let Self {
            name,
            requested_project,
            mut properties,
        } = self;
        let success = succeeded(response);
        let (actor, project_id, auth) = mcp_scope(&caller, requested_project, success);
        properties.insert("success".to_string(), json!(success));
        properties.insert("auth".to_string(), json!(auth));
        insert_user_agent(&mut properties, req);
        posthog.capture(UsageEvent {
            name,
            actor,
            project_id,
            properties,
        });
    }
}

/// An API key is bound to its project. An OAuth user's `projectId` counts only
/// once the tool accepted it: a rejected id may be another workspace's project.
fn mcp_scope(
    caller: &McpCaller,
    requested_project: Option<Uuid>,
    success: bool,
) -> (UsageActor, Option<Uuid>, &'static str) {
    match caller {
        McpCaller::ApiKey(key) => (UsageActor::api_key(key), Some(key.project_id), "api_key"),
        McpCaller::User(user) => (
            UsageActor::User(user.user_id),
            requested_project.filter(|_| success),
            "oauth",
        ),
    }
}

/// A tool can fail with a JSON-RPC error or with a result flagged `isError`.
fn succeeded(response: &Value) -> bool {
    response.get("error").is_none()
        && response.pointer("/result/isError").and_then(Value::as_bool) != Some(true)
}

#[cfg(test)]
mod tests {
    use rmcp::model::ClientJsonRpcMessage;

    use super::*;
    use crate::auth::mcp_oauth::McpUser;

    fn call(message: Value) -> Option<McpCall> {
        match serde_json::from_value::<ClientJsonRpcMessage>(message).unwrap() {
            ClientJsonRpcMessage::Request(request) => McpCall::from_request(&request.request),
            _ => panic!("not a request"),
        }
    }

    #[test]
    fn tool_calls_name_the_tool() {
        let call = call(json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": { "name": "query_laminar_sql", "arguments": { "query": "SELECT 1" } },
        }))
        .unwrap();
        assert_eq!(call.name, "mcp:tool_called");
        assert_eq!(call.properties["tool"], json!("query_laminar_sql"));
        assert_eq!(call.properties["source"], json!("mcp"));
        // Arguments can hold queries and prompts; they never leave the server.
        assert!(!call.properties.contains_key("arguments"));
    }

    #[test]
    fn tool_calls_read_only_the_project_argument() {
        let project_id = Uuid::new_v4();
        let call = call(json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": "query_laminar_sql",
                "arguments": { "projectId": project_id, "query": "SELECT 1" },
            },
        }))
        .unwrap();
        assert_eq!(call.requested_project, Some(project_id));
        assert!(!call.properties.contains_key("projectId"));
    }

    #[test]
    fn oauth_project_counts_only_when_the_tool_accepted_it() {
        let user_id = Uuid::new_v4();
        let project_id = Uuid::new_v4();
        let caller = McpCaller::User(McpUser { user_id });

        let (actor, project, auth) = mcp_scope(&caller, Some(project_id), true);
        assert!(matches!(actor, UsageActor::User(id) if id == user_id));
        assert_eq!(project, Some(project_id));
        assert_eq!(auth, "oauth");

        let (_, project, _) = mcp_scope(&caller, Some(project_id), false);
        assert_eq!(project, None);
    }

    #[test]
    fn initialize_names_the_client() {
        let call = call(json!({
            "jsonrpc": "2.0",
            "id": 0,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": { "name": "claude-code", "version": "2.1.0" },
            },
        }))
        .unwrap();
        assert_eq!(call.name, "mcp:initialized");
        assert_eq!(call.properties["client_name"], json!("claude-code"));
        assert_eq!(call.properties["client_version"], json!("2.1.0"));
    }

    #[test]
    fn other_requests_are_not_counted() {
        assert!(
            call(json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {} }))
                .is_none()
        );
    }

    #[test]
    fn tool_errors_are_failures() {
        assert!(succeeded(
            &json!({ "jsonrpc": "2.0", "id": 1, "result": { "content": [], "isError": false } })
        ));
        assert!(!succeeded(
            &json!({ "jsonrpc": "2.0", "id": 1, "result": { "content": [], "isError": true } })
        ));
        assert!(!succeeded(
            &json!({ "jsonrpc": "2.0", "id": 1, "error": { "code": -32602, "message": "bad" } })
        ));
    }
}
