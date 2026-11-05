pub mod ch;
pub mod data_plane;
pub mod queries;

use bytes::Bytes;
use opentelemetry::{
    KeyValue, global,
    trace::{Span, Tracer},
};
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::PgPool;
use std::{
    collections::HashMap,
    sync::{Arc, LazyLock},
};
use uuid::Uuid;

use crate::{
    access_policy::AccessPolicy,
    audit::{
        self, AuditAction, AuditActor, AuditEventInput, AuditOutcome, AuditResource, AuditSource,
    },
    cache::Cache,
    data_plane::get_workspace_deployment,
    db::{DB, workspaces::DeploymentMode},
    mq::MessageQueue,
    query_engine::{QueryEngine, QueryEngineValidationResult, validator::strip_literals},
};

pub struct ClickhouseReadonlyClient(clickhouse::Client);

/// Where an ad-hoc SQL query originated. Decides whether the per-query
/// `max_memory_usage` ceiling applies (the trusted frontend runs uncapped) and
/// how the query is audited: every source but `Internal` is a person or key
/// running SQL of their choosing and is logged as `sql.query`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SqlQuerySource {
    /// SQL the platform builds itself (tables, charts, dashboards). Not audited.
    Internal,
    /// The SQL editor (`/api/v1/projects/{id}/sql/query`).
    Editor,
    /// SQL export jobs, audited when the query is validated.
    Export,
    /// Public `/v1/sql/query`.
    Api,
    /// `/v1/cli/sql/query`.
    Cli,
    /// MCP `query_laminar_sql`.
    Mcp,
    /// The Laminar agent's SQL tool.
    #[cfg_attr(not(feature = "signals"), allow(dead_code))]
    Agent,
}

impl SqlQuerySource {
    /// Internet-facing traffic, capped to protect ClickHouse from OOM-inducing scans.
    pub fn is_memory_capped(self) -> bool {
        matches!(self, Self::Api | Self::Cli | Self::Mcp)
    }

    fn audit_source(self) -> Option<AuditSource> {
        match self {
            Self::Internal => None,
            Self::Editor | Self::Export => Some(AuditSource::Ui),
            Self::Api => Some(AuditSource::Api),
            Self::Cli => Some(AuditSource::Cli),
            Self::Mcp => Some(AuditSource::Mcp),
            Self::Agent => Some(AuditSource::Agent),
        }
    }
}

/// Who ran an audited query, and where to publish the event.
pub struct SqlAudit {
    pub actor: AuditActor,
    pub queue: Arc<MessageQueue>,
}

/// Longest query text stored on a `sql.query` event.
const AUDIT_MAX_QUERY_BYTES: usize = 16 * 1024;

#[derive(Debug, thiserror::Error, Deserialize)]
pub enum SqlQueryError {
    ValidationError(String),
    BadResponseError(String),
    InternalError(String),
    /// The deployment cannot serve this query (e.g. Postgres-backed tables not
    /// configured). Our own message, shown verbatim.
    Unavailable(String),
}

const VERSION_REGEX_RAW: &str = r"\s*\(version\s+\d+(?:\.\d+){0,3}(?:\s+\([^)]*\))?\)$";

// Removes any settings explicitly set in the query.
const SETTING_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\s*SETTINGS\s+[A-Za-z_]*\s*=\s*'(?:[^'\\]|\\.)*'(?:\s*,\s*[A-Za-z_]*\s*=\s*'(?:[^'\\]|\\.)*')*\s*").unwrap()
});
// Removes clickhouse version info from the end of the error message.
const VERSION_REGEX: LazyLock<Regex> = LazyLock::new(|| Regex::new(VERSION_REGEX_RAW).unwrap());

const ERROR_END_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(format!(r"\. \([A-Z_]+\)*{VERSION_REGEX_RAW}").as_str()).unwrap());

impl SqlQueryError {
    fn sanitize_error(&self) -> String {
        match self {
            Self::ValidationError(e) | Self::Unavailable(e) => e.to_string(),
            Self::InternalError(e) => remove_query_from_error_message(e),
            Self::BadResponseError(e) => remove_query_from_error_message(e),
        }
    }
}

impl std::fmt::Display for SqlQueryError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let prefix = match self {
            Self::ValidationError(_) => "Query validation failed",
            Self::InternalError(_) => "Error executing query",
            Self::BadResponseError(_) | Self::Unavailable(_) => "Error executing query",
        };
        let error_message = format!("{prefix}: {}", self.sanitize_error());
        write!(f, "{}", json!({"error": error_message}))
    }
}

impl ClickhouseReadonlyClient {
    pub fn new(url: String, user: String, password: String) -> Self {
        let client = clickhouse::Client::default()
            .with_url(url)
            .with_user(user)
            .with_database("default")
            .with_password(password);

        Self(client)
    }

