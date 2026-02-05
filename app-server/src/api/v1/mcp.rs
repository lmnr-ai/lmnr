use std::{collections::HashMap, sync::Arc};

use actix_web::{post, web, HttpResponse};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{
    db::project_api_keys::ProjectApiKey,
    query_engine::QueryEngine,
    signals::spans::get_trace_structure_as_string,
    sql::{self, ClickhouseReadonlyClient},
};

// ============ JSON-RPC Types ============

#[derive(Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub method: String,
    #[serde(default)]
    pub params: Option<Value>,
    pub id: Option<Value>,
}

#[derive(Serialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
    pub id: Option<Value>,
}

#[derive(Serialize)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

// ============ MCP Types ============

#[derive(Serialize)]
pub struct Tool {
    pub name: String,
    pub description: String,
    #[serde(rename = "inputSchema")]
    pub input_schema: Value,
}

#[derive(Serialize)]
pub struct ToolResult {
    pub content: Vec<ContentItem>,
    #[serde(rename = "isError", skip_serializing_if = "Option::is_none")]
    pub is_error: Option<bool>,
}

#[derive(Serialize)]
pub struct ContentItem {
    #[serde(rename = "type")]
    pub content_type: String,
    pub text: String,
}

// ============ Tool Arguments ============

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuerySqlArgs {
    pub query: String,
    #[serde(default)]
    pub parameters: HashMap<String, Value>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetTraceContextArgs {
    pub trace_id: Uuid,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallParams {
    pub name: String,
    #[serde(default)]
    pub arguments: Value,
}

// ============ Handler ============

#[post("mcp")]
pub async fn handle_mcp(
    req: web::Json<JsonRpcRequest>,
    project_api_key: ProjectApiKey,
    clickhouse: web::Data<clickhouse::Client>,
    clickhouse_ro: web::Data<Option<Arc<ClickhouseReadonlyClient>>>,
    query_engine: web::Data<Arc<QueryEngine>>,
) -> HttpResponse {
    // Notifications (no id) get 202 Accepted with no body per MCP HTTP spec
    if req.id.is_none() {
        return HttpResponse::Accepted().finish();
    }

    let response = match req.method.as_str() {
        "initialize" => handle_initialize(&req),
        "ping" => handle_ping(&req),
        "tools/list" => handle_tools_list(&req),
        "tools/call" => {
            handle_tools_call(
                &req,
                project_api_key.project_id,
                clickhouse.get_ref().clone(),
                clickhouse_ro.get_ref().clone(),
                query_engine.into_inner().as_ref().clone(),
            )
            .await
        }
        _ => method_not_found(&req),
    };

    HttpResponse::Ok()
        .content_type("application/json")
        .json(response)
}

// ============ Method Handlers ============

fn handle_initialize(req: &JsonRpcRequest) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0".to_string(),
        result: Some(json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {
                "tools": { "listChanged": false }
            },
            "serverInfo": {
                "name": "laminar",
                "version": env!("CARGO_PKG_VERSION")
            }
        })),
        error: None,
        id: req.id.clone(),
    }
}

fn handle_ping(req: &JsonRpcRequest) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0".to_string(),
        result: Some(json!({})),
        error: None,
        id: req.id.clone(),
    }
}

fn handle_tools_list(req: &JsonRpcRequest) -> JsonRpcResponse {
    let tools = vec![
        Tool {
            name: "query_laminar_sql".to_string(),
            description: concat!(
                "Execute a SQL query against Laminar trace data. Returns results as JSON array. ",
                "Queries are automatically scoped to your project. Only SELECT queries allowed.\n\n",
                "Available tables and key columns:\n",
                "- spans: span_id, trace_id, name, span_type (0=DEFAULT, 1=LLM, 6=TOOL), ",
                "start_time, end_time, input, output, status, parent_span_id, ",
                "model, provider, input_tokens, output_tokens, total_tokens, total_cost, path\n",
                "- traces: id, start_time, end_time, duration, total_tokens, total_cost, ",
                "session_id, user_id, status, tags, top_span_name, num_spans, span_names\n\n",
                "Join: spans.trace_id = traces.id\n\n",
                "Example queries:\n",
                "- Recent traces: SELECT id, start_time, total_cost FROM traces ORDER BY start_time DESC LIMIT 10\n",
                "- LLM spans: SELECT name, model, input, output FROM spans WHERE span_type = 1\n",
                "- Errors: SELECT trace_id, name, status FROM spans WHERE status != 'success'"
            )
            .to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "ClickHouse SQL query. Must be SELECT only. Tables: spans, traces. Join: spans.trace_id = traces.id"
                    },
                    "parameters": {
                        "type": "object",
                        "description": "Query parameters for {name:Type} placeholders, e.g., {trace_id:UUID}",
                        "additionalProperties": true
                    }
                },
                "required": ["query"]
            }),
        },
        Tool {
            name: "get_trace_context".to_string(),
            description: concat!(
                "Get an LLM-optimized summary of a trace. Returns span hierarchy with timing, ",
                "inputs/outputs for LLM spans, and any errors.\n\n",
                "Use this when you have a specific trace_id and want to understand what happened. ",
                "Use query_laminar_sql first to find trace IDs, then this tool to drill down.\n\n",
                "Output includes:\n",
                "- Span tree with parent-child relationships\n",
                "- Duration and timing for each span\n",
                "- Full input/output for LLM spans (truncated for others)\n",
                "- Exception details if any spans failed"
            )
            .to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "traceId": {
                        "type": "string",
                        "format": "uuid",
                        "description": "The trace ID to retrieve (UUID format, e.g., '123e4567-e89b-12d3-a456-426614174000')"
                    }
                },
                "required": ["traceId"]
            }),
        },
    ];

    JsonRpcResponse {
        jsonrpc: "2.0".to_string(),
        result: Some(json!({ "tools": tools })),
        error: None,
        id: req.id.clone(),
    }
}

