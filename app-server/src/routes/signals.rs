use std::{collections::HashMap, sync::Arc};

use actix_web::{HttpResponse, post, web};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    cache::Cache,
    db::{self, DB},
    mq::MessageQueue,
    query_engine::QueryEngine,
    signals::enqueue::enqueue_signal_job,
    sql::{self, ClickhouseReadonlyClient},
};

use super::{ResponseResult, error::Error};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitSignalJobRequest {
    pub query: String,
    pub signal_id: Uuid,
    #[serde(default)]
    pub parameters: HashMap<String, serde_json::Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitSignalJobResponse {
    pub job_id: Uuid,
    pub total_traces: i32,
    pub signal_id: Uuid,
}

#[post("signal-job")]
pub async fn submit_signal_job(
    project_id: web::Path<Uuid>,
    request: web::Json<SubmitSignalJobRequest>,
    db: web::Data<DB>,
    clickhouse: web::Data<clickhouse::Client>,
    clickhouse_ro: web::Data<Option<Arc<ClickhouseReadonlyClient>>>,
    query_engine: web::Data<Arc<QueryEngine>>,
    queue: web::Data<Arc<MessageQueue>>,
    cache: web::Data<Cache>,
    http_client: web::Data<reqwest::Client>,
) -> ResponseResult {
    let project_id = project_id.into_inner();

    let SubmitSignalJobRequest {
        query,
        parameters,
        signal_id,
    } = request.into_inner();

    let clickhouse_client = match clickhouse_ro.as_ref() {
        Some(client) => client.clone(),
        None => {
            return Err(Error::InternalAnyhowError(anyhow::anyhow!(
                "ClickHouse client is not configured"
            )));
        }
    };

    let signal = db::signals::get_signal(&db.pool, signal_id, project_id)
        .await
        .map_err(|e| {
            log::error!("Failed to query signal: {:?}", e);
            Error::InternalAnyhowError(anyhow::anyhow!("Failed to query signal"))
        })?;

    let signal = match signal {
        Some(def) => def,
        None => {
            return Ok(HttpResponse::NotFound().json(serde_json::json!({
                "error": "Signal not found"
            })));
        }
    };

    let db = db.into_inner();

    let results = sql::execute_sql_query(
        query,
        project_id,
        parameters,
        clickhouse_client,
        query_engine.into_inner().as_ref().clone(),
        http_client.into_inner(),
        db.clone(),
        cache.into_inner(),
    )
    .await
    .map_err(|e: sql::SqlQueryError| {
        log::error!("Failed to execute query for trace IDs: {:?}", e);
        Error::InternalAnyhowError(anyhow::anyhow!("Failed to execute query: {}", e))
    })?;

    // Extract trace IDs from query results
    let trace_ids = results
        .iter()
        .filter_map(|row| {
            row.get("id").and_then(|v| {
                v.as_str().and_then(|s| {
                    Uuid::parse_str(s)
                        .map_err(|e| {
                            log::error!("Failed to parse trace ID. Skipping trace: {:?}", e);
                            e
                        })
                        .ok()
                })
            })
        })
        .collect::<Vec<_>>();

    let total_traces: i32 = trace_ids.len() as i32;

    if total_traces == 0 {
        return Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "No traces found matching the query"
        })));
    }

    let response = enqueue_signal_job(
        project_id,
        signal,
        db,
        trace_ids,
        clickhouse.as_ref().clone(),
        queue.as_ref().clone(),
    )
    .await
    .map_err(|e| {
        log::error!("Failed to prebatch signal job: {:?}", e);
        Error::InternalAnyhowError(anyhow::anyhow!("Failed to prebatch signal job"))
    })?;

    Ok(HttpResponse::Ok().json(response))
}
