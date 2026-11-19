//! Our own `/v1/mcp` server traced with the MCP observability span contract that the Laminar SDK
//! MCP server wrappers emit (docs/internal/mcp-observability.md), built by hand: one root SERVER
//! span per `tools/call`, grouped into one trace per agent turn, sent to
//! `MCP_SERVER_INTERNAL_PROJECT_ID`. Unset or invalid disables it, and the `context` field is then
//! not advertised either.
//!
//! Differences from the SDK wrappers, because this server is stateless and multi-replica:
//! - No transport session. Turns are grouped per API key, with the turn state in Redis so every
//!   replica sees it. The Laminar session is the API key and UTC day.
//! - Arguments are recorded (redacted), results are not: they are the caller's own trace data.

use std::sync::Arc;

use chrono::Utc;
use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{
    cache::{
        Cache, CacheTrait, LockClaim,
        keys::{MCP_SERVER_CLIENT_CACHE_KEY, MCP_SERVER_TURN_CACHE_KEY},
    },
    db::{DB, project_api_keys::ProjectApiKey},
    env::connections::MCP_SERVER_INTERNAL_PROJECT_ID,
    mq::MessageQueue,
    opentelemetry_proto::{
        opentelemetry::proto::collector::trace::v1::ExportTraceServiceRequest,
        opentelemetry_proto_common_v1::{AnyValue, KeyValue, any_value::Value as ProtoValue},
        opentelemetry_proto_trace_v1::{
            ResourceSpans, ScopeSpans, Span as ProtoSpan,
            span::{Event, Link, SpanKind},
        },
    },
    traces::producer::push_spans_to_queue,
};

pub const CONTEXT_ARGUMENT: &str = "context";
const CONTEXT_DESCRIPTION: &str = "Optional. One sentence on what the user is trying to accomplish overall (their goal, not this call's arguments). Shared with this server's developer to improve the server; it does not change the result.";
const CONTEXT_MAX_CHARS: usize = 1000;
const AI_INVOCATION_META: &str = "io.modelcontextprotocol/aiInvocation";
const OPENAI_SESSION_META: &str = "openai/session";
/// rmcp answers arguments that don't deserialize with an `isError` result, not a JSON-RPC error.
const INVALID_ARGUMENTS_PREFIX: &str = "failed to deserialize parameters";
const INVALID_PARAMS: &str = "-32602";
/// Must stay under the Signals settle window (30s), or a Signal can analyse half a turn.
const TURN_GAP_SECS: u64 = 20;
const CLIENT_TTL_SECS: u64 = 7 * 24 * 3600;
const REDACTED: &str = "[REDACTED]";

/// The project our own MCP server's spans go to, or `None` when tracing it is off.
pub fn internal_project_id() -> Option<Uuid> {
    std::env::var(MCP_SERVER_INTERNAL_PROJECT_ID)
        .ok()
        .and_then(|id| Uuid::parse_str(id.trim()).ok())
}

/// Adds the optional `context` property to a tool's input schema, unless the tool has its own.
pub fn add_context_property(schema: &mut Map<String, Value>) {
    let properties = schema
        .entry("properties")
        .or_insert_with(|| Value::Object(Map::new()));
    if let Value::Object(properties) = properties {
        if !properties.contains_key(CONTEXT_ARGUMENT) {
            properties.insert(
                CONTEXT_ARGUMENT.to_string(),
                json!({ "type": "string", "description": CONTEXT_DESCRIPTION }),
            );
        }
    }
}

/// A `tools/call` as the client sent it, read before rmcp dispatches it.
pub struct ToolCall {
    tool: String,
    request_id: Option<String>,
    /// As sent, `context` included; redacted when recorded.
    arguments: Value,
    context: Option<String>,
    client_trace_parent: Option<TraceParent>,
    openai_session: Option<String>,
    trace_id: [u8; 16],
    /// Set when the trace id came from the caller's turn in Redis, to refresh it when the call ends.
    turn_key: Option<String>,
    started_at_nanos: u64,
}

struct TraceParent {
    trace_id: [u8; 16],
    span_id: [u8; 8],
}

#[derive(serde::Serialize, serde::Deserialize)]
struct ClientInfo {
    name: Option<String>,
    version: Option<String>,
}

