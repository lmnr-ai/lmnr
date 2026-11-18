use std::{
    collections::{BTreeMap, HashSet},
    sync::Arc,
};

use actix_web::{HttpRequest, HttpResponse, get, post, put, web};
use chrono::{DateTime, Utc};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::json;
use uuid::Uuid;

use crate::{
    api::uploads::{
        self, IndexError, UploadError, body_error_response, collect_payload, invalid_index_response,
    },
    audit,
    db::{self, DB, project_api_keys::ProjectApiKey},
    eval_datasets::{
        self, CreateVersionError, MAX_DATASET_NAME_LEN, MAX_TASK_NAME_LEN, VersionRequest,
        VersionSelector,
    },
    routes::types::ResponseResult,
    storage::{Storage, StorageTrait},
};

// Streamed bodies aren't covered by the global HTTP payload limit, so each gets its own.
const MAX_TASK_ARCHIVE_BYTES: u64 = 512 * 1024 * 1024;
const MAX_INDEX_BYTES: u64 = 64 * 1024 * 1024;
/// JSON bodies are read raw (to answer `{error}` on bad JSON), so they get a cap too.
/// 100k tasks with 255-character names stay under it.
const MAX_JSON_BYTES: u64 = 64 * 1024 * 1024;
const MAX_MISSING_HASHES: usize = 10_000;
const MAX_VERSION_TASKS: usize = 100_000;

