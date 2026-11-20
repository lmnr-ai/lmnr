use std::sync::Arc;

use actix_web::{
    get, post, put,
    web::{self, Json},
};

use crate::{
    api::v1::datasets_v2::{
        DatasetPath, MissingVersionsRequest, VersionPath, handle_download_version,
        handle_missing_versions, handle_upload_version, handle_upload_version_index,
    },
    auth::cli_user::CliProjectAuth,
    db::DB,
    routes::types::ResponseResult,
    storage::Storage,
};

// CLI user-token twins of every `/v1/eval-datasets` route; only the auth
// extractor (`CliProjectAuth`) differs.

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
