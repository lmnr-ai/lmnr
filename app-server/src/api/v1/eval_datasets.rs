use std::sync::Arc;

use actix_web::{HttpRequest, HttpResponse, get, post, put, web};
use chrono::{DateTime, Utc};
use futures_util::StreamExt;
use indexmap::IndexMap;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::json;
use uuid::Uuid;

use crate::{
    api::uploads::{
        self, IndexError, UploadError, body_error_response, collect_payload, invalid_index_response,
    },
    audit,
    db::{self, DB, eval_datasets::TaskVersionRow, project_api_keys::ProjectApiKey},
    eval_datasets::{self, InvalidInput, PushError, TaskVersion},
    routes::types::ResponseResult,
    storage::{Storage, StorageTrait},
};

// Streamed bodies aren't covered by the global HTTP payload limit, so each gets its own.
const MAX_TASK_ARCHIVE_BYTES: u64 = 512 * 1024 * 1024;
const MAX_INDEX_BYTES: u64 = 64 * 1024 * 1024;
/// JSON bodies are read raw (to answer `{error}` on bad JSON), so they get a cap too.
/// 10k tasks with 255-character names stay well under it.
const MAX_JSON_BYTES: u64 = 16 * 1024 * 1024;
const MAX_TASKS_PER_REQUEST: usize = 10_000;
/// A push records its `{task: hash}` map in the audit event up to this size.
const MAX_AUDITED_TASKS: usize = 100;

#[derive(Deserialize)]
pub struct DatasetPath {
    pub(super) dataset: String,
}

#[derive(Deserialize)]
pub struct TaskVersionPath {
    dataset: String,
    task: String,
    hash: String,
}

impl TaskVersionPath {
    fn version(&self) -> TaskVersion<'_> {
        TaskVersion {
            dataset: &self.dataset,
            task: &self.task,
            hash: &self.hash,
        }
    }
}

/// `{tasks: {<task>: <hash>}}`, kept in input order.
#[derive(Deserialize)]
struct TaskHashesRequest {
    tasks: IndexMap<String, String>,
}

