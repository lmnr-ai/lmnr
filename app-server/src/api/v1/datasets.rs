use actix_web::{HttpResponse, get, post, web};
use aws_sdk_s3::Client as S3Client;
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    ch::datapoints as ch_datapoints,
    datasets::datapoints::Datapoint,
    db::{self, DB, project_api_keys::ProjectApiKey},
    routes::{PaginatedResponse, types::ResponseResult},
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
    s3_client: web::Data<Option<S3Client>>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let (dataset_id_str, name) = path.into_inner();
    let dataset_id =
        Uuid::parse_str(&dataset_id_str).map_err(|_| anyhow::anyhow!("Invalid dataset ID"))?;

    let project_id = project_api_key.project_id;
    let db = db.into_inner();

    // Get S3 client or return 500 if not available
    let s3_client = s3_client
        .as_ref()
        .as_ref()
        .ok_or(anyhow::anyhow!("S3 client not available"))?;

    // Get parquet paths from database
    let parquet_path =
        db::datasets::get_parquet_path(&db.pool, project_id, dataset_id, &name).await?;

    let Some(parquet_path) = parquet_path else {
        return Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "Parquet not found"
        })));
    };

    // Get the S3 exports bucket from environment
    let bucket = std::env::var("S3_EXPORTS_BUCKET")
        .map_err(|_| anyhow::anyhow!("S3_EXPORTS_BUCKET not configured"))?;

    // Get object metadata to determine file size
    let head_response = s3_client
        .head_object()
        .bucket(&bucket)
        .key(&parquet_path)
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("S3 head error: {}", e))?;

    // Stream the file from S3
    let get_response = s3_client
        .get_object()
        .bucket(&bucket)
        .key(&parquet_path)
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("S3 get error: {}", e))?;

    let filename = parquet_path.split('/').last().unwrap_or(&name);

    // Convert ByteStream to bytes and return as response body
    let mut body_bytes = get_response.body;

    let mut response = HttpResponse::Ok();

    response
        .content_type("application/octet-stream")
        .insert_header((
            "Content-Disposition",
            format!("attachment; filename=\"{}\"", filename),
        ))
        .insert_header(("Cache-Control", "no-cache"));

    // Add Content-Length if available
    if let Some(content_length) = head_response.content_length {
        response.insert_header(("Content-Length", content_length.to_string()));
    }

    let restream = async_stream::stream! {
        while let Some(chunk) = body_bytes.next().await {
            yield chunk;
        }
    };

    Ok(response.streaming(restream))
}
