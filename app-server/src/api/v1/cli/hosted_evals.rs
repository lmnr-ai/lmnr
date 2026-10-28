use std::sync::Arc;

use actix_web::{
    post,
    web::{self, Json},
};

use crate::{
    api::v1::hosted_evals::{StartRunRequest, handle_create_upload, handle_start_run},
    auth::cli_user::CliProjectAuth,
    db::DB,
    routes::types::ResponseResult,
    storage::Storage,
};

// CLI user-token twins of the `/v1/hosted-evals` handlers; only the auth
// extractor (`CliProjectAuth`) differs.

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
    req: Json<StartRunRequest>,
    db: web::Data<DB>,
    storage: web::Data<Arc<Storage>>,
    http_client: web::Data<reqwest::Client>,
) -> ResponseResult {
    handle_start_run(
        auth.project_id,
        req.into_inner(),
        &db,
        &storage,
        &http_client,
    )
    .await
}
