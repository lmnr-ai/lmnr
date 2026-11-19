use std::{collections::HashSet, sync::Arc};

use actix_web::{
    HttpRequest, HttpResponse, get,
    http::StatusCode,
    post, put,
    web::{self, Json},
};
use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::json;
use tokio::sync::mpsc;
use uuid::Uuid;

use super::payload::{self, IndexError, MAX_ARCHIVE_BYTES, body_error_response, forward_payload};
use crate::{
    audit,
    db::{self, DB, eval_datasets::TaskHash, project_api_keys::ProjectApiKey},
    env,
    eval_datasets::{
        self, PushEntry, PushOutcome, PushRejection, VersionRef, is_dataset_name, is_task_name,
        is_version_hash,
    },
    features::{Feature, is_feature_enabled},
    routes::types::ResponseResult,
    storage::{Storage, StorageTrait},
};

/// Entries per `versions/missing` or `push` request.
const MAX_ENTRIES: usize = 10_000;

#[derive(Deserialize)]
pub struct MissingVersionsRequest {
    versions: Vec<TaskHash>,
}

#[derive(Deserialize)]
pub struct PushRequest {
    tasks: Vec<PushEntry>,
}

/// `{id, createdAt, tasks: [{id, hash, createdAt}]}`: each task's latest version.
#[get("/eval-datasets/{dataset}")]
pub async fn get_dataset(
    path: web::Path<String>,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
) -> ResponseResult {
    handle_get_dataset(&project_api_key.project_id, &path, &db).await
}

/// `{versions: [{task, hash}]}` → `{missing}`: the versions still to upload.
#[post("/eval-datasets/{dataset}/versions/missing")]
pub async fn missing_versions(
    path: web::Path<String>,
    body: Json<MissingVersionsRequest>,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
) -> ResponseResult {
    handle_missing_versions(&project_api_key.project_id, &path, body.into_inner(), &db).await
}

/// Body: the version's archive (`.tar.gz`), streamed to S3. Postgres learns
/// about the version only once its index arrives.
#[put("/eval-datasets/{dataset}/tasks/{task}/versions/{hash}")]
pub async fn upload_version(
    path: web::Path<VersionRef>,
    payload: web::Payload,
    project_api_key: ProjectApiKey,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_upload_version(&project_api_key.project_id, &path, payload, &storage).await
}

/// Body: the archive's file index. Makes the version its task's latest.
#[put("/eval-datasets/{dataset}/tasks/{task}/versions/{hash}/index")]
pub async fn upload_version_index(
    path: web::Path<VersionRef>,
    payload: web::Payload,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_upload_version_index(&project_api_key.project_id, &path, payload, &db, &storage).await
}

#[get("/eval-datasets/{dataset}/tasks/{task}/versions/{hash}")]
pub async fn download_version(
    path: web::Path<VersionRef>,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_download_version(&project_api_key.project_id, &path, &db, &storage).await
}

/// `{tasks: [{task, hash, base}]}` → `{tasks: [{id, hash, createdAt}]}`; `409`
/// with `versions_missing` or `moved` and nothing written otherwise.
#[post("/eval-datasets/{dataset}/push")]
pub async fn push(
    req: HttpRequest,
    path: web::Path<String>,
    body: Json<PushRequest>,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
) -> ResponseResult {
    handle_push(
        &req,
        &project_api_key.project_id,
        &path,
        body.into_inner(),
        &db,
    )
    .await
}

// Shared by the project-API-key routes above and their CLI twins
// (`api::v1::cli::eval_datasets`).

pub async fn handle_get_dataset(project_id: &Uuid, dataset: &str, db: &DB) -> ResponseResult {
    if storage_bucket().is_none() {
        return Ok(storage_not_configured());
    }
    if let Some(invalid) = check_dataset(dataset) {
        return Ok(invalid);
    }
    let Some(found) = db::eval_datasets::get_dataset(&db.pool, project_id, dataset).await? else {
        return Ok(error_response(
            StatusCode::NOT_FOUND,
            "dataset_not_found",
            format!("Dataset {dataset:?} not found"),
        ));
    };
    let tasks = db::eval_datasets::get_latest_versions(&db.pool, project_id, dataset).await?;
    Ok(HttpResponse::Ok().json(json!({
        "id": found.id,
        "createdAt": found.created_at,
        "tasks": tasks,
    })))
}

