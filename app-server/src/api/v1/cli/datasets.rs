use std::sync::Arc;

use actix_web::{get, post, web};

use crate::{
    api::v1::datasets::{
        CreateDatapointsRequest, GetDatapointsRequestParams, GetDatasetsRequest,
        run_create_datapoints, run_get_datapoints, run_get_datasets,
    },
    auth::cli_user::CliProjectAuth,
    cache::Cache,
    db::DB,
    query_engine::QueryEngine,
    routes::types::ResponseResult,
    sql::ClickhouseReadonlyClient,
};

/// `GET /v1/cli/datasets` — CLI twin of `/v1/datasets`.
#[get("/datasets")]
pub async fn get_datasets(
    auth: CliProjectAuth,
    req: web::Query<GetDatasetsRequest>,
    db: web::Data<DB>,
) -> ResponseResult {
    run_get_datasets(auth.project_id, req.into_inner(), db).await
}

/// `GET /v1/cli/datasets/datapoints` — CLI twin of `/v1/datasets/datapoints`.
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
    run_get_datapoints(
        auth.project_id,
        params.into_inner(),
        db,
        clickhouse_ro,
        query_engine,
        http_client,
        cache,
    )
    .await
}

/// `POST /v1/cli/datasets/datapoints` — CLI twin of `/v1/datasets/datapoints`.
#[post("/datasets/datapoints")]
pub async fn create_datapoints(
    auth: CliProjectAuth,
    req: web::Json<CreateDatapointsRequest>,
    db: web::Data<DB>,
    clickhouse: web::Data<clickhouse::Client>,
) -> ResponseResult {
    run_create_datapoints(auth.project_id, req.into_inner(), db, clickhouse).await
}
