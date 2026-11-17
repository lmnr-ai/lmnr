use std::sync::Arc;

use actix_web::{
    HttpRequest, get, post, put,
    web::{self, Json},
};
use uuid::Uuid;

use crate::{
    api::v1::{
        hosted_evals::{
            CreateImageRequest, HostedEvalsData, LayersRequest, LogsFrom, handle_create_image,
            handle_get_run_logs, handle_get_sandbox, handle_missing_layers, handle_start_run,
            handle_upload_layer,
        },
        task_sets::{
            BlobPart, CreateTaskSetVersionRequest, LatestScriptsQuery, TaskSetPath,
            handle_create_task_set_version, handle_get_blob, handle_latest_scripts,
            handle_list_task_set_versions, handle_list_task_sets, handle_put_blob,
            handle_put_blob_index,
        },
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

#[put("/hosted-evals/uploads/blobs/{hash}")]
pub async fn put_blob(
    path: web::Path<String>,
    auth: CliProjectAuth,
    payload: web::Payload,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_put_blob(auth.project_id, &path, payload, &storage).await
}

#[put("/hosted-evals/uploads/blobs/{hash}/index")]
pub async fn put_blob_index(
    path: web::Path<String>,
    auth: CliProjectAuth,
    payload: web::Payload,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_put_blob_index(auth.project_id, &path, payload, &storage).await
}

#[get("/hosted-evals/uploads/blobs/{hash}")]
pub async fn get_blob(
    path: web::Path<String>,
    auth: CliProjectAuth,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_get_blob(auth.project_id, &path, BlobPart::Archive, &storage).await
}

#[get("/hosted-evals/uploads/blobs/{hash}/index")]
pub async fn get_blob_index(
    path: web::Path<String>,
    auth: CliProjectAuth,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_get_blob(auth.project_id, &path, BlobPart::Index, &storage).await
}

#[get("/hosted-evals/task-sets")]
pub async fn list_task_sets(auth: CliProjectAuth, db: web::Data<DB>) -> ResponseResult {
    handle_list_task_sets(auth.project_id, &db).await
}

#[get("/hosted-evals/task-sets/{task_set}/versions")]
pub async fn list_task_set_versions(
    path: web::Path<TaskSetPath>,
    auth: CliProjectAuth,
    db: web::Data<DB>,
) -> ResponseResult {
    handle_list_task_set_versions(auth.project_id, &path, &db).await
}

#[post("/hosted-evals/task-sets/{task_set}/versions")]
pub async fn create_task_set_version(
    path: web::Path<TaskSetPath>,
    body: Json<CreateTaskSetVersionRequest>,
    auth: CliProjectAuth,
    db: web::Data<DB>,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_create_task_set_version(auth.project_id, &path, body.into_inner(), &db, &storage).await
}

#[get("/hosted-evals/scripts/latest")]
pub async fn latest_scripts(
    query: web::Query<LatestScriptsQuery>,
    auth: CliProjectAuth,
    db: web::Data<DB>,
) -> ResponseResult {
    handle_latest_scripts(auth.project_id, &query, &db).await
}

#[post("/hosted-evals/runs")]
pub async fn start_run(
    req: HttpRequest,
    auth: CliProjectAuth,
    body: Json<RunRequest>,
    hosted: HostedEvalsData,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
) -> ResponseResult {
    handle_start_run(
        &req,
        auth.project_id,
        body.into_inner(),
        &hosted,
        &db,
        &cache,
    )
    .await
}

/// The run's log, followed by `lmnr-cli eval run --remote`.
#[get("/hosted-evals/runs/{run_id}/logs")]
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