/// Reads a JSON-RPC request before rmcp sees it. Strips `context` from a `tools/call`'s arguments
/// (our tools declare none of their own) and returns the call; remembers the client from an
/// `initialize`. Anything else is left alone and returns `None`.
pub async fn read_request(
    message: &mut Value,
    api_key: Option<&ProjectApiKey>,
    cache: &Cache,
) -> Option<ToolCall> {
    let method = message.get("method").and_then(Value::as_str)?.to_string();
    if method == "initialize" {
        if let Some(api_key) = api_key {
            remember_client(message, api_key, cache).await;
        }
        return None;
    }
    if method != "tools/call" {
        return None;
    }
    let request_id = message.get("id").and_then(request_id_string);
    let params = message.get_mut("params")?.as_object_mut()?;
    let tool = params.get("name").and_then(Value::as_str)?.to_string();
    let meta = params.get("_meta").cloned().unwrap_or(Value::Null);
    let arguments = params.get("arguments").cloned().unwrap_or(json!({}));
    let model_context = params
        .get_mut("arguments")
        .and_then(Value::as_object_mut)
        .and_then(|arguments| arguments.remove(CONTEXT_ARGUMENT));
    let ai_invocation = meta.get(AI_INVOCATION_META);
    let turn_id = ai_invocation
        .and_then(|invocation| invocation.get("turnId"))
        .and_then(Value::as_str);
    let client_trace_parent = meta
        .get("traceparent")
        .and_then(Value::as_str)
        .and_then(parse_trace_parent);
    let openai_session = meta
        .get(OPENAI_SESSION_META)
        .and_then(Value::as_str)
        .map(str::to_string);
    let turn = turn_trace_id(
        turn_id,
        openai_session.as_deref(),
        client_trace_parent.as_ref(),
        api_key.map(caller_key),
        cache,
    )
    .await;
    let context = model_context
        .as_ref()
        .and_then(Value::as_str)
        .or_else(|| ai_invocation?.get("userIntent")?.as_str())
        .map(str::trim)
        .filter(|context| !context.is_empty())
        .map(|context| context.chars().take(CONTEXT_MAX_CHARS).collect());
    Some(ToolCall {
        tool,
        request_id,
        arguments,
        context,
        client_trace_parent,
        openai_session,
        trace_id: turn.trace_id,
        turn_key: turn.key,
        started_at_nanos: now_nanos(),
    })
}

async fn remember_client(message: &Value, api_key: &ProjectApiKey, cache: &Cache) {
    let Some(client_info) = message.pointer("/params/clientInfo") else {
        return;
    };
    let info = ClientInfo {
        name: client_info
            .get("name")
            .and_then(Value::as_str)
            .map(str::to_string),
        version: client_info
            .get("version")
            .and_then(Value::as_str)
            .map(str::to_string),
    };
    let key = format!("{MCP_SERVER_CLIENT_CACHE_KEY}:{}", caller_key(api_key));
    if let Err(e) = cache.insert_with_ttl(&key, info, CLIENT_TTL_SECS).await {
        log::warn!("MCP server tracing: failed to cache client info: {e:?}");
    }
}

/// Everything needed to ingest one call's span after the response went out.
pub struct TraceSink {
    pub project_id: Uuid,
    pub db: Arc<DB>,
    pub cache: Arc<Cache>,
    pub queue: Arc<MessageQueue>,
}

