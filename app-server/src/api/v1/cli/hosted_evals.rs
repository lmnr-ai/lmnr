use std::sync::Arc;

use actix_web::{
    HttpRequest, get, post, put,
    web::{self, Json},
};
use uuid::Uuid;

use crate::{
    api::v1::hosted_evals::{
        CreateImageRequest, HostedEvalsData, LayersRequest, LogsFrom, handle_create_image,
        handle_create_upload, handle_get_run_logs, handle_get_sandbox, handle_missing_layers,
        handle_start_run, handle_upload_index, handle_upload_layer,
    },
    auth::cli_user::CliProjectAuth,
    cache::Cache,
    db::DB,
    hosted_evals::RunRequest,
    routes::types::ResponseResult,
    storage::Storage,
};

// CLI user-token twins of the `/v1/hosted-evals` routes the CLI itself calls;
// only the auth extractor (`CliProjectAuth`) differs. The other sandbox routes
// are key-only: Harbor's environment class authenticates with a project key.

#[post("/hosted-evals/images/layers/missing")]
pub async fn missing_layers(
    auth: CliProjectAuth,
    req: Json<LayersRequest>,
    hosted: HostedEvalsData,
    cache: web::Data<Cache>,
) -> ResponseResult {
    handle_missing_layers(auth.project_id, req.into_inner(), &hosted, &cache).await
}

#[put("/hosted-evals/images/layers/{diff_id}")]
pub async fn upload_layer(
    path: web::Path<String>,
    auth: CliProjectAuth,
    payload: web::Payload,
    hosted: HostedEvalsData,
    cache: web::Data<Cache>,
) -> ResponseResult {
    handle_upload_layer(auth.project_id, &path, payload, &hosted, &cache).await
}

#[post("/hosted-evals/images")]
pub async fn create_image(
    auth: CliProjectAuth,
    req: Json<CreateImageRequest>,
    hosted: HostedEvalsData,
    cache: web::Data<Cache>,
) -> ResponseResult {
    handle_create_image(auth.project_id, req.into_inner(), &hosted, &cache).await
}

#[post("/hosted-evals/uploads")]
pub async fn create_upload(
    auth: CliProjectAuth,
    payload: web::Payload,
    hosted: HostedEvalsData,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_create_upload(auth.project_id, payload, &hosted, &storage).await
}

#[put("/hosted-evals/uploads/{upload_id}/index")]
pub async fn upload_index(
    path: web::Path<Uuid>,
    auth: CliProjectAuth,
    payload: web::Payload,
    hosted: HostedEvalsData,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_upload_index(auth.project_id, &path, payload, &hosted, &storage).await
}

#[post("/hosted-evals/runs")]
pub async fn start_run(
    req: HttpRequest,
    auth: CliProjectAuth,
    body: Json<RunRequest>,
    hosted: HostedEvalsData,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_start_run(
        &req,
        auth.project_id,
        body.into_inner(),
        &hosted,
        &db,
        &cache,
        &storage,
    )
    .await
}

/// The run's log, followed by `lmnr-cli eval run --remote`.
#[get("/hosted-evals/runs/{upload_id}/logs")]
pub async fn get_run_logs(
    path: web::Path<Uuid>,
    query: web::Query<LogsFrom>,
    auth: CliProjectAuth,
    hosted: HostedEvalsData,
    clickhouse: web::Data<clickhouse::Client>,
) -> ResponseResult {
    handle_get_run_logs(&auth.project_id, &path, query.from, &hosted, &clickhouse).await
}

/// The run's orchestrator, which the CLI checks on while following its log.
#[get("/hosted-evals/sandboxes/{sandbox_id}")]
pub async fn get_sandbox(
    path: web::Path<String>,
    auth: CliProjectAuth,
    hosted: HostedEvalsData,
    cache: web::Data<Cache>,
) -> ResponseResult {
    handle_get_sandbox(&auth.project_id, &path, &hosted, &cache).await
}
