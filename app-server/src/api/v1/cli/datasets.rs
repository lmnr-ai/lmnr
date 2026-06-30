use std::sync::Arc;

use actix_web::{HttpResponse, get, post, web};

use crate::{
    api::v1::datasets::{
        CreateDatapointsRequest, GetDatapointsRequestParams, GetDatasetsRequest,
        create_datapoints_response,
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
