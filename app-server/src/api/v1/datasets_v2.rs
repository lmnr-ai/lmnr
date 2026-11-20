use std::{collections::HashSet, sync::Arc};

use actix_web::{
    HttpResponse, get,
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
    datasets_v2::{self, VersionRef, is_dataset_name, is_task_name, is_version_hash},
    db::{self, DB, datasets_v2::TaskHash, project_api_keys::ProjectApiKey},
    env,
    features::{Feature, is_feature_enabled},
    routes::types::ResponseResult,
    storage::{Storage, StorageTrait},
};

/// Entries per `versions/missing` request.
const MAX_ENTRIES: usize = 10_000;

const NAME_RULE: &str = "expected org/name, each part letters, digits, '.', '_' and '-' \
                         starting with a letter or digit, without '..'";

#[derive(Deserialize)]
pub struct MissingVersionsRequest {
    versions: Vec<TaskHash>,
}

/// `{org}/{name}`: a dataset name takes two path segments, so no slash is ever encoded.
#[derive(Deserialize)]
pub struct DatasetPath {
    org: String,
    name: String,
}

impl DatasetPath {
    /// The full `org/name`, still to be validated.
    pub fn dataset(&self) -> String {
        format!("{}/{}", self.org, self.name)
    }
}

/// `{org}/{name}/tasks/{task_org}/{task_name}/versions/{hash}`.
#[derive(Deserialize)]
pub struct VersionPath {
    org: String,
    name: String,
    task_org: String,
    task_name: String,
    hash: String,
}

impl VersionPath {
    /// The full names, still to be validated.
    pub fn version(&self) -> VersionRef {
        VersionRef {
            dataset: format!("{}/{}", self.org, self.name),
            task: format!("{}/{}", self.task_org, self.task_name),
            hash: self.hash.clone(),
        }
    }
}

/// `{versions: [{task, hash}]}` → `{missing}`: the versions still to upload.
#[post("/eval-datasets/{org}/{name}/versions/missing")]
pub async fn missing_versions(
    path: web::Path<DatasetPath>,
    body: Json<MissingVersionsRequest>,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
) -> ResponseResult {
    handle_missing_versions(
        &project_api_key.project_id,
        &path.dataset(),
        body.into_inner(),
        &db,
    )
    .await
}

/// Body: the version's archive (`.tar.gz`), streamed to S3. Postgres learns
/// about the version only once its index arrives.
#[put("/eval-datasets/{org}/{name}/tasks/{task_org}/{task_name}/versions/{hash}")]
pub async fn upload_version(
    path: web::Path<VersionPath>,
    payload: web::Payload,
    project_api_key: ProjectApiKey,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_upload_version(
        &project_api_key.project_id,
        &path.version(),
        payload,
        &storage,
    )
    .await
}

/// Body: the archive's file index. Registers the version (and its dataset and
/// task); re-uploading a known version keeps its `created_at`.
#[put("/eval-datasets/{org}/{name}/tasks/{task_org}/{task_name}/versions/{hash}/index")]
pub async fn upload_version_index(
    path: web::Path<VersionPath>,
    payload: web::Payload,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_upload_version_index(
        &project_api_key.project_id,
        &path.version(),
        payload,
        &db,
        &storage,
    )
    .await
}

#[get("/eval-datasets/{org}/{name}/tasks/{task_org}/{task_name}/versions/{hash}")]
pub async fn download_version(
    path: web::Path<VersionPath>,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_download_version(&project_api_key.project_id, &path.version(), &db, &storage).await
}

// Shared by the project-API-key routes above and their CLI twins
// (`api::v1::cli::datasets_v2`).

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
        db::datasets_v2::get_existing_versions(&db.pool, project_id, dataset, &req.versions)
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
    let key = datasets_v2::archive_key(project_id, version);
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
        &datasets_v2::archive_key(project_id, version),
        &datasets_v2::index_key(project_id, version),
        payload,
    )
    .await;
    let response = match stored {
        Ok(()) => {
            db::datasets_v2::insert_version(&db.pool, project_id, version).await?;
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
    if !db::datasets_v2::version_exists(&db.pool, project_id, version).await? {
        return Ok(version_not_found());
    }
    let key = datasets_v2::archive_key(project_id, version);
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

/// The datasets bucket, when storage is configured. Eval datasets need nothing
/// else (no hosted evals, no sandbox provider).
fn storage_bucket() -> Option<String> {
    is_feature_enabled(Feature::Storage).then(|| env::storage::DATASETS_BUCKET.get())
}

fn check_dataset(dataset: &str) -> Option<HttpResponse> {
    (!is_dataset_name(dataset)).then(|| {
        error_response(
            StatusCode::BAD_REQUEST,
            "invalid_name",
            format!(
                "Invalid dataset name {dataset:?}: {NAME_RULE}, at most {} bytes",
                datasets_v2::MAX_DATASET_NAME_BYTES
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
                "Invalid task name {task:?}: {NAME_RULE}, at most {} bytes",
                datasets_v2::MAX_TASK_NAME_BYTES
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
