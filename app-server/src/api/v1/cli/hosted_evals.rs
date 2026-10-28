use std::sync::Arc;

use actix_web::{
    get, post, put,
    web::{self, Json},
};

use crate::{
    api::v1::hosted_evals::{
        handle_context_exists, handle_create_upload, handle_start_run, handle_upload_context,
    },
    auth::cli_user::CliProjectAuth,
    cache::Cache,
    db::DB,
    hosted_evals::RunRequest,
    routes::types::ResponseResult,
    storage::Storage,
};

// CLI user-token twins of the `/v1/hosted-evals` routes the CLI itself calls;
// only the auth extractor (`CliProjectAuth`) differs. The sandbox routes are
// key-only: Harbor's environment class authenticates with a project key.

#[get("/hosted-evals/contexts/{hash}")]
pub async fn context_exists(
    path: web::Path<String>,
    auth: CliProjectAuth,
    http_client: web::Data<reqwest::Client>,
) -> ResponseResult {
    handle_context_exists(auth.project_id, &path, &http_client).await
}

#[put("/hosted-evals/contexts/{hash}")]
pub async fn upload_context(
    path: web::Path<String>,
    auth: CliProjectAuth,
    payload: web::Payload,
    http_client: web::Data<reqwest::Client>,
) -> ResponseResult {
    handle_upload_context(auth.project_id, &path, payload, &http_client).await
}

#[post("/hosted-evals/uploads")]
pub async fn create_upload(
    auth: CliProjectAuth,
    payload: web::Payload,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_create_upload(auth.project_id, payload, &storage).await
}

#[post("/hosted-evals/runs")]
pub async fn start_run(
    auth: CliProjectAuth,
    req: Json<RunRequest>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
    storage: web::Data<Arc<Storage>>,
    http_client: web::Data<reqwest::Client>,
) -> ResponseResult {
    handle_start_run(
        auth.project_id,
        req.into_inner(),
        &db,
        &cache,
        &storage,
        &http_client,
    )
    .await
}