/// Turns the JSON-RPC `response` to `call` into a span and ingests it.
pub async fn record(sink: TraceSink, call: ToolCall, api_key: ProjectApiKey, response: Value) {
    let ended_at_nanos = now_nanos();
    let caller = caller_key(&api_key);
    if let Some(key) = &call.turn_key {
        refresh_turn(key, call.trace_id, &sink.cache).await;
    }
    let client: Option<ClientInfo> = sink
        .cache
        .get(&format!("{MCP_SERVER_CLIENT_CACHE_KEY}:{caller}"))
        .await
        .ok()
        .flatten();

    let session_id = call
        .openai_session
        .clone()
        .unwrap_or_else(|| format!("{caller}:{}", Utc::now().format("%Y-%m-%d")));
    let mut redacted_arguments = call.arguments.clone();
    redact(&mut redacted_arguments);

    let mut attributes = vec![
        string_kv("mcp.method.name", "tools/call"),
        string_kv("gen_ai.operation.name", "execute_tool"),
        string_kv("gen_ai.tool.name", &call.tool),
        string_kv("network.transport", "tcp"),
        string_kv("network.protocol.name", "http"),
        string_kv("lmnr.span.type", "TOOL"),
        string_kv(
            "gen_ai.tool.call.arguments",
            &redacted_arguments.to_string(),
        ),
        string_kv("lmnr.association.properties.session_id", &session_id),
        string_kv(
            "lmnr.association.properties.user_id",
            &api_key.project_id.to_string(),
        ),
    ];
    if let Some(request_id) = &call.request_id {
        attributes.push(string_kv("jsonrpc.request.id", request_id));
    }
    if let Some(session) = &call.openai_session {
        attributes.push(string_kv("mcp.session.id", session));
    }
    if let Some(context) = &call.context {
        attributes.push(string_kv("lmnr.mcp.context", context));
    }
    if let Some(client) = &client {
        if let Some(name) = &client.name {
            attributes.push(string_kv("lmnr.mcp.client.name", name));
        }
        if let Some(version) = &client.version {
            attributes.push(string_kv("lmnr.mcp.client.version", version));
        }
    }

    let mut events = Vec::new();
    if let Some(failure) = failure(&response) {
        attributes.push(string_kv("error.type", &failure.error_type));
        if let Some(code) = &failure.status_code {
            attributes.push(string_kv("rpc.response.status_code", code));
        }
        events.push(Event {
            time_unix_nano: ended_at_nanos,
            name: "exception".to_string(),
            attributes: vec![
                string_kv("exception.type", &failure.error_type),
                string_kv("exception.message", &failure.message),
            ],
            dropped_attributes_count: 0,
        });
    }

    let links = call
        .client_trace_parent
        .as_ref()
        .map(|parent| Link {
            trace_id: parent.trace_id.to_vec(),
            span_id: parent.span_id.to_vec(),
            ..Default::default()
        })
        .into_iter()
        .collect();

    let span = ProtoSpan {
        trace_id: call.trace_id.to_vec(),
        span_id: Uuid::new_v4().as_bytes()[..8].to_vec(),
        name: format!("tools/call {}", call.tool),
        kind: SpanKind::Server as i32,
        start_time_unix_nano: call.started_at_nanos,
        end_time_unix_nano: ended_at_nanos,
        attributes,
        events,
        links,
        ..Default::default()
    };
    let request = ExportTraceServiceRequest {
        resource_spans: vec![ResourceSpans {
            scope_spans: vec![ScopeSpans {
                spans: vec![span],
                ..Default::default()
            }],
            ..Default::default()
        }],
    };
    if let Err(e) = push_spans_to_queue(
        request,
        sink.project_id,
        sink.queue,
        sink.db,
        sink.cache,
        None,
    )
    .await
    {
        log::warn!("MCP server tracing: failed to ingest span: {e:#}");
    }
}

struct Turn {
    trace_id: [u8; 16],
    key: Option<String>,
}

/// A turn id the client sent pins the trace for every replica. Otherwise the caller's calls that
/// start within `TURN_GAP_SECS` of another call's start or end share one, through Redis so every
/// replica agrees. The gap wins over a client `traceparent` (still linked): clients send a fresh
/// trace id per call, or one for a whole session, as often as one per turn.
async fn turn_trace_id(
    turn_id: Option<&str>,
    openai_session: Option<&str>,
    client_trace_parent: Option<&TraceParent>,
    caller: Option<String>,
    cache: &Cache,
) -> Turn {
    if let Some(turn_id) = turn_id {
        return Turn {
            trace_id: hashed_trace_id(openai_session.unwrap_or(""), turn_id),
            key: None,
        };
    }
    let Some(caller) = caller else {
        return Turn {
            trace_id: client_trace_parent
                .map(|parent| parent.trace_id)
                .unwrap_or(*Uuid::new_v4().as_bytes()),
            key: None,
        };
    };
    let key = format!("{MCP_SERVER_TURN_CACHE_KEY}:{caller}");
    let candidate = client_trace_parent
        .map(|parent| Uuid::from_bytes(parent.trace_id))
        .unwrap_or_else(Uuid::new_v4);
    // One atomic claim, not get-then-insert: parallel calls that open a turn would each miss and
    // mint their own trace. The losers read the winner's trace id from the claim.
    let trace_id = match cache
        .try_acquire_lock_with_owner(&key, &candidate.to_string(), TURN_GAP_SECS)
        .await
    {
        Ok(LockClaim::Acquired) => candidate,
        Ok(LockClaim::Held(held)) => {
            let current = held
                .and_then(|held| Uuid::parse_str(&held).ok())
                .unwrap_or(candidate);
            refresh_turn(&key, *current.as_bytes(), cache).await;
            current
        }
        Err(e) => {
            log::warn!("MCP server tracing: failed to claim turn: {e:?}");
            candidate
        }
    };
    Turn {
        trace_id: *trace_id.as_bytes(),
        key: Some(key),
    }
}

async fn refresh_turn(key: &str, trace_id: [u8; 16], cache: &Cache) {
    if let Err(e) = cache
        .insert_with_ttl(key, Uuid::from_bytes(trace_id), TURN_GAP_SECS)
        .await
    {
        log::warn!("MCP server tracing: failed to store turn: {e:?}");
    }
}

