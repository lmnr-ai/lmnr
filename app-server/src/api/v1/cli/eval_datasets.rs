use std::sync::Arc;

use actix_web::{HttpRequest, get, post, put, web};

use crate::{
    api::v1::eval_datasets::{
        handle_create_version, handle_download_task, handle_get_version, handle_list_datasets,
        handle_missing_tasks, handle_upload_task, handle_upload_task_index,
    },
    auth::cli_user::CliProjectAuth,
    db::DB,
    routes::types::ResponseResult,
    storage::Storage,
};

// CLI user-token twins of the `/v1` eval dataset routes; only the auth
// extractor differs, and versions record the CLI user as their creator.

#[post("/eval-dataset-tasks/missing")]
pub async fn missing_tasks(
    auth: CliProjectAuth,
    payload: web::Payload,
    db: web::Data<DB>,
) -> ResponseResult {
    handle_missing_tasks(auth.project_id, payload, &db).await
}

#[put("/eval-dataset-tasks/{hash}")]
pub async fn upload_task(
    path: web::Path<String>,
    auth: CliProjectAuth,
    payload: web::Payload,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_upload_task(auth.project_id, &path, payload, &storage).await
}

#[put("/eval-dataset-tasks/{hash}/index")]
pub async fn upload_task_index(
    path: web::Path<String>,
    auth: CliProjectAuth,
    payload: web::Payload,
    db: web::Data<DB>,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_upload_task_index(auth.project_id, &path, payload, &db, &storage).await
}

#[get("/eval-dataset-tasks/{hash}")]
pub async fn download_task(
    path: web::Path<String>,
    auth: CliProjectAuth,
    db: web::Data<DB>,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_download_task(auth.project_id, &path, &db, &storage).await
}

#[get("/eval-datasets")]
pub async fn list_datasets(auth: CliProjectAuth, db: web::Data<DB>) -> ResponseResult {
    handle_list_datasets(auth.project_id, &db).await
}

#[get("/eval-datasets/{name}/versions/{version}")]
pub async fn get_version(
    path: web::Path<(String, String)>,
    auth: CliProjectAuth,
    db: web::Data<DB>,
) -> ResponseResult {
    let (name, version) = path.into_inner();
    handle_get_version(auth.project_id, &name, &version, &db).await
}

#[post("/eval-datasets/{name}/versions")]
pub async fn create_version(
    req: HttpRequest,
    path: web::Path<String>,
    auth: CliProjectAuth,
    payload: web::Payload,
    db: web::Data<DB>,
) -> ResponseResult {
    handle_create_version(
        &req,
        auth.project_id,
        Some(auth.user_id),
        &path,
        payload,
        &db,
    )
    .await
}
