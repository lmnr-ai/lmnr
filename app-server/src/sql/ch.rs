use std::collections::HashMap;

use bytes::Bytes;
use opentelemetry::{
    KeyValue, global,
    trace::{Span, Tracer},
};
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;
use uuid::Uuid;

use crate::sql::{ClickhouseReadonlyClient, SqlQueryError, SqlQuerySource};
use crate::{env, utils};

#[derive(Deserialize)]
pub struct ClickhouseBadResponseError {
    #[serde(default)]
    pub exception: Option<String>,
}

/// Max query chars kept in the memory-limit error log.
const LOGGED_QUERY_MAX_CHARS: usize = 4096;

/// True when a ClickHouse exception is `MEMORY_LIMIT_EXCEEDED` (code 241) — either the per-query
/// `max_memory_usage` cap we apply to public traffic, or the server-wide total limit.
///
/// Matched on the `Code: 241` PREFIX rather than a `MEMORY_LIMIT_EXCEEDED` substring: exceptions for
/// malformed SQL echo the offending query back inside the message, so a substring match would let a
/// user forge one by putting the error name in their query.
fn is_memory_limit_exception(exception: &str) -> bool {
    exception.trim_start().starts_with("Code: 241")
}

pub async fn query(
    clickhouse_ro: Arc<ClickhouseReadonlyClient>,
    project_id: Uuid,
    query: String,
    parameters: HashMap<String, Value>,
    source: SqlQuerySource,
) -> Result<Bytes, SqlQueryError> {
    let tracer = global::tracer("app-server");
    let mut span = tracer.start("execute_sql_query");

    span.set_attribute(KeyValue::new("sql.query", query.clone()));
    span.set_attribute(KeyValue::new("project_id", project_id.to_string()));
    let mut clickhouse_query = clickhouse_ro
        .query(&query)
        .with_setting("default_format", "JSON")
        .with_setting("output_format_json_quote_64bit_integers", "0")
        .with_setting("max_execution_time", env::sql::MAX_EXECUTION_TIME.get())
        .with_setting("max_result_bytes", env::sql::MAX_RESULT_BYTES.get());

    // Cap per-query memory for public/CLI traffic only — the trusted frontend
    // runs uncapped. `0` (the default) means unlimited, so we only set it when an
    // operator has opted in to a concrete ceiling.
    if source == SqlQuerySource::Public {
        let max_memory_usage = env::sql::MAX_MEMORY_USAGE.get();
        if max_memory_usage != "0" {
            clickhouse_query = clickhouse_query.with_setting("max_memory_usage", max_memory_usage);
        }
        let min_bytes_direct_io = env::sql::MIN_BYTES_TO_USE_DIRECT_IO.get();
        if min_bytes_direct_io != "0" {
            clickhouse_query =
                clickhouse_query.with_setting("min_bytes_to_use_direct_io", min_bytes_direct_io);
        }
    }

    for (key, value) in parameters {
        span.set_attribute(KeyValue::new(
            format!("sql.parameters.{key}"),
            value.to_string(),
        ));
        clickhouse_query = clickhouse_query.param(&key, value);
    }

    let mut rows = clickhouse_query.fetch_bytes("JSON").map_err(|e| {
        span.record_error(&e);
        span.end();
        SqlQueryError::InternalError(format!("Failed to execute ClickHouse query: {}", e))
    })?;

    let data = rows.collect().await.map_err(|e| match e {
        clickhouse::error::Error::BadResponse(e) => {
            let Ok(error) = serde_json::from_str::<ClickhouseBadResponseError>(&e) else {
                span.record_error(&std::io::Error::new(
                    std::io::ErrorKind::Other,
                    e.to_string(),
                ));
                span.end();
                return SqlQueryError::InternalError(format!(
                    "Failed to parse ClickHouse error: {}",
                    e
                ));
            };
            let msg = error.exception.unwrap_or_default();
            span.record_error(&std::io::Error::new(std::io::ErrorKind::Other, e));
            span.end();
            // Memory-limit hits are logged at `error` WITH the query: this endpoint's bad requests
            // are filtered out as noise from malformed user SQL, but a query big enough to trip the
            // cap is a capacity signal we need to see, and it's unactionable without the SQL.
            if is_memory_limit_exception(&msg) {
                log::error!(
                    "User SQL query exceeded ClickHouse memory limit. project_id: {project_id}, error: {msg}, query: {}",
                    utils::truncate_chars(&query, LOGGED_QUERY_MAX_CHARS)
                );
            } else {
                log::warn!("Error executing user SQL query: {}", &msg);
            }
            SqlQueryError::BadResponseError(msg)
        }
        _ => {
            span.record_error(&e);
            span.end();
            log::error!("Failed to collect query response data: {}", e);
            SqlQueryError::InternalError(e.to_string())
        }
    })?;
    span.set_attribute(KeyValue::new("sql.response_bytes", data.len() as i64));
    span.end();

    return Ok(data);
}

#[cfg(test)]
mod tests {
    use super::is_memory_limit_exception;

    #[test]
    fn detects_per_query_memory_limit() {
        assert!(is_memory_limit_exception(
            "Code: 241. DB::Exception: Query memory limit exceeded: would use 1.17 MiB \
             (attempt to allocate chunk of 0.00 B), maximum: 976.56 KiB: While executing \
             MergeTreeSelect(pool: PrefetchedReadPool, algorithm: Thread). \
             (MEMORY_LIMIT_EXCEEDED) (version 26.2.1.558 (official build))"
        ));
    }

    #[test]
    fn ignores_other_clickhouse_errors() {
        assert!(!is_memory_limit_exception(
            "Code: 47. DB::Exception: Unknown expression identifier 'foo'. (UNKNOWN_IDENTIFIER)"
        ));
        assert!(!is_memory_limit_exception(""));
    }

    #[test]
    fn a_user_cannot_forge_the_memory_limit_classification() {
        // Malformed-SQL exceptions echo the query back, so a substring match on the error NAME
        // would let a user promote their own syntax error to an `error`-level log.
        assert!(!is_memory_limit_exception(
            "Code: 47. DB::Exception: Unknown expression identifier 'MEMORY_LIMIT_EXCEEDED' \
             In scope SELECT MEMORY_LIMIT_EXCEEDED FROM spans. (UNKNOWN_IDENTIFIER)"
        ));
        assert!(!is_memory_limit_exception(
            "Code: 62. DB::Exception: Syntax error: failed at position 8: Code: 241. \
             (SYNTAX_ERROR)"
        ));
    }
}
