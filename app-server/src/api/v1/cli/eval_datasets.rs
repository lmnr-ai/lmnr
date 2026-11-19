use std::sync::Arc;

use actix_web::{
    HttpRequest, get, post, put,
    web::{self, Json},
};

use crate::{
    api::v1::eval_datasets::{
        MissingVersionsRequest, PushRequest, handle_download_version, handle_get_dataset,
        handle_missing_versions, handle_push, handle_upload_version, handle_upload_version_index,
    },
    auth::cli_user::CliProjectAuth,
    db::DB,
    eval_datasets::VersionRef,
    routes::types::ResponseResult,
    storage::Storage,
};

// CLI user-token twins of every `/v1/eval-datasets` route; only the auth
// extractor (`CliProjectAuth`) differs.

#[get("/eval-datasets/{dataset}")]
pub async fn get_dataset(
    path: web::Path<String>,
    auth: CliProjectAuth,
    db: web::Data<DB>,
) -> ResponseResult {
    handle_get_dataset(&auth.project_id, &path, &db).await
}

#[post("/eval-datasets/{dataset}/versions/missing")]
pub async fn missing_versions(
    path: web::Path<String>,
    auth: CliProjectAuth,
    body: Json<MissingVersionsRequest>,
    db: web::Data<DB>,
) -> ResponseResult {
    handle_missing_versions(&auth.project_id, &path, body.into_inner(), &db).await
}

#[put("/eval-datasets/{dataset}/tasks/{task}/versions/{hash}")]
pub async fn upload_version(
    path: web::Path<VersionRef>,
    auth: CliProjectAuth,
    payload: web::Payload,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_upload_version(&auth.project_id, &path, payload, &storage).await
}

#[put("/eval-datasets/{dataset}/tasks/{task}/versions/{hash}/index")]
pub async fn upload_version_index(
    path: web::Path<VersionRef>,
    auth: CliProjectAuth,
    payload: web::Payload,
    db: web::Data<DB>,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_upload_version_index(&auth.project_id, &path, payload, &db, &storage).await
}

#[get("/eval-datasets/{dataset}/tasks/{task}/versions/{hash}")]
pub async fn download_version(
    path: web::Path<VersionRef>,
    auth: CliProjectAuth,
    db: web::Data<DB>,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_download_version(&auth.project_id, &path, &db, &storage).await
}

#[post("/eval-datasets/{dataset}/push")]
pub async fn push(
    req: HttpRequest,
    path: web::Path<String>,
    auth: CliProjectAuth,
    body: Json<PushRequest>,
    db: web::Data<DB>,
) -> ResponseResult {
    handle_push(&req, &auth.project_id, &path, body.into_inner(), &db).await
}
