use std::sync::Arc;

use actix_web::{
    post, put,
    web::{self, Json},
};

use crate::{
    api::v1::hosted_evals::{
        CreateImageRequest, HostedEvalsData, LayersRequest, handle_create_image,
        handle_create_upload, handle_missing_layers, handle_start_run, handle_upload_layer,
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

#[post("/hosted-evals/runs")]
pub async fn start_run(
    auth: CliProjectAuth,
    req: Json<RunRequest>,
    hosted: HostedEvalsData,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_start_run(
        auth.project_id,
        req.into_inner(),
        &hosted,
        &db,
        &cache,
        &storage,
    )
    .await
}
