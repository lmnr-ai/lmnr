//! Hosted-evals task sets and their versions (LAM-2543). A version's files are
//! one content-addressed blob that lmnr-cli packs and uploads before pushing
//! the version; runs upload their task sets and scripts as blobs too. Blob routes sit under `/hosted-evals/uploads/` for the
//! deployment's nginx body-size rule. Every handler is shared with the CLI
//! twins (`api::v1::cli::hosted_evals`). See `docs/internal/hosted-evals.md`.

use std::{collections::HashSet, sync::Arc};

use actix_web::{
    HttpResponse, get, post, put,
    web::{self, Json},
};
use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::sync::mpsc;
use uuid::Uuid;

use super::hosted_evals::{
    MAX_ARCHIVE_BYTES, body_error_response, forward_payload, store_index, upstream_error,
};
use crate::{
    db::{
        DB,
        project_api_keys::ProjectApiKey,
        task_sets::{self, NewTask, NewTaskSetVersion, TaskSetPush},
    },
    env,
    features::{Feature, is_feature_enabled},
    hosted_evals,
    routes::types::ResponseResult,
    storage::{Storage, StorageTrait},
};

/// Most tasks one task-set version may list.
const MAX_TASKS: usize = 10_000;

#[derive(Deserialize)]
pub struct TaskRequest {
    name: String,
    digest: String,
    #[serde(default)]
    metadata: Option<Value>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskSetVersionRequest {
    hash: String,
    #[serde(default)]
    base: Option<Uuid>,
    tasks: Vec<TaskRequest>,
}

#[derive(Deserialize)]
pub struct TaskSetPath {
    task_set: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatestScriptsQuery {
    task_set: String,
}

// ---- Blobs ----

#[put("/hosted-evals/uploads/blobs/{hash}")]
pub async fn put_blob(
    path: web::Path<String>,
    payload: web::Payload,
    project_api_key: ProjectApiKey,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_put_blob(project_api_key.project_id, &path, payload, &storage).await
}

/// Body: the blob's file index (JSON, `hosted_evals::ArchiveIndex`). Sent after
/// the archive, so a stored index means a complete blob.
#[put("/hosted-evals/uploads/blobs/{hash}/index")]
pub async fn put_blob_index(
    path: web::Path<String>,
    payload: web::Payload,
    project_api_key: ProjectApiKey,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_put_blob_index(project_api_key.project_id, &path, payload, &storage).await
}

#[get("/hosted-evals/uploads/blobs/{hash}")]
pub async fn get_blob(
    path: web::Path<String>,
    project_api_key: ProjectApiKey,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_get_blob(
        project_api_key.project_id,
        &path,
        BlobPart::Archive,
        &storage,
    )
    .await
}

#[get("/hosted-evals/uploads/blobs/{hash}/index")]
pub async fn get_blob_index(
    path: web::Path<String>,
    project_api_key: ProjectApiKey,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_get_blob(project_api_key.project_id, &path, BlobPart::Index, &storage).await
}

pub async fn handle_put_blob(
    project_id: Uuid,
    hash: &str,
    payload: web::Payload,
    storage: &Storage,
) -> ResponseResult {
    let Some(bucket) = store_bucket() else {
        return Ok(storage_disabled());
    };
    if !hosted_evals::is_hash(hash) {
        return Ok(invalid_hash());
    }
    let key = hosted_evals::blob_archive_key(&project_id, hash);
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
        Err(e) => upstream_error("blob upload", e),
    })
}

pub async fn handle_put_blob_index(
    project_id: Uuid,
    hash: &str,
    payload: web::Payload,
    storage: &Storage,
) -> ResponseResult {
    let Some(bucket) = store_bucket() else {
        return Ok(storage_disabled());
    };
    if !hosted_evals::is_hash(hash) {
        return Ok(invalid_hash());
    }
    store_index(
        storage,
        &bucket,
        &hosted_evals::blob_archive_key(&project_id, hash),
        &hosted_evals::blob_index_key(&project_id, hash),
        payload,
    )
    .await
}