pub async fn handle_missing_versions(
    project_id: &Uuid,
    dataset: &str,
    req: MissingVersionsRequest,
    db: &DB,
) -> ResponseResult {
    if storage_bucket().is_none() {
        return Ok(storage_not_configured());
    }
    if let Some(invalid) = check_dataset(dataset) {
        return Ok(invalid);
    }
    if req.versions.len() > MAX_ENTRIES {
        return Ok(too_many_entries());
    }
    if let Some(invalid) = req
        .versions
        .iter()
        .find_map(|v| check_task_hash(&v.task, &v.hash))
    {
        return Ok(invalid);
    }
    let existing =
        db::eval_datasets::get_existing_versions(&db.pool, project_id, dataset, &req.versions)
            .await?;
    let existing: HashSet<&TaskHash> = existing.iter().collect();
    let missing: Vec<&TaskHash> = req
        .versions
        .iter()
        .filter(|v| !existing.contains(v))
        .collect();
    Ok(HttpResponse::Ok().json(json!({ "missing": missing })))
}

pub async fn handle_upload_version(
    project_id: &Uuid,
    version: &VersionRef,
    payload: web::Payload,
    storage: &Storage,
) -> ResponseResult {
    let Some(bucket) = storage_bucket() else {
        return Ok(storage_not_configured());
    };
    if let Some(invalid) = check_version(version) {
        return Ok(invalid);
    }
    let key = eval_datasets::archive_key(project_id, version);
    // `web::Payload` isn't `Send`, so it's pumped through a channel the upload reads.
    let (tx, rx) = mpsc::channel(4);
    let (received, stored) = futures_util::join!(
        forward_payload(payload, tx, MAX_ARCHIVE_BYTES),
        storage.upload_stream(&bucket, &key, rx)
    );
    if let Err(e) = received {
        return Ok(body_error_response(e));
    }
    Ok(match stored {
        Ok(_) => HttpResponse::NoContent().finish(),
        Err(e) => upstream_error("archive upload", e),
    })
}

pub async fn handle_upload_version_index(
    project_id: &Uuid,
    version: &VersionRef,
    payload: web::Payload,
    db: &DB,
    storage: &Storage,
) -> ResponseResult {
    let Some(bucket) = storage_bucket() else {
        return Ok(storage_not_configured());
    };
    if let Some(invalid) = check_version(version) {
        return Ok(invalid);
    }
    let stored = payload::store_index(
        storage,
        &bucket,
        &eval_datasets::archive_key(project_id, version),
        &eval_datasets::index_key(project_id, version),
        payload,
    )
    .await;
    let response = match stored {
        Ok(()) => {
            db::eval_datasets::upsert_version(&db.pool, project_id, version).await?;
            HttpResponse::NoContent().finish()
        }
        Err(IndexError::Body(e)) => body_error_response(e),
        Err(IndexError::Invalid(e)) => error_response(
            StatusCode::BAD_REQUEST,
            "invalid_index",
            format!("Invalid archive index: {e}"),
        ),
        Err(IndexError::ArchiveMissing) => error_response(
            StatusCode::NOT_FOUND,
            "archive_not_found",
            "Upload the version's archive before its index",
        ),
        Err(IndexError::Upstream(operation, e)) => upstream_error(operation, e),
    };
    Ok(response)
}

pub async fn handle_download_version(
    project_id: &Uuid,
    version: &VersionRef,
    db: &DB,
    storage: &Storage,
) -> ResponseResult {
    let Some(bucket) = storage_bucket() else {
        return Ok(storage_not_configured());
    };
    if let Some(invalid) = check_version(version) {
        return Ok(invalid);
    }
    if !db::eval_datasets::version_exists(&db.pool, project_id, version).await? {
        return Ok(version_not_found());
    }
    let key = eval_datasets::archive_key(project_id, version);
    let stream = match storage.exists(&bucket, &key).await {
        Ok(true) => storage.get_stream(&bucket, &key).await,
        Ok(false) => {
            log::warn!("Eval dataset archive {key} is missing from S3");
            return Ok(version_not_found());
        }
        Err(e) => Err(e),
    };
    Ok(match stream {
        Ok(stream) => HttpResponse::Ok()
            .content_type("application/gzip")
            .streaming(stream.map(Ok::<_, actix_web::Error>)),
        Err(e) => upstream_error("archive download", e),
    })
}

