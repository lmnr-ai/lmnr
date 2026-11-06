use std::sync::Arc;

use actix_web::{HttpRequest, HttpResponse, delete, get, patch, post, web};
use futures_util::StreamExt;
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    audit,
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
pub(crate) struct DatasetNameRequest {
    pub name: String,
}

#[post("/datasets")]
pub async fn create_dataset(
    req: HttpRequest,
    db: web::Data<DB>,
    project_api_key: ProjectApiKey,
    body: web::Json<DatasetNameRequest>,
) -> actix_web::Result<HttpResponse> {
    Ok(handlers::create(&req, &db, project_api_key.project_id, body.into_inner()).await)
}

#[get("/datasets/{dataset_id}")]
pub async fn get_dataset(
    db: web::Data<DB>,
    project_api_key: ProjectApiKey,
    path: web::Path<Uuid>,
) -> actix_web::Result<HttpResponse> {
    Ok(handlers::get(&db, project_api_key.project_id, path.into_inner()).await)
}

#[patch("/datasets/{dataset_id}")]
pub async fn update_dataset(
    req: HttpRequest,
    db: web::Data<DB>,
    project_api_key: ProjectApiKey,
    path: web::Path<Uuid>,
    body: web::Json<DatasetNameRequest>,
) -> actix_web::Result<HttpResponse> {
    Ok(handlers::update(
        &req,
        &db,
        project_api_key.project_id,
        path.into_inner(),
        body.into_inner(),
    )
    .await)
}

#[delete("/datasets/{dataset_id}")]
pub async fn delete_dataset(
    req: HttpRequest,
    db: web::Data<DB>,
    clickhouse: web::Data<clickhouse::Client>,
    project_api_key: ProjectApiKey,
    path: web::Path<Uuid>,
) -> actix_web::Result<HttpResponse> {
    Ok(handlers::delete(
        &req,
        &db,
        &clickhouse,
        project_api_key.project_id,
        path.into_inner(),
    )
    .await)
}

/// Auth-agnostic CRUD handlers shared by the project-key and CLI routes.
pub mod handlers {
    use actix_web::{HttpRequest, HttpResponse};
    use uuid::Uuid;

    use super::DatasetNameRequest;
    use crate::{audit, datasets::service, db::DB};

    pub async fn create(
        req: &HttpRequest,
        db: &DB,
        project_id: Uuid,
        input: DatasetNameRequest,
    ) -> HttpResponse {
        match service::create_dataset(&db.pool, project_id, input.name).await {
            Ok(dataset) => {
                audit::target_named(req, dataset.id, dataset.name.clone());
                HttpResponse::Created().json(dataset)
            }
            Err(error) => service::error_response(error),
        }
    }

    pub async fn get(db: &DB, project_id: Uuid, dataset_id: Uuid) -> HttpResponse {
        match service::get_dataset(&db.pool, project_id, dataset_id).await {
            Ok(dataset) => HttpResponse::Ok().json(dataset),
            Err(error) => service::error_response(error),
        }
    }

    pub async fn update(
        req: &HttpRequest,
        db: &DB,
        project_id: Uuid,
        dataset_id: Uuid,
        input: DatasetNameRequest,
    ) -> HttpResponse {
        match service::update_dataset(&db.pool, project_id, dataset_id, input.name).await {
            Ok(dataset) => {
                audit::target_named(req, dataset.id, dataset.name.clone());
                HttpResponse::Ok().json(dataset)
            }
            Err(error) => service::error_response(error),
        }
    }

    pub async fn delete(
        req: &HttpRequest,
        db: &DB,
        clickhouse: &clickhouse::Client,
        project_id: Uuid,
        dataset_id: Uuid,
    ) -> HttpResponse {
        audit::target(req, [dataset_id]).await;
        match service::delete_dataset(&db.pool, clickhouse, project_id, dataset_id).await {
            Ok(dataset) => HttpResponse::Ok().json(dataset),
            Err(error) => service::error_response(error),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GetDatasetsRequest {
    #[serde(default)]
    pub id: Option<Uuid>,
    #[serde(default)]
    pub name: Option<String>,
}

#[get("/datasets")]
pub async fn get_datasets(
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
pub async fn get_datapoints(
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
    if query.limit <= 0 || query.limit > 1_000 || query.offset < 0 {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "limit must be between 1 and 1000 and offset must be non-negative"
        })));
    }

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
pub async fn create_datapoints(
    req: HttpRequest,
    body: web::Json<CreateDatapointsRequest>,
    db: web::Data<DB>,
    clickhouse: web::Data<clickhouse::Client>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let request = body.into_inner();

    let outcome = service::create_datapoints(
        project_id,
        request.dataset,
        request.datapoints,
        request.create_dataset,
        db.into_inner(),
        clickhouse.into_inner().as_ref().clone(),
    )
    .await?;

    target_datapoints(&req, &outcome).await;
    Ok(create_datapoints_response(outcome))
}

/// Shared with the CLI handler.
pub(crate) async fn target_datapoints(req: &HttpRequest, outcome: &CreateDatapointsOutcome) {
    if let CreateDatapointsOutcome::Created {
        dataset_id,
        datapoints,
        ..
    } = outcome
    {
        audit::target(req, datapoints.iter().map(|dp| dp.id)).await;
        audit::target_parent(req, "datasetId", dataset_id);
    }
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
                        "taskId": dp.task_id,
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
        CreateDatapointsOutcome::NoDatapoints => {
            HttpResponse::BadRequest().json(serde_json::json!({
                "error": "No datapoints provided"
            }))
        }
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
        CreateDatapointsOutcome::DatasetNotFound => {
            HttpResponse::NotFound().json(serde_json::json!({
                "error": "Dataset not found"
            }))
        }
    }
}

#[get("/datasets/{dataset_id}/parquets/{idx}")]
pub async fn get_parquet(
    req: HttpRequest,
    path: web::Path<(String, String)>,
    db: web::Data<DB>,
    storage: web::Data<Arc<Storage>>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let (dataset_id_str, name) = path.into_inner();
    let dataset_id =
        Uuid::parse_str(&dataset_id_str).map_err(|_| anyhow::anyhow!("Invalid dataset ID"))?;
    audit::target(&req, [dataset_id]).await;

    let project_id = project_api_key.project_id;
    let db = db.into_inner();

    let parquet_path =
        db::datasets::get_parquet_path(&db.pool, project_id, dataset_id, &name).await?;

    let Some(parquet_path) = parquet_path else {
        return Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "Parquet not found"
        })));
    };

    let Ok(bucket) = std::env::var(crate::env::storage::S3_EXPORTS_BUCKET) else {
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