async fn handle_tools_call(
    req: &JsonRpcRequest,
    project_id: Uuid,
    clickhouse: clickhouse::Client,
    clickhouse_ro: Option<Arc<ClickhouseReadonlyClient>>,
    query_engine: Arc<QueryEngine>,
) -> JsonRpcResponse {
    // Parse tool call params
    let params: ToolCallParams = match &req.params {
        Some(p) => match serde_json::from_value(p.clone()) {
            Ok(p) => p,
            Err(e) => return invalid_params(req, &format!("Invalid params: {}", e)),
        },
        None => return invalid_params(req, "Missing params"),
    };

    let result = match params.name.as_str() {
        "query_laminar_sql" => {
            execute_query_sql(params.arguments, project_id, clickhouse_ro, query_engine).await
        }
        "get_trace_context" => {
            execute_get_trace_context(params.arguments, project_id, clickhouse).await
        }
        _ => Err(format!("Unknown tool: {}", params.name)),
    };

    match result {
        Ok(tool_result) => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            result: Some(serde_json::to_value(tool_result).unwrap()),
            error: None,
            id: req.id.clone(),
        },
        Err(e) => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            result: Some(json!({
                "content": [{"type": "text", "text": e}],
                "isError": true
            })),
            error: None,
            id: req.id.clone(),
        },
    }
}

// ============ Tool Implementations ============

async fn execute_query_sql(
    args: Value,
    project_id: Uuid,
    clickhouse_ro: Option<Arc<ClickhouseReadonlyClient>>,
    query_engine: Arc<QueryEngine>,
) -> Result<ToolResult, String> {
    let args: QuerySqlArgs =
        serde_json::from_value(args).map_err(|e| format!("Invalid arguments: {}", e))?;

    let ro_client = clickhouse_ro.ok_or("ClickHouse read-only client not configured")?;

    match sql::execute_sql_query(
        args.query,
        project_id,
        args.parameters,
        ro_client,
        query_engine,
    )
    .await
    {
        Ok(result) => Ok(ToolResult {
            content: vec![ContentItem {
                content_type: "text".to_string(),
                text: serde_json::to_string_pretty(&result).unwrap_or_default(),
            }],
            is_error: None,
        }),
        Err(e) => Ok(ToolResult {
            content: vec![ContentItem {
                content_type: "text".to_string(),
                text: e.to_string(),
            }],
            is_error: Some(true),
        }),
    }
}

async fn execute_get_trace_context(
    args: Value,
    project_id: Uuid,
    clickhouse: clickhouse::Client,
) -> Result<ToolResult, String> {
    let args: GetTraceContextArgs =
        serde_json::from_value(args).map_err(|e| format!("Invalid arguments: {}", e))?;

    match get_trace_structure_as_string(clickhouse, project_id, args.trace_id).await {
        Ok(trace_str) => Ok(ToolResult {
            content: vec![ContentItem {
                content_type: "text".to_string(),
                text: trace_str,
            }],
            is_error: None,
        }),
        Err(e) => Ok(ToolResult {
            content: vec![ContentItem {
                content_type: "text".to_string(),
                text: format!("Failed to retrieve trace: {}", e),
            }],
            is_error: Some(true),
        }),
    }
}

// ============ Error Helpers ============

fn method_not_found(req: &JsonRpcRequest) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0".to_string(),
        result: None,
        error: Some(JsonRpcError {
            code: -32601,
            message: format!("Method not found: {}", req.method),
            data: None,
        }),
        id: req.id.clone(),
    }
}

fn invalid_params(req: &JsonRpcRequest, message: &str) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0".to_string(),
        result: None,
        error: Some(JsonRpcError {
            code: -32602,
            message: message.to_string(),
            data: None,
        }),
        id: req.id.clone(),
    }
}
