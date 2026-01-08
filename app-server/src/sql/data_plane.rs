use std::collections::HashMap;

use bytes::Bytes;
use opentelemetry::{
    KeyValue, global,
    trace::{Span, Tracer},
};
use reqwest;
use serde::Serialize;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    data_plane::{auth::generate_auth_token, crypto},
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
    http_client: &reqwest::Client,
    project_id: Uuid,
    config: &WorkspaceDeployment,
    query: String,
    parameters: HashMap<String, Value>,
) -> Result<Bytes, SqlQueryError> {
    let tracer = global::tracer("app-server");

    if config.data_plane_url.is_empty() {
        return Err(SqlQueryError::InternalError(
            "Data plane URL is empty".to_string(),
        ));
    }

    // Decrypt data_plane_url if present
    let data_plane_url = crypto::decrypt(
        config.workspace_id,
        &config.data_plane_url_nonce,
        &config.data_plane_url,
    )
    .map_err(|e| SqlQueryError::InternalError(e.to_string()))?;

    // Generate auth token
    let auth_token = generate_auth_token(config);
    let auth_token = match auth_token {
        Ok(token) => token,
        Err(e) => return Err(SqlQueryError::InternalError(e.to_string())),
    };

    let mut span = tracer.start("execute_data_plane_sql_query");
    span.set_attribute(KeyValue::new("sql.query", query.clone()));
    span.set_attribute(KeyValue::new("data_plane_url", data_plane_url.clone()));

    let request = DataPlaneReadRequest {
        query,
        project_id,
        parameters,
    };

    let response = http_client
        .post(format!("{}/api/v1/ch/read", data_plane_url))
        .header("Authorization", format!("Bearer {}", auth_token))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| {
            span.record_error(&e);
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