fn hashed_trace_id(session: &str, turn_id: &str) -> [u8; 16] {
    let digest = Sha256::digest(format!("{session}\n{turn_id}").as_bytes());
    let mut trace_id = [0u8; 16];
    trace_id.copy_from_slice(&digest[..16]);
    trace_id
}

/// The API key that made the call, which stands in for the session this stateless server lacks.
fn caller_key(api_key: &ProjectApiKey) -> String {
    if api_key.id.is_nil() {
        api_key.project_id.to_string()
    } else {
        api_key.id.to_string()
    }
}

struct Failure {
    error_type: String,
    status_code: Option<String>,
    message: String,
}

fn failure(response: &Value) -> Option<Failure> {
    if let Some(error) = response.get("error") {
        let code = error
            .get("code")
            .and_then(Value::as_i64)
            .map(|code| code.to_string())
            .unwrap_or_else(|| "_OTHER".to_string());
        return Some(Failure {
            error_type: code.clone(),
            status_code: Some(code),
            message: error
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
        });
    }
    let result = response.get("result")?;
    if result.get("isError").and_then(Value::as_bool) != Some(true) {
        return None;
    }
    let message = result
        .get("content")
        .and_then(Value::as_array)
        .and_then(|content| content.iter().find_map(|block| block.get("text")?.as_str()))
        .unwrap_or("Tool returned an error")
        .to_string();
    let error_type = if message.starts_with(INVALID_ARGUMENTS_PREFIX) {
        INVALID_PARAMS
    } else {
        "tool_error"
    };
    Some(Failure {
        error_type: error_type.to_string(),
        status_code: None,
        message,
    })
}

/// Secret-looking keys, as the SDK wrappers decide them: matched on the key lowercased with
/// every non-alphanumeric removed.
fn is_secret_key(key: &str) -> bool {
    const CONTAINS: &[&str] = &[
        "password",
        "passwd",
        "secret",
        "apikey",
        "privatekey",
        "accesskey",
        "authorization",
        "credential",
        "cookie",
        "signature",
    ];
    const EXACT: &[&str] = &["auth", "pwd", "otp", "bearer", "jwt"];
    let normalized: String = key
        .chars()
        .filter(char::is_ascii_alphanumeric)
        .map(|c| c.to_ascii_lowercase())
        .collect();
    CONTAINS.iter().any(|part| normalized.contains(part))
        || normalized.ends_with("token")
        || EXACT.contains(&normalized.as_str())
}

fn redact(value: &mut Value) {
    match value {
        Value::Object(map) => {
            for (key, value) in map.iter_mut() {
                if is_secret_key(key) {
                    *value = Value::String(REDACTED.to_string());
                } else {
                    redact(value);
                }
            }
        }
        Value::Array(items) => items.iter_mut().for_each(redact),
        _ => {}
    }
}

fn parse_trace_parent(header: &str) -> Option<TraceParent> {
    let mut parts = header.trim().split('-');
    let _version = parts.next()?;
    let trace_id: [u8; 16] = hex::decode(parts.next()?).ok()?.try_into().ok()?;
    let span_id: [u8; 8] = hex::decode(parts.next()?).ok()?.try_into().ok()?;
    (trace_id != [0; 16] && span_id != [0; 8]).then_some(TraceParent { trace_id, span_id })
}

fn request_id_string(id: &Value) -> Option<String> {
    match id {
        Value::String(id) => Some(id.clone()),
        Value::Number(id) => Some(id.to_string()),
        _ => None,
    }
}

fn string_kv(key: &str, value: &str) -> KeyValue {
    KeyValue {
        key: key.to_string(),
        value: Some(AnyValue {
            value: Some(ProtoValue::StringValue(value.to_string())),
        }),
    }
}

