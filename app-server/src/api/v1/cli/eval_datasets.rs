use std::sync::Arc;

use actix_web::{HttpRequest, get, post, put, web};

use crate::{
    api::v1::eval_datasets::{
        DatasetPath, TaskVersionPath, handle_download_task_version, handle_list_datasets,
        handle_list_tasks, handle_missing_tasks, handle_push_tasks, handle_upload_task_version,
        handle_upload_task_version_index,
    },
    auth::cli_user::CliProjectAuth,
    db::DB,
    routes::types::ResponseResult,
    storage::Storage,
};

// CLI user-token twins of the `/v1` eval dataset routes; only the auth extractor differs.

#[get("/eval-datasets")]
pub async fn list_datasets(auth: CliProjectAuth, db: web::Data<DB>) -> ResponseResult {
    handle_list_datasets(auth.project_id, &db).await
}

#[get("/eval-datasets/{dataset}/tasks")]
pub async fn list_tasks(
    path: web::Path<DatasetPath>,
    auth: CliProjectAuth,
    db: web::Data<DB>,
) -> ResponseResult {
    handle_list_tasks(auth.project_id, &path.dataset, &db).await
}

#[post("/eval-datasets/{dataset}/tasks/missing")]
pub async fn missing_tasks(
    path: web::Path<DatasetPath>,
    auth: CliProjectAuth,
    payload: web::Payload,
    db: web::Data<DB>,
) -> ResponseResult {
    handle_missing_tasks(auth.project_id, &path.dataset, payload, &db).await
}

#[post("/eval-datasets/{dataset}/tasks")]
pub async fn push_tasks(
    req: HttpRequest,
    path: web::Path<DatasetPath>,
    auth: CliProjectAuth,
    payload: web::Payload,
    db: web::Data<DB>,
) -> ResponseResult {
    handle_push_tasks(&req, auth.project_id, &path.dataset, payload, &db).await
}

#[put("/eval-datasets/{dataset}/tasks/{task}/versions/{hash}")]
pub async fn upload_task_version(
    path: web::Path<TaskVersionPath>,
    auth: CliProjectAuth,
    payload: web::Payload,
    db: web::Data<DB>,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_upload_task_version(auth.project_id, &path, payload, &db, &storage).await
}

#[put("/eval-datasets/{dataset}/tasks/{task}/versions/{hash}/index")]
pub async fn upload_task_version_index(
    path: web::Path<TaskVersionPath>,
    auth: CliProjectAuth,
    payload: web::Payload,
    db: web::Data<DB>,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_upload_task_version_index(auth.project_id, &path, payload, &db, &storage).await
}

#[get("/eval-datasets/{dataset}/tasks/{task}/versions/{hash}")]
pub async fn download_task_version(
    path: web::Path<TaskVersionPath>,
    auth: CliProjectAuth,
    db: web::Data<DB>,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_download_task_version(auth.project_id, &path, &db, &storage).await
}
