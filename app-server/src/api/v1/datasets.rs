use std::sync::Arc;

use actix_web::{HttpResponse, get, post, web};
use futures_util::StreamExt;
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    ch::datapoints as ch_datapoints,
    datasets::datapoints::Datapoint,
    db::{self, DB, project_api_keys::ProjectApiKey},
    routes::{PaginatedResponse, types::ResponseResult},
    storage::{Storage, StorageTrait},
};

#[derive(Deserialize)]
pub struct GetDatapointsRequestParams {
    name: String,
    limit: i64,
    offset: i64,
}

#[get("/datasets/datapoints")]
async fn get_datapoints(
    params: web::Query<GetDatapointsRequestParams>,
    db: web::Data<DB>,
    clickhouse: web::Data<clickhouse::Client>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let db = db.into_inner();
    let clickhouse = clickhouse.into_inner().as_ref().clone();
    let query = params.into_inner();

    let dataset_id =
        db::datasets::get_dataset_id_by_name(&db.pool, &query.name, project_id).await?;

    let Some(dataset_id) = dataset_id else {
        return Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "Dataset not found"
        })));
    };

    // Get datapoints from ClickHouse
    let ch_datapoints = ch_datapoints::get_datapoints_paginated(
        clickhouse.clone(),
        project_id,
        dataset_id,
        Some(query.limit),
        Some(query.offset),
    )
    .await?;

    let total_count = ch_datapoints::count_datapoints(clickhouse, project_id, dataset_id).await?;

    let datapoints: Vec<Datapoint> = ch_datapoints
        .into_iter()
        .map(|ch_dp| ch_dp.into())
        .collect();

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
            id: Uuid::now_v7(),
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
