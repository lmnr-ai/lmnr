use std::{env, sync::Arc};

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

    // Still get dataset metadata from PostgreSQL
    let dataset_id =
        db::datasets::get_dataset_id_by_name(&db.pool, &query.name, project_id).await?;

    // Get datapoints from ClickHouse
    let ch_datapoints = ch_datapoints::get_datapoints_paginated(
        clickhouse.clone(),
        project_id,
        dataset_id,
        Some(query.limit),
        Some(query.offset),
    )
    .await?;

    // Get total count from ClickHouse
    let total_count = ch_datapoints::count_datapoints(clickhouse, project_id, dataset_id).await?;

    // Convert CHDatapoints to Datapoints
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
pub struct CreateDatapointsRequest {
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

    // Get dataset metadata from PostgreSQL
    let dataset_id =
        db::datasets::get_dataset_id_by_name(&db.pool, &request.dataset_name, project_id).await?;

    // Convert request datapoints to Datapoint structs
    let datapoints: Vec<Datapoint> = request
        .datapoints
        .into_iter()
        .map(|dp_req| Datapoint {
            id: Uuid::new_v4(),
            dataset_id,
            data: dp_req.data,
            target: dp_req.target,
            metadata: dp_req.metadata,
        })
        .collect();

    // Convert to ClickHouse datapoints
    let ch_datapoints: Vec<ch_datapoints::CHDatapoint> = datapoints
        .iter()
        .map(|dp| ch_datapoints::CHDatapoint::from_datapoint(dp, project_id))
        .collect();

    // Insert into ClickHouse
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

    // Get parquet paths from database
    let parquet_path =
        db::datasets::get_parquet_path(&db.pool, project_id, dataset_id, &name).await?;

    let Some(parquet_path) = parquet_path else {
        return Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "Parquet not found"
        })));
    };

    // Get object metadata to determine file size
    let content_length = storage
        .get_size(&parquet_path, &env::var("S3_EXPORTS_BUCKET").ok())
        .await?;

    // Stream the file from S3
    let get_response = storage
        .get_stream(&parquet_path, &env::var("S3_EXPORTS_BUCKET").ok())
        .await?;

    let filename = parquet_path.split('/').last().unwrap_or(&name);

    let mut response = HttpResponse::Ok();

    response
        .content_type("application/octet-stream")
        .insert_header((
            "Content-Disposition",
            format!("attachment; filename=\"{}\"", filename),
        ))
        .insert_header(("Cache-Control", "no-cache"))
        .insert_header(("Content-Length", content_length.to_string()));

    Ok(response.streaming(get_response.map(|e| Ok::<_, anyhow::Error>(e))))
}
