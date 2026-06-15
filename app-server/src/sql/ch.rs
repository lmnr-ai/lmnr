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

use crate::env;
use crate::sql::{ClickhouseReadonlyClient, SqlQueryError};

#[derive(Deserialize)]
pub struct ClickhouseBadResponseError {
    #[serde(default)]
    pub exception: Option<String>,
}

pub async fn query(
    clickhouse_ro: Arc<ClickhouseReadonlyClient>,
    project_id: Uuid,
    query: String,
    parameters: HashMap<String, Value>,
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
            log::warn!("Error executing user SQL query: {}", &msg);
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