fn now_nanos() -> u64 {
    Utc::now().timestamp_nanos_opt().unwrap_or_default() as u64
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;
    use crate::cache::in_memory::InMemoryCache;

    #[test]
    fn secret_keys_match_the_sdk_contract() {
        for key in [
            "password",
            "user_password",
            "apiKey",
            "api_key",
            "X-API-Key",
            "client_secret",
            "access_token",
            "refreshToken",
            "githubToken",
            "Authorization",
            "auth",
            "session_cookie",
            "private_key",
            "aws_access_key_id",
            "credentials",
            "jwt",
        ] {
            assert!(is_secret_key(key), "{key} should be secret");
        }
        for key in [
            "max_tokens",
            "tokens",
            "author",
            "query",
            "session_id",
            "token_count",
            "path",
            "keyword",
        ] {
            assert!(!is_secret_key(key), "{key} should not be secret");
        }
    }

    #[test]
    fn redacts_nested_secrets() {
        let mut value = json!({
            "query": "SELECT 1",
            "headers": [{ "Authorization": "Bearer x", "accept": "json" }],
            "api_key": { "nested": "x" },
        });
        redact(&mut value);
        assert_eq!(
            value,
            json!({
                "query": "SELECT 1",
                "headers": [{ "Authorization": REDACTED, "accept": "json" }],
                "api_key": REDACTED,
            })
        );
    }

    #[test]
    fn context_property_is_optional_and_never_replaces_the_tools_own() {
        let mut schema = json!({ "type": "object", "properties": { "query": { "type": "string" } }, "required": ["query"] });
        add_context_property(schema.as_object_mut().unwrap());
        assert_eq!(schema["properties"][CONTEXT_ARGUMENT]["type"], "string");
        assert_eq!(schema["required"], json!(["query"]));

        let own = json!({ "type": "integer" });
        let mut schema = json!({ "properties": { "context": own } });
        add_context_property(schema.as_object_mut().unwrap());
        assert_eq!(schema["properties"][CONTEXT_ARGUMENT], own);
    }

    #[tokio::test]
    async fn parallel_calls_opening_a_turn_share_its_trace() {
        let cache = Arc::new(Cache::InMemory(InMemoryCache::new(None)));
        let calls = (0..8).map(|_| {
            let cache = cache.clone();
            tokio::spawn(async move {
                turn_trace_id(None, None, None, Some("key".to_string()), &cache)
                    .await
                    .trace_id
            })
        });
        let trace_ids: HashSet<[u8; 16]> = futures_util::future::join_all(calls)
            .await
            .into_iter()
            .map(Result::unwrap)
            .collect();
        assert_eq!(trace_ids.len(), 1);

        let next = turn_trace_id(None, None, None, Some("key".to_string()), &cache).await;
        assert!(trace_ids.contains(&next.trace_id));
        let other_caller = turn_trace_id(None, None, None, Some("other".to_string()), &cache).await;
        assert!(!trace_ids.contains(&other_caller.trace_id));
    }

    #[tokio::test]
    async fn a_new_turn_starts_with_the_client_trace_id() {
        let cache = Cache::InMemory(InMemoryCache::new(None));
        let parent =
            parse_trace_parent("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01").unwrap();
        let first = turn_trace_id(None, None, Some(&parent), Some("key".to_string()), &cache).await;
        assert_eq!(first.trace_id, parent.trace_id);

        let other =
            parse_trace_parent("00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01").unwrap();
        let second = turn_trace_id(None, None, Some(&other), Some("key".to_string()), &cache).await;
        assert_eq!(second.trace_id, parent.trace_id);
    }

    #[test]
    fn turn_id_hash_is_deterministic_and_session_scoped() {
        assert_eq!(hashed_trace_id("s", "t"), hashed_trace_id("s", "t"));
        assert_ne!(hashed_trace_id("s", "t"), hashed_trace_id("other", "t"));
    }

    #[test]
    fn classifies_failures() {
        let invalid =
            json!({ "jsonrpc": "2.0", "id": 1, "error": { "code": -32602, "message": "bad" } });
        let failure = failure(&invalid).unwrap();
        assert_eq!(failure.error_type, "-32602");
        assert_eq!(failure.status_code.as_deref(), Some("-32602"));

        let tool_error = json!({ "result": { "isError": true, "content": [{ "type": "text", "text": "boom" }] } });
        let failure = super::failure(&tool_error).unwrap();
        assert_eq!(failure.error_type, "tool_error");
        assert_eq!(failure.message, "boom");
        assert!(failure.status_code.is_none());

        let invalid_arguments = json!({ "result": { "isError": true, "content": [{ "type": "text", "text": "failed to deserialize parameters: missing field `query`" }] } });
        let failure = super::failure(&invalid_arguments).unwrap();
        assert_eq!(failure.error_type, "-32602");
        assert!(failure.status_code.is_none());

        assert!(super::failure(&json!({ "result": { "content": [] } })).is_none());
    }

    #[test]
    fn parses_trace_parent() {
        let parent =
            parse_trace_parent("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01").unwrap();
        assert_eq!(
            hex::encode(parent.trace_id),
            "4bf92f3577b34da6a3ce929d0e0e4736"
        );
        assert_eq!(hex::encode(parent.span_id), "00f067aa0ba902b7");
        assert!(
            parse_trace_parent("00-00000000000000000000000000000000-00f067aa0ba902b7-01").is_none()
        );
        assert!(parse_trace_parent("garbage").is_none());
    }
}
