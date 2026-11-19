use std::sync::Arc;

use actix_web::{
    HttpRequest, get, post, put,
    web::{self, Json},
};

use crate::{
    api::v1::eval_datasets::{
        DatasetPath, MissingVersionsRequest, PushRequest, VersionPath, handle_download_version,
        handle_get_dataset, handle_missing_versions, handle_push, handle_upload_version,
        handle_upload_version_index,
    },
    auth::cli_user::CliProjectAuth,
    db::DB,
    routes::types::ResponseResult,
    storage::Storage,
};

// CLI user-token twins of every `/v1/eval-datasets` route; only the auth
// extractor (`CliProjectAuth`) differs.

#[get("/eval-datasets/{org}/{name}")]
pub async fn get_dataset(
    path: web::Path<DatasetPath>,
    auth: CliProjectAuth,
    db: web::Data<DB>,
) -> ResponseResult {
    handle_get_dataset(&auth.project_id, &path.dataset(), &db).await
}

#[post("/eval-datasets/{org}/{name}/versions/missing")]
pub async fn missing_versions(
    path: web::Path<DatasetPath>,
    auth: CliProjectAuth,
    body: Json<MissingVersionsRequest>,
    db: web::Data<DB>,
) -> ResponseResult {
    handle_missing_versions(&auth.project_id, &path.dataset(), body.into_inner(), &db).await
}

#[put("/eval-datasets/{org}/{name}/tasks/{task_org}/{task_name}/versions/{hash}")]
pub async fn upload_version(
    path: web::Path<VersionPath>,
    auth: CliProjectAuth,
    payload: web::Payload,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_upload_version(&auth.project_id, &path.version(), payload, &storage).await
}

#[put("/eval-datasets/{org}/{name}/tasks/{task_org}/{task_name}/versions/{hash}/index")]
pub async fn upload_version_index(
    path: web::Path<VersionPath>,
    auth: CliProjectAuth,
    payload: web::Payload,
    db: web::Data<DB>,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_upload_version_index(&auth.project_id, &path.version(), payload, &db, &storage).await
}

#[get("/eval-datasets/{org}/{name}/tasks/{task_org}/{task_name}/versions/{hash}")]
pub async fn download_version(
    path: web::Path<VersionPath>,
    auth: CliProjectAuth,
    db: web::Data<DB>,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_download_version(&auth.project_id, &path.version(), &db, &storage).await
}

#[post("/eval-datasets/{org}/{name}/push")]
pub async fn push(
    req: HttpRequest,
    path: web::Path<DatasetPath>,
    auth: CliProjectAuth,
    body: Json<PushRequest>,
    db: web::Data<DB>,
) -> ResponseResult {
    handle_push(
        &req,
        &auth.project_id,
        &path.dataset(),
        body.into_inner(),
        &db,
    )
    .await
}