    pub fn query(&self, sql: &str) -> clickhouse::query::Query {
        self.0.query(sql)
    }
}

/// `policy` is the caller's read restrictions; it is baked into the
/// validated SQL, so it applies wherever the query is routed.
pub async fn execute_sql_query(
    query: String,
    project_id: Uuid,
    parameters: HashMap<String, Value>,
    source: SqlQuerySource,
    policy: AccessPolicy,
    clickhouse_ro: Arc<ClickhouseReadonlyClient>,
    query_engine: Arc<QueryEngine>,
    http_client: Arc<reqwest::Client>,
    db: Arc<DB>,
    cache: Arc<Cache>,
    audit: Option<SqlAudit>,
) -> Result<Vec<Value>, SqlQueryError> {
    let tracer = global::tracer("app-server");

    let audit_query = audit.as_ref().map(|_| query.clone());
    let validated = validate_query(query, project_id, &policy, query_engine).await;
    let (validated_query, tables) = match validated {
        Ok(validated) => validated,
        Err(e) => {
            if let (Some(audit), Some(query)) = (audit, audit_query) {
                audit_sql_query(
                    db,
                    cache,
                    audit,
                    project_id,
                    source,
                    query,
                    Vec::new(),
                    AuditOutcome::Denied,
                )
                .await;
            }
            return Err(e);
        }
    };

    // Execute query
    let res = route_and_run_query(
        &db.pool,
        cache.clone(),
        clickhouse_ro,
        http_client,
        project_id,
        validated_query,
        parameters,
        source,
    )
    .await;

    if let (Some(audit), Some(query)) = (audit, audit_query) {
        let outcome = if res.is_ok() {
            AuditOutcome::Success
        } else {
            AuditOutcome::Error
        };
        audit_sql_query(
            db.clone(),
            cache,
            audit,
            project_id,
            source,
            query,
            tables,
            outcome,
        )
        .await;
    }

    let data = match res {
        Ok(data) => data,
        Err(e) => {
            return Err(e);
        }
    };

    // Process query response
    let mut processing_span = tracer.start("process_query_response");

    let results: Value = serde_json::from_slice(&data).map_err(|e| {
        log::error!("Failed to parse ClickHouse response as JSON: {}", e);
        processing_span.record_error(&e);
        processing_span.end();
        SqlQueryError::InternalError(e.to_string())
    })?;

    let data_array = results
        .get("data")
        .ok_or_else(|| {
            let msg = "Response missing 'data' field".to_string();
            processing_span.record_error(&SqlQueryError::InternalError(msg.clone()));
            processing_span.end();
            SqlQueryError::InternalError(msg)
        })?
        .as_array()
        .ok_or_else(|| {
            let msg = "Response 'data' field is not an array".to_string();
            processing_span.record_error(&SqlQueryError::InternalError(msg.clone()));
            processing_span.end();
            SqlQueryError::InternalError(msg)
        })?;

    processing_span.end();

    Ok(data_array.clone())
}

fn find_query_start_idx(error_message: &str) -> Option<usize> {
    error_message
        .find("In scope")
        .or(error_message.find("In query"))
        .or(error_message.find("WITH").or(error_message.find("SELECT")))
        .or(error_message.find("AS"))
}

fn remove_query_from_error_message(error_message: &str) -> String {
    let query_start_idx = find_query_start_idx(&error_message);
    let error_code_idx = ERROR_END_REGEX
        .find(&error_message)
        // +2 to skip the dot at the beginning of the error code
        .map(|m| m.start() + 2)
        .unwrap_or(error_message.len());
    // remove the query from the error message
    let error_message = format!(
        "{}{}",
        if let Some(query_start_idx) = query_start_idx {
            &error_message[..query_start_idx]
        } else {
            &error_message[..error_code_idx]
        },
        &error_message[error_code_idx..]
    );
    // Although settings are part of the query, they won't be removed if
    // we fail to locate the query in the first place, so as a safety measure
    // also remove them manually
    let without_settings = SETTING_REGEX.replace_all(&error_message, "").to_string();
    VERSION_REGEX.replace_all(&without_settings, "").to_string()
}

/// Record a `sql.query` event. Awaited so a query is never answered without
/// its audit trail; a failed publish is logged, not surfaced to the caller.
#[allow(clippy::too_many_arguments)]
pub async fn audit_sql_query(
    db: Arc<DB>,
    cache: Arc<Cache>,
    audit: SqlAudit,
    project_id: Uuid,
    source: SqlQuerySource,
    query: String,
    tables: Vec<String>,
    outcome: AuditOutcome,
) {
    let Some(audit_source) = source.audit_source() else {
        return;
    };
    let query = match loggable_query(&db.pool, cache.clone(), project_id, query).await {
        Some(query) => Value::String(truncate_utf8(query, AUDIT_MAX_QUERY_BYTES)),
        None => Value::Null,
    };
    let mut input = AuditEventInput::new(
        audit.actor,
        audit_source,
        AuditResource::Sql,
        AuditAction::Query,
        outcome,
    );
    input.project_id = Some(project_id);
    input.metadata = Some(json!({
        "query": query,
        "tables": tables,
        "channel": source,
    }));
    if let Err(e) = audit::emit(db, cache, &audit.queue, input).await {
        log::error!("Failed to emit sql.query audit event: {e:?}");
    }
}