pub enum BlobPart {
    Archive,
    Index,
}

pub async fn handle_get_blob(
    project_id: Uuid,
    hash: &str,
    part: BlobPart,
    storage: &Storage,
) -> ResponseResult {
    let Some(bucket) = store_bucket() else {
        return Ok(storage_disabled());
    };
    if !hosted_evals::is_hash(hash) {
        return Ok(invalid_hash());
    }
    let (key, content_type) = match part {
        BlobPart::Archive => (
            hosted_evals::blob_archive_key(&project_id, hash),
            "application/gzip",
        ),
        BlobPart::Index => (
            hosted_evals::blob_index_key(&project_id, hash),
            "application/json",
        ),
    };
    let stream = match storage.exists(&bucket, &key).await {
        Ok(true) => storage.get_stream(&bucket, &key).await,
        Ok(false) => return Ok(blob_not_found()),
        Err(e) => Err(e),
    };
    Ok(match stream {
        Ok(stream) => HttpResponse::Ok()
            .content_type(content_type)
            .streaming(stream.map(Ok::<_, actix_web::Error>)),
        Err(e) => upstream_error("blob download", e),
    })
}

// ---- Task sets, versions, scripts ----

#[get("/hosted-evals/task-sets")]
pub async fn list_task_sets(project_api_key: ProjectApiKey, db: web::Data<DB>) -> ResponseResult {
    handle_list_task_sets(project_api_key.project_id, &db).await
}

#[get("/hosted-evals/task-sets/{task_set}/versions")]
pub async fn list_task_set_versions(
    path: web::Path<TaskSetPath>,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
) -> ResponseResult {
    handle_list_task_set_versions(project_api_key.project_id, &path, &db).await
}

#[post("/hosted-evals/task-sets/{task_set}/versions")]
pub async fn create_task_set_version(
    path: web::Path<TaskSetPath>,
    body: Json<CreateTaskSetVersionRequest>,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_create_task_set_version(
        project_api_key.project_id,
        &path,
        body.into_inner(),
        &db,
        &storage,
    )
    .await
}

#[get("/hosted-evals/scripts/latest")]
pub async fn latest_scripts(
    query: web::Query<LatestScriptsQuery>,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
) -> ResponseResult {
    handle_latest_scripts(project_api_key.project_id, &query, &db).await
}

pub async fn handle_list_task_sets(project_id: Uuid, db: &DB) -> ResponseResult {
    let task_sets = task_sets::list_task_sets(&db.pool, &project_id).await?;
    Ok(HttpResponse::Ok().json(json!({ "taskSets": task_sets })))
}

pub async fn handle_list_task_set_versions(
    project_id: Uuid,
    path: &TaskSetPath,
    db: &DB,
) -> ResponseResult {
    let versions = task_sets::list_task_set_versions(&db.pool, &project_id, &path.task_set).await?;
    if versions.is_empty() {
        return Ok(HttpResponse::NotFound().json(json!({
            "error": format!("Task set {} not found", path.task_set)
        })));
    }
    Ok(HttpResponse::Ok().json(json!({ "versions": versions })))
}

