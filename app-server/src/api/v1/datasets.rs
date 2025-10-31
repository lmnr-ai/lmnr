use std::{collections::HashMap, sync::Arc};

use actix_web::{HttpResponse, get, post, web};
use chrono::Utc;
use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    ch::datapoints::{self as ch_datapoints},
    datasets::datapoints::{CHQueryEngineDatapoint, Datapoint},
    db::{self, DB, project_api_keys::ProjectApiKey},
    query_engine::QueryEngine,
    routes::{PaginatedResponse, types::ResponseResult},
    sql::{self, ClickhouseReadonlyClient},
    storage::{Storage, StorageTrait},
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetDatapointsRequestParams {
    #[serde(alias = "dataset_name", alias = "name")]
    dataset_name: String,
    limit: i64,
    offset: i64,
}

#[get("/datasets/datapoints")]
async fn get_datapoints(
    params: web::Query<GetDatapointsRequestParams>,
    db: web::Data<DB>,
    clickhouse_ro: web::Data<Option<Arc<ClickhouseReadonlyClient>>>,
    query_engine: web::Data<Arc<QueryEngine>>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let db = db.into_inner();
    let clickhouse_ro = if let Some(clickhouse_ro) = clickhouse_ro.as_ref() {
        clickhouse_ro.clone()
    } else {
        return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "ClickHouse read-only client is not configured"
        })));
    };
    let query_engine = query_engine.into_inner().as_ref().clone();
    let query = params.into_inner();

    let dataset_id =
        db::datasets::get_dataset_id_by_name(&db.pool, &query.dataset_name, project_id).await?;

    let Some(dataset_id) = dataset_id else {
        return Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "Dataset not found"
        })));
    };

    let select_query = "
        SELECT
            id,
            dataset_id,
            created_at,
            data,
            target,
            metadata
        FROM dataset_datapoints
        WHERE dataset_id = {dataset_id:UUID}
        ORDER BY toUInt128(id) ASC
        LIMIT {limit:Int64}
        OFFSET {offset:Int64}
    ";
    let parameters = HashMap::from([
        (
            "dataset_id".to_string(),
            Value::String(dataset_id.to_string()),
        ),
        ("limit".to_string(), Value::Number(query.limit.into())),
        ("offset".to_string(), Value::Number(query.offset.into())),
    ]);

    let select_query_result = sql::execute_sql_query(
        select_query.to_string(),
        project_id,
        parameters.clone(),
        clickhouse_ro.clone(),
        query_engine.clone(),
    )
    .await?;

    let total_count_query = "
        SELECT COUNT(*) as count FROM dataset_datapoints
        WHERE dataset_id = {dataset_id:UUID}
    ";

    let total_count_result = sql::execute_sql_query(
        total_count_query.to_string(),
        project_id,
        HashMap::from([(
            "dataset_id".to_string(),
            Value::String(dataset_id.to_string()),
        )]),
        clickhouse_ro,
        query_engine,
    )
    .await?;

    let total_count = total_count_result
        .first()
        .and_then(|v| v.get("count").and_then(|v| v.as_i64()).map(|v| v as u64))
        .unwrap_or_default();

    let datapoints: Vec<Datapoint> = select_query_result
        .into_iter()
        .map(|ch_dp| {
            serde_json::from_value::<CHQueryEngineDatapoint>(ch_dp)
                .map_err(anyhow::Error::from)
                .and_then(|ch_dp| ch_dp.try_into())
        })
        .collect::<Result<Vec<Datapoint>, anyhow::Error>>()?;

    let response = PaginatedResponse {
        total_count,
        items: datapoints,
        any_in_project: total_count > 0,
    };

    Ok(HttpResponse::Ok().json(response))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDatapointsRequest {
    // The alias is added to support the old endpoint (dataset_name)
    #[serde(alias = "dataset_name")]
    pub dataset_name: String,
    pub datapoints: Vec<CreateDatapointRequest>,
}

#[derive(Deserialize)]
pub struct CreateDatapointRequest {
    #[serde(default)]
    pub id: Option<Uuid>,
    pub data: serde_json::Value,
    pub target: Option<serde_json::Value>,
    #[serde(default)]
    pub metadata: std::collections::HashMap<String, serde_json::Value>,
}

/// Create datapoints in a dataset
///
/// Request body should contain:
/// - dataset_name: The name of the dataset to add datapoints to
/// - datapoints: Array of datapoint objects with data, optional target, and optional metadata
#[post("/datasets/datapoints")]
async fn create_datapoints(
    req: web::Json<CreateDatapointsRequest>,
    db: web::Data<DB>,
    clickhouse: web::Data<clickhouse::Client>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let db = db.into_inner();
    let clickhouse = clickhouse.into_inner().as_ref().clone();
    let request = req.into_inner();

    // Validate that we have datapoints to insert
    if request.datapoints.is_empty() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "No datapoints provided"
        })));
    }

    let dataset_id =
        db::datasets::get_dataset_id_by_name(&db.pool, &request.dataset_name, project_id).await?;

    let Some(dataset_id) = dataset_id else {
        return Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "Dataset not found"
        })));
    };

    // Convert request datapoints to Datapoint structs
    let datapoints: Vec<Datapoint> = request
        .datapoints
        .into_iter()
        .map(|dp_req| Datapoint {
            // now_v7 is guaranteed to be sorted by creation time
            id: dp_req.id.unwrap_or(Uuid::now_v7()),
            created_at: Utc::now(),
            dataset_id,
            data: dp_req.data,
            target: dp_req.target,
            metadata: dp_req.metadata,
        })
        .collect();

    let ch_datapoints: Vec<ch_datapoints::CHDatapoint> = datapoints
        .iter()
        .map(|dp| ch_datapoints::CHDatapoint::from_datapoint(dp, project_id))
        .collect();

    ch_datapoints::insert_datapoints(clickhouse, ch_datapoints).await?;

    Ok(HttpResponse::Created().json(serde_json::json!({
        "message": "Datapoints created successfully",
        "count": datapoints.len()
    })))
}

#[get("/datasets/{dataset_id}/parquets/{idx}")]
async fn get_parquet(
    path: web::Path<(String, String)>,
    db: web::Data<DB>,
    storage: web::Data<Arc<Storage>>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let (dataset_id_str, name) = path.into_inner();
    let dataset_id =
        Uuid::parse_str(&dataset_id_str).map_err(|_| anyhow::anyhow!("Invalid dataset ID"))?;

    let project_id = project_api_key.project_id;
    let db = db.into_inner();

    let parquet_path =
        db::datasets::get_parquet_path(&db.pool, project_id, dataset_id, &name).await?;

    let Some(parquet_path) = parquet_path else {
        return Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "Parquet not found"
        })));
    };

    let Ok(bucket) = std::env::var("S3_EXPORTS_BUCKET") else {
        return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "exports storage is not configured"
        })));
    };
    let content_length = storage.get_size(&bucket, &parquet_path).await?;

    let get_response = storage.get_stream(&bucket, &parquet_path).await?;

    let filename = parquet_path.split('/').last().unwrap_or(&name);

    let mut response = HttpResponse::Ok();

    response
        .content_type("application/octet-stream")
        .insert_header((
            "Content-Disposition",
            format!("attachment; filename=\"{}\"", filename),
        ))
        .insert_header(("Cache-Control", "no-cache"))
        .no_chunking(content_length);

    Ok(response.streaming(get_response.map(|e| Ok::<_, anyhow::Error>(e))))
}