/// Hybrid workspaces keep their data in their own data plane, so their query
/// text is stored with literals stripped; `None` if it can't be stripped.
async fn loggable_query(
    pool: &PgPool,
    cache: Arc<Cache>,
    project_id: Uuid,
    query: String,
) -> Option<String> {
    match get_workspace_deployment(pool, cache, project_id).await {
        Ok(config) if config.mode == DeploymentMode::CLOUD => Some(query),
        _ => strip_literals(&query),
    }
}

fn truncate_utf8(mut s: String, max_bytes: usize) -> String {
    if s.len() > max_bytes {
        let mut end = max_bytes;
        while !s.is_char_boundary(end) {
            end -= 1;
        }
        s.truncate(end);
    }
    s
}

/// The `sql.query` span attribute with literals stripped: they can hold
/// customer data, which must not reach our own traces. `None` if the query
/// doesn't parse.
pub fn query_span_attribute(query: &str) -> Option<KeyValue> {
    strip_literals(query).map(|stripped| KeyValue::new("sql.query", stripped))
}

/// Validates the query using the query engine. Returns the rewritten query and
/// the tables it reads.
pub async fn validate_query(
    query: String,
    project_id: Uuid,
    policy: &AccessPolicy,
    query_engine: Arc<QueryEngine>,
) -> Result<(String, Vec<String>), SqlQueryError> {
    let tracer = global::tracer("app-server");
    let mut span = tracer.start("validate_sql_query");
    if let Some(attribute) = query_span_attribute(&query) {
        span.set_attribute(attribute);
    }
    span.set_attribute(KeyValue::new("project_id", project_id.to_string()));
    span.set_attribute(KeyValue::new("sql.policy", policy.to_view_arg()));

    let validation_result = query_engine.validate_query(query, project_id, policy).await;

    let validated = match validation_result {
        Ok(QueryEngineValidationResult::Success {
            validated_query,
            tables,
        }) => (validated_query, tables),
        Ok(QueryEngineValidationResult::Error { error }) => {
            span.record_error(&std::io::Error::new(
                std::io::ErrorKind::Other,
                error.clone(),
            ));
            span.end();
            return Err(SqlQueryError::ValidationError(error));
        }
        Err(e) => {
            span.record_error(&std::io::Error::new(
                std::io::ErrorKind::Other,
                e.to_string(),
            ));
            span.end();
            return Err(SqlQueryError::ValidationError(e.to_string()));
        }
    };
    span.end();

    Ok(validated)
}

// Routes the query to the appropriate backend and runs it.
pub async fn route_and_run_query(
    pool: &PgPool,
    cache: Arc<Cache>,
    clickhouse_ro: Arc<ClickhouseReadonlyClient>,
    http_client: Arc<reqwest::Client>,
    project_id: Uuid,
    query: String,
    parameters: HashMap<String, Value>,
    source: SqlQuerySource,
) -> Result<Bytes, SqlQueryError> {
    let config = get_workspace_deployment(pool, cache.clone(), project_id).await;
    let deployment_config = match config {
        Ok(config) => config,
        Err(e) => return Err(SqlQueryError::InternalError(e.to_string())),
    };

    match deployment_config.mode {
        DeploymentMode::CLOUD => {
            ch::query(clickhouse_ro, project_id, query, parameters, source).await
        }
        DeploymentMode::HYBRID => {
            data_plane::query(
                cache,
                http_client,
                deployment_config,
                project_id,
                query,
                parameters,
            )
            .await
        }
    }
}

#[cfg(test)]
mod tests {
    use super::SqlQueryError;

    #[test]
    fn unavailable_message_is_shown_verbatim() {
        // The ClickHouse-error sanitizer cuts at the first `AS`/`SELECT`, which
        // `CLICKHOUSE_POSTGRES_PASSWORD` would trigger; our own message must not go through it.
        let msg = "set CLICKHOUSE_POSTGRES_USER and CLICKHOUSE_POSTGRES_PASSWORD (see the README).";
        assert_eq!(
            SqlQueryError::Unavailable(msg.to_string()).to_string(),
            serde_json::json!({ "error": format!("Error executing query: {msg}") }).to_string()
        );
        assert!(
            !SqlQueryError::BadResponseError(msg.to_string())
                .to_string()
                .contains("PASSWORD")
        );
    }
}
