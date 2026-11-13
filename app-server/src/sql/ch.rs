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

use crate::sql::{ClickhouseReadonlyClient, SqlQueryError, SqlQuerySource, query_span_attribute};
use crate::{env, utils};

#[derive(Deserialize)]
pub struct ClickhouseBadResponseError {
    #[serde(default)]
    pub exception: Option<String>,
}

/// Max query chars kept in the memory-limit log.
const LOGGED_QUERY_MAX_CHARS: usize = 4096;

/// True when a ClickHouse exception is `MEMORY_LIMIT_EXCEEDED` (code 241) — either the per-query
/// `max_memory_usage` cap we apply to public traffic, or the server-wide total limit.
///
/// Matched on the `Code: 241` PREFIX rather than a `MEMORY_LIMIT_EXCEEDED` substring: exceptions for
/// malformed SQL echo the offending query back inside the message, so a substring match would let a
/// user pick which log line they land in by putting the error name in their query.
fn is_memory_limit_exception(exception: &str) -> bool {
    exception.trim_start().starts_with("Code: 241")
}

/// Tables behind the `<table>_dict` name-column dicts (`postgres-engine.ts`).
const PG_ENTITY_DICT_TABLES: [&str; 3] = ["signals", "evaluations", "datasets"];

#[derive(Debug, PartialEq)]
enum PgEntityFailure {
    /// No `pg` database or entity dicts: `CLICKHOUSE_POSTGRES_*` unset or refused.
    NotConfigured,
    /// ClickHouse cannot connect to Postgres.
    Unreachable,
}

