use std::sync::Arc;

use actix_web::{HttpResponse, delete, get, patch, post, web};

use crate::{
    api::v1::datasets::{
        CreateDatapointsRequest, DatasetNameRequest, GetDatapointsRequestParams,
        GetDatasetsRequest, create_datapoints_response,
    },
    auth::cli_user::CliProjectAuth,
    cache::Cache,
    datasets::service,
    db::{self, DB},
    query_engine::QueryEngine,
    routes::{PaginatedResponse, types::ResponseResult},
    sql::ClickhouseReadonlyClient,
};

// CLI user-token twins of the `/v1/datasets` handlers. Thin: same request types
// and the same `datasets::service` functions as the project-API-key handlers;
// only the auth extractor (`CliProjectAuth`) differs.

#[post("/datasets")]
pub async fn create_dataset(
    auth: CliProjectAuth,
    req: web::Json<DatasetNameRequest>,
    db: web::Data<DB>,
) -> actix_web::Result<HttpResponse> {
    let result = service::create_dataset(&db.pool, auth.project_id, req.into_inner().name).await;

    Ok(match result {
        Ok(dataset) => HttpResponse::Created().json(dataset),
        Err(error) => service::error_response(error),
    })
}

#[get("/datasets/{dataset_id}")]
pub async fn get_dataset(
    auth: CliProjectAuth,
    path: web::Path<uuid::Uuid>,
    db: web::Data<DB>,
) -> actix_web::Result<HttpResponse> {
    let result = service::get_dataset(&db.pool, auth.project_id, path.into_inner()).await;

    Ok(match result {
        Ok(dataset) => HttpResponse::Ok().json(dataset),
        Err(error) => service::error_response(error),
    })
}

#[patch("/datasets/{dataset_id}")]
pub async fn update_dataset(
    auth: CliProjectAuth,
    path: web::Path<uuid::Uuid>,
    req: web::Json<DatasetNameRequest>,
    db: web::Data<DB>,
) -> actix_web::Result<HttpResponse> {
    let result = service::update_dataset(
        &db.pool,
        auth.project_id,
        path.into_inner(),
        req.into_inner().name,
    )
    .await;

    Ok(match result {
        Ok(dataset) => HttpResponse::Ok().json(dataset),
        Err(error) => service::error_response(error),
    })
}

#[delete("/datasets/{dataset_id}")]
pub async fn delete_dataset(
    auth: CliProjectAuth,
    path: web::Path<uuid::Uuid>,
    db: web::Data<DB>,
    clickhouse: web::Data<clickhouse::Client>,
) -> actix_web::Result<HttpResponse> {
    let result = service::delete_dataset(
        &db.pool,
        clickhouse.get_ref(),
        auth.project_id,
        path.into_inner(),
    )
    .await;

    Ok(match result {
        Ok(dataset) => HttpResponse::Ok().json(dataset),
        Err(error) => service::error_response(error),
    })
}

/// `GET /v1/cli/datasets`
#[get("/datasets")]
pub async fn get_datasets(
    auth: CliProjectAuth,
    req: web::Query<GetDatasetsRequest>,
    db: web::Data<DB>,
) -> ResponseResult {
    let db = db.into_inner();
    let request = req.into_inner();
    let datasets =
        db::datasets::get_datasets(&db.pool, auth.project_id, request.id, request.name).await?;

    Ok(HttpResponse::Ok().json(datasets))
}

/// `GET /v1/cli/datasets/datapoints`
#[get("/datasets/datapoints")]
pub async fn get_datapoints(
    auth: CliProjectAuth,
    params: web::Query<GetDatapointsRequestParams>,
    db: web::Data<DB>,
    clickhouse_ro: web::Data<Option<Arc<ClickhouseReadonlyClient>>>,
    query_engine: web::Data<Arc<QueryEngine>>,
    http_client: web::Data<reqwest::Client>,
    cache: web::Data<Cache>,
) -> ResponseResult {
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
        auth.project_id,
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

/// `POST /v1/cli/datasets/datapoints`
#[post("/datasets/datapoints")]
pub async fn create_datapoints(
    auth: CliProjectAuth,
    req: web::Json<CreateDatapointsRequest>,
    db: web::Data<DB>,
    clickhouse: web::Data<clickhouse::Client>,
) -> ResponseResult {
    let request = req.into_inner();

    let outcome = service::create_datapoints(
        auth.project_id,
        request.dataset,
        request.datapoints,
        request.create_dataset,
        db.into_inner(),
        clickhouse.into_inner().as_ref().clone(),
    )
    .await?;

    Ok(create_datapoints_response(outcome))
}