pub async fn handle_push(
    http_req: &HttpRequest,
    project_id: &Uuid,
    dataset: &str,
    req: PushRequest,
    db: &DB,
) -> ResponseResult {
    if storage_bucket().is_none() {
        return Ok(storage_not_configured());
    }
    if let Some(invalid) = check_dataset(dataset) {
        return Ok(invalid);
    }
    audit::target_named(http_req, dataset, dataset.to_string());
    if req.tasks.is_empty() {
        return Ok(error_response(
            StatusCode::BAD_REQUEST,
            "invalid_request",
            "tasks must not be empty",
        ));
    }
    if req.tasks.len() > MAX_ENTRIES {
        return Ok(too_many_entries());
    }
    if let Some(invalid) = req.tasks.iter().find_map(check_push_entry) {
        return Ok(invalid);
    }
    let mut seen = HashSet::new();
    if let Some(duplicate) = req.tasks.iter().find(|e| !seen.insert(e.task.as_str())) {
        return Ok(error_response(
            StatusCode::BAD_REQUEST,
            "invalid_request",
            format!("Task {:?} is listed more than once", duplicate.task),
        ));
    }

    let response = match eval_datasets::push(db, project_id, dataset, &req.tasks).await? {
        PushOutcome::Pushed(tasks) => HttpResponse::Ok().json(json!({ "tasks": tasks })),
        PushOutcome::Rejected(PushRejection::VersionsMissing(missing)) => {
            HttpResponse::Conflict().json(json!({
                "error": "Upload these task versions before pushing them",
                "code": "versions_missing",
                "missing": missing,
            }))
        }
        PushOutcome::Rejected(PushRejection::Moved(moved)) => HttpResponse::Conflict().json(json!({
            "error": "These tasks changed in Laminar since they were pulled; pull, then push again",
            "code": "moved",
            "moved": moved,
        })),
    };
    Ok(response)
}

/// `S3_EXPORTS_BUCKET`, when storage is configured. Eval datasets need nothing else
/// (no hosted evals, no sandbox provider).
fn storage_bucket() -> Option<String> {
    if !is_feature_enabled(Feature::Storage) {
        return None;
    }
    env::optional_string(env::storage::S3_EXPORTS_BUCKET)
}

fn check_dataset(dataset: &str) -> Option<HttpResponse> {
    (!is_dataset_name(dataset)).then(|| {
        error_response(
            StatusCode::BAD_REQUEST,
            "invalid_name",
            format!(
                "Invalid dataset name {dataset:?}: use letters, digits, '.', '_' and '-', \
                 starting with a letter or digit, at most {} bytes",
                eval_datasets::MAX_DATASET_NAME_BYTES
            ),
        )
    })
}

fn check_task_hash(task: &str, hash: &str) -> Option<HttpResponse> {
    if !is_task_name(task) {
        return Some(error_response(
            StatusCode::BAD_REQUEST,
            "invalid_name",
            format!(
                "Invalid task name {task:?}: use letters, digits, '.', '_' and '-', \
                 starting with a letter or digit, at most {} bytes",
                eval_datasets::MAX_TASK_NAME_BYTES
            ),
        ));
    }
    check_hash(hash)
}

fn check_hash(hash: &str) -> Option<HttpResponse> {
    (!is_version_hash(hash)).then(|| {
        error_response(
            StatusCode::BAD_REQUEST,
            "invalid_hash",
            format!("Invalid task version hash {hash:?}: expected 64 lowercase hex characters"),
        )
    })
}

fn check_version(version: &VersionRef) -> Option<HttpResponse> {
    check_dataset(&version.dataset).or_else(|| check_task_hash(&version.task, &version.hash))
}

fn check_push_entry(entry: &PushEntry) -> Option<HttpResponse> {
    check_task_hash(&entry.task, &entry.hash).or_else(|| entry.base.as_deref().and_then(check_hash))
}

fn error_response(status: StatusCode, code: &str, error: impl Into<String>) -> HttpResponse {
    HttpResponse::build(status).json(json!({ "error": error.into(), "code": code }))
}

fn storage_not_configured() -> HttpResponse {
    error_response(
        StatusCode::NOT_IMPLEMENTED,
        "storage_not_configured",
        "Eval datasets need S3 storage, which this deployment doesn't configure",
    )
}

fn version_not_found() -> HttpResponse {
    error_response(
        StatusCode::NOT_FOUND,
        "version_not_found",
        "Task version not found",
    )
}

fn too_many_entries() -> HttpResponse {
    error_response(
        StatusCode::BAD_REQUEST,
        "invalid_request",
        format!("At most {MAX_ENTRIES} entries per request"),
    )
}

fn upstream_error(operation: &str, error: anyhow::Error) -> HttpResponse {
    payload::upstream_error("Eval dataset", operation, error)
}