/// Matched on message prefixes, like `is_memory_limit_exception`, because some
/// messages echo the user's query later on. User SQL can name no database but
/// `default`, so an unknown database (81) is `pg`.
fn postgres_entity_failure(exception: &str) -> Option<PgEntityFailure> {
    let exception = exception.trim_start();
    let names_pg_dict = |rest: &str| {
        PG_ENTITY_DICT_TABLES
            .iter()
            .any(|table| rest.starts_with(&format!("{table}_dict")))
    };
    if exception.starts_with("Code: 614.")
        // A pooled connection that broke, before the pool reports 614.
        || exception.starts_with("std::exception. Code: 1001, type: pqxx::")
        || exception
            .strip_prefix("Code: 510. DB::Exception: Update failed for dictionary 'default.")
            .is_some_and(names_pg_dict)
    {
        Some(PgEntityFailure::Unreachable)
    } else if exception.starts_with("Code: 81.")
        || exception
            .strip_prefix("Code: 36. DB::Exception: Dictionary (`default.")
            .is_some_and(names_pg_dict)
    {
        Some(PgEntityFailure::NotConfigured)
    } else {
        None
    }
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

    if let Some(attribute) = query_span_attribute(&query) {
        span.set_attribute(attribute);
    }
    span.set_attribute(KeyValue::new("project_id", project_id.to_string()));
    let mut clickhouse_query = clickhouse_ro
        .query(&query)
        .with_setting("default_format", "JSON")
        .with_setting("output_format_json_quote_64bit_integers", "0")
        .with_setting("max_execution_time", env::sql::MAX_EXECUTION_TIME.get())
        .with_setting("max_result_bytes", env::sql::MAX_RESULT_BYTES.get());

    // Both settings are only needed because cloud production pins
    // `compatibility = 24.6`, which reverts them to off / `LIMIT <= 10`.
    let lazy_materialization_limit = env::sql::MAX_LIMIT_FOR_LAZY_MATERIALIZATION.get();
    if lazy_materialization_limit != 0 {
        clickhouse_query = clickhouse_query
            .with_setting("query_plan_optimize_lazy_materialization", "1")
            .with_setting(
                "query_plan_max_limit_for_lazy_materialization",
                lazy_materialization_limit.to_string(),
            );
    }

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
            let pg_failure = postgres_entity_failure(&msg);
            // Memory-limit hits stay at `warn` (it's still a client error — `error` only made
            // Sentry noisy), but keep the query: the cap is a capacity signal that's unactionable
            // without the SQL.
            if is_memory_limit_exception(&msg) {
                log::warn!(
                    "User SQL query exceeded ClickHouse memory limit. project_id: {project_id}, error: {msg}, query: {}",
                    utils::truncate_chars(&query, LOGGED_QUERY_MAX_CHARS)
                );
            } else if pg_failure == Some(PgEntityFailure::Unreachable) {
                log::error!("ClickHouse cannot reach Postgres, pg entities are unavailable: {msg}");
            } else {
                log::warn!("Error executing user SQL query: {}", &msg);
            }
            match pg_failure {
                Some(PgEntityFailure::NotConfigured) => SqlQueryError::Unavailable(
                    "pg entities are not available on this deployment: ClickHouse \
                     cannot read them from Postgres. On a self-hosted deployment, set \
                     CLICKHOUSE_POSTGRES_USER and CLICKHOUSE_POSTGRES_PASSWORD (see the README)."
                        .to_string(),
                ),
                Some(PgEntityFailure::Unreachable) => SqlQueryError::Unavailable(
                    "pg entities are temporarily unavailable: ClickHouse cannot reach Postgres."
                        .to_string(),
                ),
                None => SqlQueryError::BadResponseError(msg),
            }
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
    use super::{PgEntityFailure, is_memory_limit_exception, postgres_entity_failure};

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
        // would let a user get their own syntax error logged with the query attached.
        assert!(!is_memory_limit_exception(
            "Code: 47. DB::Exception: Unknown expression identifier 'MEMORY_LIMIT_EXCEEDED' \
             In scope SELECT MEMORY_LIMIT_EXCEEDED FROM spans. (UNKNOWN_IDENTIFIER)"
        ));
        assert!(!is_memory_limit_exception(
            "Code: 62. DB::Exception: Syntax error: failed at position 8: Code: 241. \
             (SYNTAX_ERROR)"
        ));
    }

    #[test]
    fn detects_pg_entities_not_configured() {
        assert_eq!(
            postgres_entity_failure(
                "Code: 81. DB::Exception: Database pg does not exist. (UNKNOWN_DATABASE) \
                 (version 25.10.7.6 (official build))"
            ),
            Some(PgEntityFailure::NotConfigured)
        );
        assert_eq!(
            postgres_entity_failure(
                "Code: 36. DB::Exception: Dictionary (`default.signals_dict`) not found: In scope \
                 SELECT dictGetOrDefault('default.signals_dict', 'name', (e.project_id, \
                 e.signal_id), '') AS signal_name FROM signal_events. (BAD_ARGUMENTS)"
            ),
            Some(PgEntityFailure::NotConfigured)
        );
    }

    #[test]
    fn detects_postgres_unreachable() {
        assert_eq!(
            postgres_entity_failure(
                "Code: 614. DB::Exception: Try 2. Connection to `postgres:5432` failed with \
                 error: could not translate host name \"postgres\" to address: Name or service \
                 not known\n\n. (POSTGRESQL_CONNECTION_FAILURE)"
            ),
            Some(PgEntityFailure::Unreachable)
        );
        assert_eq!(
            postgres_entity_failure(
                "std::exception. Code: 1001, type: pqxx::broken_connection, e.what() = Lost \
                 connection to the database server. (version 25.10.7.6 (official build))"
            ),
            Some(PgEntityFailure::Unreachable)
        );
        assert_eq!(
            postgres_entity_failure(
                "Code: 510. DB::Exception: Update failed for dictionary 'default.signals_dict \
                 (8fff6647-34f9-4f4d-be4c-2033a58fe5ea)': Code: 510. DB::Exception: Update failed \
                 for dictionary default.signals_dict (8fff6647-34f9-4f4d-be4c-2033a58fe5ea) : \
                 Code: 614. DB::Exception: Try 2. Connection to `postgres:5432` failed. \
                 (POSTGRESQL_CONNECTION_FAILURE),. (CACHE_DICTIONARY_UPDATE_FAIL)"
            ),
            Some(PgEntityFailure::Unreachable)
        );
    }

    #[test]
    fn ignores_other_and_forged_pg_errors() {
        assert_eq!(
            postgres_entity_failure(
                "Code: 47. DB::Exception: Unknown expression identifier 'foo'. (UNKNOWN_IDENTIFIER)"
            ),
            None
        );
        assert_eq!(
            postgres_entity_failure(
                "Code: 36. DB::Exception: Dictionary (`default.clusters_dict`) not found. \
                 (BAD_ARGUMENTS)"
            ),
            None
        );
        assert_eq!(
            postgres_entity_failure(
                "Code: 62. DB::Exception: Syntax error: failed at position 8: Code: 614. \
                 (SYNTAX_ERROR)"
            ),
            None
        );
    }
}
