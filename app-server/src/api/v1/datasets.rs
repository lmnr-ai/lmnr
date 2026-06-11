use std::sync::Arc;

use actix_web::{HttpResponse, get, post, web};
use futures_util::StreamExt;
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    cache::Cache,
    datasets::service::{self, CreateDatapointsOutcome, DatasetIdentifier, NewDatapoint},
    db::{self, DB, project_api_keys::ProjectApiKey},
    query_engine::QueryEngine,
    routes::{PaginatedResponse, types::ResponseResult},
    sql::ClickhouseReadonlyClient,
    storage::{Storage, StorageTrait},
};

// Request wrappers are `pub(crate)` so the CLI user-token handlers
// (`api::v1::cli::datasets`) deserialize the same shapes and call the same
// `datasets::service` functions; only the auth extractor differs.

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GetDatasetsRequest {
    #[serde(default)]
    pub id: Option<Uuid>,
    #[serde(default)]
    pub name: Option<String>,
}

#[get("/datasets")]
async fn get_datasets(
    db: web::Data<DB>,
    project_api_key: ProjectApiKey,
    req: web::Query<GetDatasetsRequest>,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let db = db.into_inner();
    let request = req.into_inner();
    let datasets =
        db::datasets::get_datasets(&db.pool, project_id, request.id, request.name).await?;

    Ok(HttpResponse::Ok().json(datasets))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GetDatapointsRequestParams {
    #[serde(flatten)]
    pub dataset: DatasetIdentifier,
    pub limit: i64,
    pub offset: i64,
}

#[get("/datasets/datapoints")]
async fn get_datapoints(
    params: web::Query<GetDatapointsRequestParams>,
    db: web::Data<DB>,
    clickhouse_ro: web::Data<Option<Arc<ClickhouseReadonlyClient>>>,
    query_engine: web::Data<Arc<QueryEngine>>,
    project_api_key: ProjectApiKey,
    http_client: web::Data<reqwest::Client>,
    cache: web::Data<Cache>,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let clickhouse_ro = match clickhouse_ro.as_ref() {
        Some(client) => client.clone(),
        None => {
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "ClickHouse read-only client is not configured"
            })));
        }
    };
    let query = params.into_inner();

    match service::fetch_datapoints_page(
        project_id,
        query.dataset,
        query.limit,
        query.offset,
        clickhouse_ro,
        query_engine.into_inner().as_ref().clone(),
        http_client.into_inner(),
        db.into_inner(),
        cache.into_inner(),
    )
    .await?
    {
        Some((items, total_count)) => Ok(HttpResponse::Ok().json(PaginatedResponse {
            total_count,
            items,
            any_in_project: total_count > 0,
        })),
        None => Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "Dataset not found"
        }))),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateDatapointsRequest {
    #[serde(flatten)]
    pub dataset: DatasetIdentifier,
    pub datapoints: Vec<NewDatapoint>,
    #[serde(default)]
    pub create_dataset: bool,
}

/// Create datapoints in a dataset
#[post("/datasets/datapoints")]
async fn create_datapoints(
    req: web::Json<CreateDatapointsRequest>,
    db: web::Data<DB>,
    clickhouse: web::Data<clickhouse::Client>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let request = req.into_inner();

    let outcome = service::create_datapoints(
        project_id,
        request.dataset,
        request.datapoints,
        request.create_dataset,
        db.into_inner(),
        clickhouse.into_inner().as_ref().clone(),
    )
    .await?;

    Ok(create_datapoints_response(outcome))
}

/// Map a [`CreateDatapointsOutcome`] to its HTTP response. Shared with the CLI
/// handler so both surfaces shape identical responses.
pub(crate) fn create_datapoints_response(outcome: CreateDatapointsOutcome) -> HttpResponse {
    match outcome {
        CreateDatapointsOutcome::Created {
            dataset_id,
            datapoints,
            dataset_was_created,
        } => {
            let datapoint_info = datapoints
                .iter()
                .map(|dp| {
                    serde_json::json!({
                        "id": dp.id,
                        "createdAt": dp.created_at,
                    })
                })
                .collect::<Vec<_>>();
            let mut response = if dataset_was_created {
                HttpResponse::Created()
            } else {
                HttpResponse::Ok()
            };
            response.json(serde_json::json!({
                "message": "Datapoints created successfully",
                "datasetId": dataset_id,
                "count": datapoints.len(),
                "datapointInfo": datapoint_info,
            }))
        }
        CreateDatapointsOutcome::NoDatapoints => HttpResponse::BadRequest().json(serde_json::json!({
            "error": "No datapoints provided"
        })),
        CreateDatapointsOutcome::DatasetNameConflict => {
            HttpResponse::Conflict().json(serde_json::json!({
                "error": "Dataset with this name already exists"
            }))
        }
        CreateDatapointsOutcome::NameRequiredForCreate => {
            HttpResponse::BadRequest().json(serde_json::json!({
                "error": "When creating a new dataset, the name must be provided"
            }))
        }
        CreateDatapointsOutcome::DatasetNotFound => HttpResponse::NotFound().json(serde_json::json!({
            "error": "Dataset not found"
        })),
    }
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