/// A push: `tasks` plus, optionally, each task's `base`, the hash the
/// client's change started from (`null`: it never had the task).
#[derive(Deserialize)]
struct PushRequest {
    tasks: IndexMap<String, String>,
    #[serde(default)]
    base: Option<IndexMap<String, Option<String>>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DatasetSummary {
    name: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    task_count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TaskVersionInfo {
    name: String,
    hash: String,
    created_at: DateTime<Utc>,
}

impl From<TaskVersionRow> for TaskVersionInfo {
    fn from(row: TaskVersionRow) -> Self {
        Self {
            name: row.name,
            hash: row.hash,
            created_at: row.created_at,
        }
    }
}

#[derive(Serialize)]
struct TaskVersionList {
    tasks: Vec<TaskVersionInfo>,
}

#[get("/eval-datasets")]
pub async fn list_datasets(project_api_key: ProjectApiKey, db: web::Data<DB>) -> ResponseResult {
    handle_list_datasets(project_api_key.project_id, &db).await
}

/// The latest version of every task in the dataset.
#[get("/eval-datasets/{dataset}/tasks")]
pub async fn list_tasks(
    path: web::Path<DatasetPath>,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
) -> ResponseResult {
    handle_list_tasks(project_api_key.project_id, &path.dataset, &db).await
}

/// `{tasks: {task: hash}}` → `{missing}`: the tasks whose hash isn't uploaded.
#[post("/eval-datasets/{dataset}/tasks/missing")]
pub async fn missing_tasks(
    path: web::Path<DatasetPath>,
    payload: web::Payload,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
) -> ResponseResult {
    handle_missing_tasks(project_api_key.project_id, &path.dataset, payload, &db).await
}

/// `{tasks: {task: hash}, base?: {task: hash | null}}`: makes each given version its task's latest.
#[post("/eval-datasets/{dataset}/tasks")]
pub async fn push_tasks(
    req: HttpRequest,
    path: web::Path<DatasetPath>,
    payload: web::Payload,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
) -> ResponseResult {
    handle_push_tasks(
        &req,
        project_api_key.project_id,
        &path.dataset,
        payload,
        &db,
    )
    .await
}

/// Body: the task's `.tar.gz` (lmnr-cli `packFiles`), streamed to S3.
#[put("/eval-datasets/{dataset}/tasks/{task}/versions/{hash}")]
pub async fn upload_task_version(
    path: web::Path<TaskVersionPath>,
    payload: web::Payload,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_upload_task_version(project_api_key.project_id, &path, payload, &db, &storage).await
}

/// Body: the task archive's index. Completes the upload.
#[put("/eval-datasets/{dataset}/tasks/{task}/versions/{hash}/index")]
pub async fn upload_task_version_index(
    path: web::Path<TaskVersionPath>,
    payload: web::Payload,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_upload_task_version_index(project_api_key.project_id, &path, payload, &db, &storage)
        .await
}

#[get("/eval-datasets/{dataset}/tasks/{task}/versions/{hash}")]
pub async fn download_task_version(
    path: web::Path<TaskVersionPath>,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_download_task_version(project_api_key.project_id, &path, &db, &storage).await
}

// ---- Shared by the project-API-key and CLI (`api::v1::cli::eval_datasets`) routes ----

pub async fn handle_list_datasets(project_id: Uuid, db: &DB) -> ResponseResult {
    if eval_datasets::bucket().is_none() {
        return Ok(storage_not_configured());
    }
    let datasets: Vec<DatasetSummary> = db::eval_datasets::list_datasets(&db.pool, &project_id)
        .await?
        .into_iter()
        .map(|d| DatasetSummary {
            name: d.name,
            created_at: d.created_at,
            updated_at: d.updated_at,
            task_count: d.task_count,
        })
        .collect();
    Ok(HttpResponse::Ok().json(datasets))
}

pub async fn handle_list_tasks(project_id: Uuid, dataset: &str, db: &DB) -> ResponseResult {
    if eval_datasets::bucket().is_none() {
        return Ok(storage_not_configured());
    }
    if !eval_datasets::is_dataset_name(dataset) {
        return Ok(invalid_input(InvalidInput::DatasetName(
            dataset.to_string(),
        )));
    }
    if !db::eval_datasets::dataset_exists(&db.pool, &project_id, dataset).await? {
        return Ok(HttpResponse::NotFound().json(json!({
            "error": format!("Eval dataset {dataset:?} not found")
        })));
    }
    let tasks = db::eval_datasets::latest_task_versions(&db.pool, &project_id, dataset)
        .await?
        .into_iter()
        .map(TaskVersionInfo::from)
        .collect();
    Ok(HttpResponse::Ok().json(TaskVersionList { tasks }))
}

/// A pure read: an unknown dataset has every task missing.
pub async fn handle_missing_tasks(
    project_id: Uuid,
    dataset: &str,
    payload: web::Payload,
    db: &DB,
) -> ResponseResult {
    if eval_datasets::bucket().is_none() {
        return Ok(storage_not_configured());
    }
    let tasks = match read_task_hashes(dataset, payload).await {
        Ok(tasks) => tasks,
        Err(response) => return Ok(response),
    };
    let missing =
        db::eval_datasets::missing_task_versions(&db.pool, &project_id, dataset, &tasks).await?;
    Ok(HttpResponse::Ok().json(json!({ "missing": missing })))
}

pub async fn handle_push_tasks(
    http_req: &HttpRequest,
    project_id: Uuid,
    dataset: &str,
    payload: web::Payload,
    db: &DB,
) -> ResponseResult {
    if eval_datasets::bucket().is_none() {
        return Ok(storage_not_configured());
    }
    if !eval_datasets::is_dataset_name(dataset) {
        return Ok(invalid_input(InvalidInput::DatasetName(
            dataset.to_string(),
        )));
    }
    let req: PushRequest = match read_json(payload).await {
        Ok(req) => req,
        Err(response) => return Ok(response),
    };
    let tasks = req.tasks;
    if tasks.is_empty() {
        return Ok(bad_request("No tasks to push".to_string()));
    }
    if let Err(response) = check_task_hashes(&tasks) {
        return Ok(response);
    }
    if let Some(Err(e)) = req.base.as_ref().map(eval_datasets::validate_task_bases) {
        return Ok(invalid_input(e));
    }
    let pushed = match eval_datasets::push_tasks(
        db,
        &project_id,
        dataset,
        &tasks,
        req.base.as_ref(),
    )
    .await
    {
        Ok(pushed) => pushed,
        Err(PushError::Missing(missing)) => {
            return Ok(HttpResponse::Conflict().json(json!({
                "error": "Upload these task versions first",
                "missing": missing,
            })));
        }
        Err(PushError::Moved(moved)) => {
            return Ok(HttpResponse::Conflict().json(json!({
                "error": "Another version became these tasks' latest since your base; pull them first",
                "moved": moved,
            })));
        }
        Err(PushError::Internal(e)) => return Err(e.into()),
    };

    audit::target_named(http_req, dataset, dataset.to_string());
    audit::metadata(http_req, "taskCount", tasks.len());
    if tasks.len() <= MAX_AUDITED_TASKS {
        audit::metadata(http_req, "tasks", json!(tasks));
    }

    let tasks = pushed.into_iter().map(TaskVersionInfo::from).collect();
    Ok(HttpResponse::Ok().json(TaskVersionList { tasks }))
}

pub async fn handle_upload_task_version(
    project_id: Uuid,
    path: &TaskVersionPath,
    payload: web::Payload,
    db: &DB,
    storage: &Storage,
) -> ResponseResult {
    let Some(bucket) = eval_datasets::bucket() else {
        return Ok(storage_not_configured());
    };
    let version = path.version();
    if let Err(e) = version.validate() {
        return Ok(invalid_input(e));
    }
    // A finished version's archive must keep matching its index.
    if db::eval_datasets::task_version_exists(&db.pool, &project_id, &version).await? {
        return Ok(HttpResponse::NoContent().finish());
    }
    let key = version.archive_key(&project_id);
    Ok(
        match uploads::upload_payload(storage, &bucket, &key, payload, MAX_TASK_ARCHIVE_BYTES).await
        {
            Ok(_) => HttpResponse::NoContent().finish(),
            Err(UploadError::Body(e)) => body_error_response(e),
            Err(UploadError::Storage(e)) => upstream_error("task upload", e),
        },
    )
}

/// The version row is written last, so a version whose archive or index
/// didn't make it stays missing.
pub async fn handle_upload_task_version_index(
    project_id: Uuid,
    path: &TaskVersionPath,
    payload: web::Payload,
    db: &DB,
    storage: &Storage,
) -> ResponseResult {
    let Some(bucket) = eval_datasets::bucket() else {
        return Ok(storage_not_configured());
    };
    let version = path.version();
    if let Err(e) = version.validate() {
        return Ok(invalid_input(e));
    }
    let stored = uploads::store_index(
        storage,
        &bucket,
        &version.archive_key(&project_id),
        &version.index_key(&project_id),
        payload,
        MAX_INDEX_BYTES,
    )
    .await;
    match stored {
        Ok(()) => {}
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
    }
    db::eval_datasets::insert_task_version(&db.pool, &project_id, &version).await?;
    Ok(HttpResponse::NoContent().finish())
}

pub async fn handle_download_task_version(
    project_id: Uuid,
    path: &TaskVersionPath,
    db: &DB,
    storage: &Storage,
) -> ResponseResult {
    let Some(bucket) = eval_datasets::bucket() else {
        return Ok(storage_not_configured());
    };
    let version = path.version();
    if let Err(e) = version.validate() {
        return Ok(invalid_input(e));
    }
    if !db::eval_datasets::task_version_exists(&db.pool, &project_id, &version).await? {
        return Ok(HttpResponse::NotFound().json(json!({ "error": "Task version not found" })));
    }
    let key = version.archive_key(&project_id);
    Ok(match storage.get_stream(&bucket, &key).await {
        Ok(stream) => HttpResponse::Ok()
            .content_type("application/gzip")
            .streaming(stream.map(Ok::<_, actix_web::Error>)),
        Err(e) => upstream_error("task download", e),
    })
}

// ---- Helpers ----

/// Reads and validates a `{tasks: {task: hash}}` body for `dataset`.
async fn read_task_hashes(
    dataset: &str,
    payload: web::Payload,
) -> Result<IndexMap<String, String>, HttpResponse> {
    if !eval_datasets::is_dataset_name(dataset) {
        return Err(invalid_input(InvalidInput::DatasetName(
            dataset.to_string(),
        )));
    }
    let req: TaskHashesRequest = read_json(payload).await?;
    check_task_hashes(&req.tasks)?;
    Ok(req.tasks)
}

fn check_task_hashes(tasks: &IndexMap<String, String>) -> Result<(), HttpResponse> {
    if tasks.len() > MAX_TASKS_PER_REQUEST {
        return Err(bad_request(format!(
            "At most {MAX_TASKS_PER_REQUEST} tasks per request"
        )));
    }
    eval_datasets::validate_task_hashes(tasks).map_err(invalid_input)
}

/// Reads a JSON body with our own cap, so a malformed one gets an `{error}` body.
async fn read_json<T: DeserializeOwned>(payload: web::Payload) -> Result<T, HttpResponse> {
    let body = collect_payload(payload, MAX_JSON_BYTES)
        .await
        .map_err(body_error_response)?;
    serde_json::from_slice(&body).map_err(|e| bad_request(format!("Invalid request body: {e}")))
}

fn invalid_input(input: InvalidInput) -> HttpResponse {
    bad_request(input.message())
}

fn bad_request(error: String) -> HttpResponse {
    HttpResponse::BadRequest().json(json!({ "error": error }))
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
