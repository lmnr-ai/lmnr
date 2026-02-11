use std::{collections::HashMap, sync::Arc};

use bytes::Bytes;
use opentelemetry::{
    KeyValue, global,
    trace::{Span, Tracer},
};
use serde::Serialize;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    cache::Cache,
    data_plane::client::DataPlaneClient,
    db::workspaces::WorkspaceDeployment,
    sql::SqlQueryError,
};

#[derive(Serialize, Debug)]
struct DataPlaneReadRequest {
    query: String,
    project_id: Uuid,
    parameters: HashMap<String, Value>,
}

pub async fn query(
    cache: Arc<Cache>,
    http_client: Arc<reqwest::Client>,
    deployment_config: WorkspaceDeployment,
    project_id: Uuid,
    query: String,
    parameters: HashMap<String, Value>,
) -> Result<Bytes, SqlQueryError> {
    let tracer = global::tracer("app-server");
    let mut span = tracer.start("execute_data_plane_sql_query");
    span.set_attribute(KeyValue::new("sql.query", query.clone()));

    let request = DataPlaneReadRequest {
        query,
        project_id,
        parameters,
    };

    let client = DataPlaneClient::new(cache, (*http_client).clone(), deployment_config);

    let response = client.post("v1/query", &request).await.map_err(|e| {
        span.record_error(&*e);
        span.end();
        SqlQueryError::InternalError(format!("Failed to send request to data plane: {}", e))
    })?;

    if !response.status().is_success() {
        let error_body = response
            .text()
            .await
            .unwrap_or_else(|_| "Failed to read error response body".to_string());

        let error: SqlQueryError = serde_json::from_str(&error_body).unwrap_or_else(|e| {
            SqlQueryError::InternalError(format!(
                "Failed to parse error response: {}. Body: {}",
                e, error_body
            ))
        });
        span.record_error(&std::io::Error::new(
            std::io::ErrorKind::Other,
            error.to_string(),
        ));
        span.end();
        return Err(error);
    }

    span.end();
    response
        .bytes()
        .await
        .map_err(|e| SqlQueryError::InternalError(e.to_string()))
}
