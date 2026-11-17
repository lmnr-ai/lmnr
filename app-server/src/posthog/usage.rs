//! Usage events: `api:request` / `cli:request` per `/v1` call, and
//! `mcp:initialized` / `mcp:tool_called` from the MCP handler. Ingestion and
//! per-item traffic are left out (`audit::middleware::is_per_item_traffic`),
//! as are requests that never authenticated.

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
    audit::{
        AuditSource,
        middleware::{is_per_item_traffic, route},
    },
    auth::cli_user::{CliProjectAuth, CliUserAuth},
    db::project_api_keys::ProjectApiKey,
};

pub async fn usage_v1(
    req: ServiceRequest,
    next: Next<impl MessageBody>,
) -> Result<ServiceResponse<impl MessageBody>, Error> {
    let res = next.call(req).await?;

    let request = res.request();
    let Some(posthog) = request.app_data::<web::Data<PostHog>>() else {
        return Ok(res);
    };
    if !posthog.is_enabled() {
        return Ok(res);
    }
    let Some((path, source)) = route(request) else {
        return Ok(res);
    };
    // MCP is counted per tool call, in its handler.
    if path == "/mcp" || is_per_item_traffic(request.method(), &path) {
        return Ok(res);
    }
    let Some((actor, project_id)) = actor(request) else {
        return Ok(res);
    };
    let (name, source) = match source {
        AuditSource::Cli => ("cli:request", "cli"),
        _ => ("api:request", "api"),
    };
    let status = res.status();
    let mut properties = Map::new();
    properties.insert("source".to_string(), json!(source));
    properties.insert("method".to_string(), json!(request.method().as_str()));
    properties.insert("route".to_string(), json!(path));
    properties.insert("status".to_string(), json!(status.as_u16()));
    properties.insert("success".to_string(), json!(status.is_success()));
    insert_user_agent(&mut properties, request);

    posthog.capture(UsageEvent {
        name,
        actor,
        project_id,
        properties,
    });
    Ok(res)
}

/// CLI discovery routes (`/projects`) carry the user but no project.
fn actor(req: &HttpRequest) -> Option<(UsageActor, Option<Uuid>)> {
    let extensions = req.extensions();
    if let Some(key) = extensions.get::<ProjectApiKey>() {
        return Some((UsageActor::api_key(key), Some(key.project_id)));
    }
    if let Some(auth) = extensions.get::<CliProjectAuth>() {
        return Some((UsageActor::User(auth.user_id), Some(auth.project_id)));
    }
    extensions
        .get::<CliUserAuth>()
        .map(|auth| (UsageActor::User(auth.user_id), None))
}

fn insert_user_agent(properties: &mut Map<String, Value>, req: &HttpRequest) {
    if let Some(user_agent) = req.headers().get(USER_AGENT).and_then(|v| v.to_str().ok()) {
        properties.insert("user_agent".to_string(), json!(user_agent));
    }
}

/// An MCP request worth counting, read before the request is handed to rmcp.
pub struct McpCall {
    name: &'static str,
    properties: Map<String, Value>,
}

impl McpCall {
    pub fn from_request(request: &ClientRequest) -> Option<Self> {
        let mut properties = Map::new();
        let name = match request {
            ClientRequest::InitializeRequest(r) => {
                let client = &r.params.client_info;
                properties.insert("client_name".to_string(), json!(client.name));
                properties.insert("client_version".to_string(), json!(client.version));
                "mcp:initialized"
            }
            ClientRequest::CallToolRequest(r) => {
                properties.insert("tool".to_string(), json!(r.params.name));
                "mcp:tool_called"
            }
            _ => return None,
        };
        properties.insert("source".to_string(), json!("mcp"));
        Some(Self { name, properties })
    }

    /// `response` is the serialized JSON-RPC response.
    pub fn capture(self, req: &HttpRequest, response: &Value) {
        let Some(posthog) = req.app_data::<web::Data<PostHog>>() else {
            return;
        };
        let Some(key) = req.extensions().get::<ProjectApiKey>().cloned() else {
            return;
        };
        let Self {
            name,
            mut properties,
        } = self;
        properties.insert("success".to_string(), json!(succeeded(response)));
        insert_user_agent(&mut properties, req);
        posthog.capture(UsageEvent {
            name,
            actor: UsageActor::api_key(&key),
            project_id: Some(key.project_id),
            properties,
        });
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