pub async fn handle_create_task_set_version(
    project_id: Uuid,
    path: &TaskSetPath,
    req: CreateTaskSetVersionRequest,
    db: &DB,
    storage: &Storage,
) -> ResponseResult {
    if !hosted_evals::is_name(&path.task_set) {
        return Ok(invalid_name());
    }
    if let Some(response) = check_tasks(&req.tasks) {
        return Ok(response);
    }
    if let Some(response) = check_blob(&project_id, &req.hash, storage).await {
        return Ok(response);
    }
    let tasks: Vec<NewTask> = req
        .tasks
        .into_iter()
        .map(|task| NewTask {
            name: task.name,
            digest: task.digest,
            metadata: task.metadata,
        })
        .collect();
    let pushed = task_sets::create_task_set_version(
        &db.pool,
        &project_id,
        &NewTaskSetVersion {
            task_set: &path.task_set,
            hash: &req.hash,
            base: req.base,
            tasks: &tasks,
        },
    )
    .await?;
    Ok(match pushed {
        TaskSetPush::Done(version) => HttpResponse::Ok().json(version),
        TaskSetPush::HeadMoved(head) => HttpResponse::Conflict().json(json!({
            "error": format!(
                "Task set {} changed since your base version: pull, then push again",
                path.task_set
            ),
            "head": head,
        })),
    })
}

pub async fn handle_latest_scripts(
    project_id: Uuid,
    query: &LatestScriptsQuery,
    db: &DB,
) -> ResponseResult {
    if !hosted_evals::is_name(&query.task_set) {
        return Ok(invalid_name());
    }
    Ok(
        match task_sets::latest_scripts(&db.pool, &project_id, &query.task_set).await? {
            Some(scripts) => HttpResponse::Ok().json(scripts),
            None => HttpResponse::NotFound().json(json!({
                "error": format!("No evaluation of task set {} has recorded its scripts", query.task_set)
            })),
        },
    )
}

/// `None` when the blob for `hash` is fully uploaded (its index is stored last).
async fn check_blob(project_id: &Uuid, hash: &str, storage: &Storage) -> Option<HttpResponse> {
    let Some(bucket) = store_bucket() else {
        return Some(storage_disabled());
    };
    if !hosted_evals::is_hash(hash) {
        return Some(invalid_hash());
    }
    match storage
        .exists(&bucket, &hosted_evals::blob_index_key(project_id, hash))
        .await
    {
        Ok(true) => None,
        Ok(false) => Some(HttpResponse::BadRequest().json(json!({
            "error": "Upload the blob and its index before creating a version of it"
        }))),
        Err(e) => Some(upstream_error("blob check", e)),
    }
}

fn check_tasks(tasks: &[TaskRequest]) -> Option<HttpResponse> {
    if tasks.len() > MAX_TASKS {
        return Some(HttpResponse::BadRequest().json(json!({
            "error": format!("At most {MAX_TASKS} tasks per version")
        })));
    }
    let mut names = HashSet::new();
    for task in tasks {
        if task.name.is_empty() || task.name.len() > 255 || !names.insert(task.name.as_str()) {
            return Some(HttpResponse::BadRequest().json(json!({
                "error": format!("Task names must be unique and non-empty: {:?}", task.name)
            })));
        }
        if !hosted_evals::is_hash(&task.digest) {
            return Some(HttpResponse::BadRequest().json(json!({
                "error": format!("Task {:?} has an invalid digest", task.name)
            })));
        }
    }
    None
}

/// Blobs need only storage, not sandboxes: local runs upload them too.
fn store_bucket() -> Option<String> {
    if !is_feature_enabled(Feature::Storage) {
        return None;
    }
    env::optional_string(env::storage::S3_EXPORTS_BUCKET)
}

fn storage_disabled() -> HttpResponse {
    HttpResponse::NotFound().json(json!({
        "error": "Task sets need storage (S3_EXPORTS_BUCKET), which this deployment doesn't have"
    }))
}

fn blob_not_found() -> HttpResponse {
    HttpResponse::NotFound().json(json!({ "error": "Blob not found" }))
}

fn invalid_hash() -> HttpResponse {
    HttpResponse::BadRequest().json(json!({
        "error": "hash must be 64 lowercase hex characters"
    }))
}

fn invalid_name() -> HttpResponse {
    HttpResponse::BadRequest().json(json!({
        "error": "Agent and task set names are 1-100 characters of A-Z, a-z, 0-9, '.', '_' \
                  and '-', starting with a letter or digit"
    }))
}