#[derive(Deserialize)]
pub struct MissingTasksRequest {
    hashes: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateVersionRequest {
    #[serde(default)]
    parent_version: Option<i32>,
    #[serde(default)]
    message: Option<String>,
    tasks: BTreeMap<String, String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DatasetSummary {
    id: Uuid,
    name: String,
    created_at: DateTime<Utc>,
    latest_version: Option<i32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DatasetVersion {
    dataset_id: Uuid,
    dataset: String,
    version: i32,
    parent_version: Option<i32>,
    message: Option<String>,
    created_at: DateTime<Utc>,
    tasks: BTreeMap<String, String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CreatedVersion {
    dataset_id: Uuid,
    dataset: String,
    version: i32,
    previous_latest: Option<i32>,
}

/// `{hashes}` → `{missing}`: the task hashes this project has no upload for.
#[post("/eval-dataset-tasks/missing")]
pub async fn missing_tasks(
    payload: web::Payload,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
) -> ResponseResult {
    handle_missing_tasks(project_api_key.project_id, payload, &db).await
}

/// Body: the task's `.tar.gz` (lmnr-cli `packFiles`), streamed to S3.
#[put("/eval-dataset-tasks/{hash}")]
pub async fn upload_task(
    path: web::Path<String>,
    payload: web::Payload,
    project_api_key: ProjectApiKey,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_upload_task(project_api_key.project_id, &path, payload, &storage).await
}

/// Body: the task archive's index. Completes the upload.
#[put("/eval-dataset-tasks/{hash}/index")]
pub async fn upload_task_index(
    path: web::Path<String>,
    payload: web::Payload,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_upload_task_index(project_api_key.project_id, &path, payload, &db, &storage).await
}

#[get("/eval-dataset-tasks/{hash}")]
pub async fn download_task(
    path: web::Path<String>,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_download_task(project_api_key.project_id, &path, &db, &storage).await
}

#[get("/eval-datasets")]
pub async fn list_datasets(project_api_key: ProjectApiKey, db: web::Data<DB>) -> ResponseResult {
    handle_list_datasets(project_api_key.project_id, &db).await
}

/// `{version}` is a number or `latest`.
#[get("/eval-datasets/{name}/versions/{version}")]
pub async fn get_version(
    path: web::Path<(String, String)>,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
) -> ResponseResult {
    let (name, version) = path.into_inner();
    handle_get_version(project_api_key.project_id, &name, &version, &db).await
}

/// `{parentVersion?, message?, tasks: {name: hash}}` → `201 {datasetId, dataset,
/// version, previousLatest}`. Creates the dataset on its first push.
#[post("/eval-datasets/{name}/versions")]
pub async fn create_version(
    req: HttpRequest,
    path: web::Path<String>,
    payload: web::Payload,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
) -> ResponseResult {
    handle_create_version(&req, project_api_key.project_id, None, &path, payload, &db).await
}

// ---- Shared by the project-API-key and CLI (`api::v1::cli::eval_datasets`) routes ----

pub async fn handle_missing_tasks(
    project_id: Uuid,
    payload: web::Payload,
    db: &DB,
) -> ResponseResult {
    if eval_datasets::bucket().is_none() {
        return Ok(storage_not_configured());
    }
    let req: MissingTasksRequest = match read_json(payload).await {
        Ok(req) => req,
        Err(response) => return Ok(response),
    };
    if req.hashes.len() > MAX_MISSING_HASHES {
        return Ok(bad_request(format!(
            "At most {MAX_MISSING_HASHES} hashes per request"
        )));
    }
    if let Some(bad) = req.hashes.iter().find(|h| !eval_datasets::is_task_hash(h)) {
        return Ok(invalid_hash(bad));
    }
    let mut hashes = req.hashes;
    let mut seen = HashSet::new();
    hashes.retain(|h| seen.insert(h.clone()));
    let missing = db::eval_datasets::missing_blobs(&db.pool, &project_id, &hashes).await?;
    Ok(HttpResponse::Ok().json(json!({ "missing": missing })))
}

pub async fn handle_upload_task(
    project_id: Uuid,
    hash: &str,
    payload: web::Payload,
    storage: &Storage,
) -> ResponseResult {
    let Some(bucket) = eval_datasets::bucket() else {
        return Ok(storage_not_configured());
    };
    if !eval_datasets::is_task_hash(hash) {
        return Ok(invalid_hash(hash));
    }
    let key = eval_datasets::archive_key(&project_id, hash);
    Ok(
        match uploads::upload_payload(storage, &bucket, &key, payload, MAX_TASK_ARCHIVE_BYTES).await
        {
            Ok(_) => HttpResponse::NoContent().finish(),
            Err(UploadError::Body(e)) => body_error_response(e),
            Err(UploadError::Storage(e)) => upstream_error("task upload", e),
        },
    )
}

/// The blob row is written last, so a task whose archive or index didn't make
/// it stays missing.
pub async fn handle_upload_task_index(
    project_id: Uuid,
    hash: &str,
    payload: web::Payload,
    db: &DB,
    storage: &Storage,
) -> ResponseResult {
    let Some(bucket) = eval_datasets::bucket() else {
        return Ok(storage_not_configured());
    };
    if !eval_datasets::is_task_hash(hash) {
        return Ok(invalid_hash(hash));
    }
    let stored = uploads::store_index(
        storage,
        &bucket,
        &eval_datasets::archive_key(&project_id, hash),
        &eval_datasets::index_key(&project_id, hash),
        payload,
        MAX_INDEX_BYTES,
    )
    .await;
    let index = match stored {
        Ok(index) => index,
        Err(IndexError::Body(e)) => return Ok(body_error_response(e)),
        Err(IndexError::Invalid(e)) => return Ok(invalid_index_response(e)),
        Err(IndexError::ArchiveMissing) => {
            return Ok(HttpResponse::NotFound().json(json!({
                "error": "Upload the task archive before its index"
            })));
        }
        Err(IndexError::Storage { operation, error }) => {
            return Ok(upstream_error(operation, error));
        }
    };
    let size = i64::try_from(index.total_size()).unwrap_or(i64::MAX);
    db::eval_datasets::upsert_blob(&db.pool, &project_id, hash, size).await?;
    Ok(HttpResponse::NoContent().finish())
}

pub async fn handle_download_task(
    project_id: Uuid,
    hash: &str,
    db: &DB,
    storage: &Storage,
) -> ResponseResult {
    let Some(bucket) = eval_datasets::bucket() else {
        return Ok(storage_not_configured());
    };
    if !eval_datasets::is_task_hash(hash) {
        return Ok(invalid_hash(hash));
    }
    if !db::eval_datasets::blob_exists(&db.pool, &project_id, hash).await? {
        return Ok(HttpResponse::NotFound().json(json!({ "error": "Task not found" })));
    }
    let key = eval_datasets::archive_key(&project_id, hash);
    Ok(match storage.get_stream(&bucket, &key).await {
        Ok(stream) => HttpResponse::Ok()
            .content_type("application/gzip")
            .streaming(stream.map(Ok::<_, actix_web::Error>)),
        Err(e) => upstream_error("task download", e),
    })
}

pub async fn handle_list_datasets(project_id: Uuid, db: &DB) -> ResponseResult {
    if eval_datasets::bucket().is_none() {
        return Ok(storage_not_configured());
    }
    let datasets: Vec<DatasetSummary> = db::eval_datasets::list_datasets(&db.pool, &project_id)
        .await?
        .into_iter()
        .map(|d| DatasetSummary {
            id: d.id,
            name: d.name,
            created_at: d.created_at,
            latest_version: d.latest_version,
        })
        .collect();
    Ok(HttpResponse::Ok().json(datasets))
}

pub async fn handle_get_version(
    project_id: Uuid,
    name: &str,
    version: &str,
    db: &DB,
) -> ResponseResult {
    if eval_datasets::bucket().is_none() {
        return Ok(storage_not_configured());
    }
    let Some(selector) = VersionSelector::parse(version) else {
        return Ok(bad_request(
            "version must be a positive integer or \"latest\"".to_string(),
        ));
    };
    let Some(row) =
        db::eval_datasets::get_version(&db.pool, &project_id, name, selector.number()).await?
    else {
        let error = match selector {
            VersionSelector::Latest => format!("Eval dataset {:?} not found", preview(name)),
            VersionSelector::Number(n) => {
                format!("Eval dataset {:?} has no version {n}", preview(name))
            }
        };
        return Ok(HttpResponse::NotFound().json(json!({ "error": error })));
    };
    let tasks = db::eval_datasets::get_version_tasks(&db.pool, &row.id)
        .await?
        .into_iter()
        .map(|t| (t.name, t.hash))
        .collect();
    Ok(HttpResponse::Ok().json(DatasetVersion {
        dataset_id: row.dataset_id,
        dataset: row.dataset,
        version: row.version,
        parent_version: row.parent_version,
        message: row.message,
        created_at: row.created_at,
        tasks,
    }))
}

pub async fn handle_create_version(
    http_req: &HttpRequest,
    project_id: Uuid,
    user_id: Option<Uuid>,
    name: &str,
    payload: web::Payload,
    db: &DB,
) -> ResponseResult {
    if eval_datasets::bucket().is_none() {
        return Ok(storage_not_configured());
    }
    if !eval_datasets::is_dataset_name(name) {
        return Ok(bad_request(format!(
            "Invalid dataset name {:?}: {}",
            preview(name),
            name_rule(MAX_DATASET_NAME_LEN)
        )));
    }
    let req: CreateVersionRequest = match read_json(payload).await {
        Ok(req) => req,
        Err(response) => return Ok(response),
    };
    if req.tasks.len() > MAX_VERSION_TASKS {
        return Ok(bad_request(format!(
            "At most {MAX_VERSION_TASKS} tasks per version"
        )));
    }
    if let Some(bad) = req.tasks.keys().find(|t| !eval_datasets::is_task_name(t)) {
        return Ok(bad_request(format!(
            "Invalid task name {:?}: {}",
            preview(bad),
            name_rule(MAX_TASK_NAME_LEN)
        )));
    }
    if let Some(bad) = req.tasks.values().find(|h| !eval_datasets::is_task_hash(h)) {
        return Ok(invalid_hash(bad));
    }

    let request = VersionRequest {
        dataset: name,
        parent_version: req.parent_version,
        message: req.message.as_deref(),
        tasks: &req.tasks,
        created_by_user_id: user_id,
    };
    let created = match eval_datasets::create_version(db, &project_id, &request).await {
        Ok(created) => created,
        Err(CreateVersionError::MissingTasks(missing)) => {
            return Ok(HttpResponse::Conflict().json(json!({
                "error": "Upload these tasks first",
                "missing": missing,
            })));
        }
        Err(CreateVersionError::UnknownParent(parent)) => {
            return Ok(bad_request(format!(
                "parentVersion {parent} doesn't exist in eval dataset {name:?}"
            )));
        }
        Err(CreateVersionError::Internal(e)) => return Err(e.into()),
    };
    audit::target_named(http_req, created.dataset_id, name.to_string());
    audit::metadata(http_req, "version", created.version);

    Ok(HttpResponse::Created().json(CreatedVersion {
        dataset_id: created.dataset_id,
        dataset: name.to_string(),
        version: created.version,
        previous_latest: created.previous_latest,
    }))
}

// ---- Helpers ----

/// Reads a JSON body with our own cap, so a malformed one gets an `{error}` body.
async fn read_json<T: DeserializeOwned>(payload: web::Payload) -> Result<T, HttpResponse> {
    let body = collect_payload(payload, MAX_JSON_BYTES)
        .await
        .map_err(body_error_response)?;
    serde_json::from_slice(&body).map_err(|e| bad_request(format!("Invalid request body: {e}")))
}

fn name_rule(max_len: usize) -> String {
    format!(
        "use letters, digits, '.', '_' and '-', start with a letter or digit, \
         at most {max_len} characters"
    )
}

fn bad_request(error: String) -> HttpResponse {
    HttpResponse::BadRequest().json(json!({ "error": error }))
}

fn invalid_hash(hash: &str) -> HttpResponse {
    bad_request(format!(
        "Invalid task hash {:?}: expected sha256:<64 lowercase hex>",
        preview(hash)
    ))
}

/// Rejected input is echoed back, but only its start: a body can hold megabytes.
fn preview(value: &str) -> String {
    const MAX_CHARS: usize = 300;
    match value.char_indices().nth(MAX_CHARS) {
        Some((cut, _)) => format!("{}…", &value[..cut]),
        None => value.to_string(),
    }
}

fn storage_not_configured() -> HttpResponse {
    HttpResponse::NotFound().json(json!({
        "error": "Eval datasets need S3 storage on this deployment"
    }))
}

/// S3 failed; see [`uploads::upstream_error`].
fn upstream_error(operation: &str, error: anyhow::Error) -> HttpResponse {
    uploads::upstream_error(&format!("Eval dataset {operation}"), error)
}
