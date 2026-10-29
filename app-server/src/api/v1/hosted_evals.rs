use std::sync::Arc;

use actix_web::{
    HttpResponse, delete,
    error::PayloadError,
    get,
    http::StatusCode,
    post, put,
    web::{self, Json},
};
use anyhow::anyhow;
use bytes::{Bytes, BytesMut};
use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::json;
use tokio::sync::mpsc::{self, Sender};
use uuid::Uuid;

use crate::{
    cache::Cache,
    db::{DB, project_api_keys::ProjectApiKey},
    env,
    features::{Feature, is_feature_enabled},
    hosted_evals::{
        self, RunError, RunRequest,
        daytona::Daytona,
        images::{self, ImageError, Registry, Resources},
        sandboxes::{self, CreateError, CreateTrialSandbox, ProjectSandbox},
    },
    routes::types::ResponseResult,
    storage::{Storage, StorageTrait},
};

// Streamed bodies aren't covered by the global HTTP payload limit, so each gets its own.
const MAX_ARCHIVE_BYTES: u64 = 100 * 1024 * 1024;
const MAX_FILE_BYTES: u64 = 512 * 1024 * 1024;
const MAX_LAYER_BYTES: u64 = 8 * 1024 * 1024 * 1024;
const MAX_LAYERS: usize = 256;

enum BodyError {
    Empty,
    TooLarge(u64),
    Payload(PayloadError),
}

#[derive(Deserialize)]
pub struct FilePath {
    path: String,
}

// ---- Images (layers and images also under /v1/cli) ----

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayersRequest {
    diff_ids: Vec<String>,
}

#[derive(Deserialize)]
pub struct CreateImageRequest {
    /// The image config JSON, exactly as `docker save` wrote it.
    config: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotRequest {
    image: String,
    cpus: Option<u32>,
    memory_gb: Option<u32>,
    disk_gb: Option<u32>,
}

#[post("/hosted-evals/images/layers/missing")]
pub async fn missing_layers(
    req: Json<LayersRequest>,
    project_api_key: ProjectApiKey,
    cache: web::Data<Cache>,
) -> ResponseResult {
    handle_missing_layers(project_api_key.project_id, req.into_inner(), &cache).await
}

#[put("/hosted-evals/images/layers/{diff_id}")]
pub async fn upload_layer(
    path: web::Path<String>,
    payload: web::Payload,
    project_api_key: ProjectApiKey,
    cache: web::Data<Cache>,
) -> ResponseResult {
    handle_upload_layer(project_api_key.project_id, &path, payload, &cache).await
}

#[post("/hosted-evals/images")]
pub async fn create_image(
    req: Json<CreateImageRequest>,
    project_api_key: ProjectApiKey,
    cache: web::Data<Cache>,
) -> ResponseResult {
    handle_create_image(project_api_key.project_id, req.into_inner(), &cache).await
}

/// `{diffIds}` → `{missing}`: the layers the project hasn't uploaded yet.
pub async fn handle_missing_layers(
    project_id: Uuid,
    req: LayersRequest,
    cache: &Cache,
) -> ResponseResult {
    if !is_feature_enabled(Feature::HostedEvals) {
        return Ok(not_enabled());
    }
    if req.diff_ids.len() > MAX_LAYERS || !req.diff_ids.iter().all(|d| images::is_digest(d)) {
        return Ok(invalid_digest());
    }
    let registry = Registry::connect(&project_id).await?;
    let missing = images::missing_layers(&registry, cache, &project_id, &req.diff_ids).await?;
    Ok(HttpResponse::Ok().json(json!({ "missing": missing })))
}

/// Body: one image layer, gzip-compressed. `diff_id` is the digest of its
/// uncompressed tar, as listed in the image config.
pub async fn handle_upload_layer(
    project_id: Uuid,
    diff_id: &str,
    payload: web::Payload,
    cache: &Cache,
) -> ResponseResult {
    if !is_feature_enabled(Feature::HostedEvals) {
        return Ok(not_enabled());
    }
    if !images::is_digest(diff_id) {
        return Ok(invalid_digest());
    }
    let registry = Registry::connect(&project_id).await?;
    let (tx, rx) = mpsc::channel(4);
    let (received, stored) = futures_util::join!(
        forward_payload(payload, tx, MAX_LAYER_BYTES),
        images::upload_layer(&registry, cache, &project_id, diff_id, rx)
    );
    if let Err(e) = received {
        return Ok(body_error_response(e));
    }
    let blob = stored?;
    Ok(HttpResponse::Ok().json(json!({ "digest": blob.digest, "size": blob.size })))
}

/// `{config}` → `{image}`: pushes the image whose layers were uploaded and
/// returns its manifest digest. `409 {missing}` lists layers still to upload.
pub async fn handle_create_image(
    project_id: Uuid,
    req: CreateImageRequest,
    cache: &Cache,
) -> ResponseResult {
    if !is_feature_enabled(Feature::HostedEvals) {
        return Ok(not_enabled());
    }
    let registry = Registry::connect(&project_id).await?;
    Ok(
        match images::create_image(&registry, cache, &project_id, req.config).await? {
            Ok(image) => HttpResponse::Ok().json(json!({ "image": image })),
            Err(ImageError::InvalidConfig(e)) => HttpResponse::BadRequest().json(json!({
                "error": format!("Invalid image config: {e}")
            })),
            Err(ImageError::WrongPlatform(arch)) => HttpResponse::BadRequest().json(json!({
                "error": format!(
                    "The image is built for {arch:?}; Laminar sandboxes run linux/amd64. \
                     Build it with --platform linux/amd64."
                )
            })),
            Err(ImageError::MissingLayers(missing)) => HttpResponse::Conflict().json(json!({
                "error": "Upload these layers first",
                "missing": missing,
            })),
        },
    )
}

/// `{image, cpus?, memoryGb?, diskGb?}` → `{state: ready | pending | failed}`.
/// Creates the image's snapshot for these resources on first call; Harbor's
/// environment class polls it before creating a sandbox from the image.
#[post("/hosted-evals/images/snapshots")]
pub async fn ensure_snapshot(
    req: Json<SnapshotRequest>,
    project_api_key: ProjectApiKey,
    http_client: web::Data<reqwest::Client>,
) -> ResponseResult {
    if !is_feature_enabled(Feature::HostedEvals) {
        return Ok(not_enabled());
    }
    if !images::is_digest(&req.image) {
        return Ok(invalid_digest());
    }
    let daytona = hosted_evals::daytona_client(&http_client)?;
    let resources = Resources::clamped(req.cpus, req.memory_gb, req.disk_gb);
    let status =
        images::ensure_snapshot(&daytona, &project_api_key.project_id, &req.image, resources)
            .await?;
    Ok(HttpResponse::Ok().json(status))
}

// ---- Trial sandboxes (project API key only: Harbor's environment class) ----

#[post("/hosted-evals/sandboxes")]
pub async fn create_sandbox(
    req: Json<CreateTrialSandbox>,
    project_api_key: ProjectApiKey,
    cache: web::Data<Cache>,
    http_client: web::Data<reqwest::Client>,
) -> ResponseResult {
    if !is_feature_enabled(Feature::HostedEvals) {
        return Ok(not_enabled());
    }
    match sandboxes::create(
        &http_client,
        &cache,
        &project_api_key.project_id,
        req.into_inner(),
    )
    .await
    {
        Ok(sandbox_id) => Ok(HttpResponse::Created().json(json!({ "sandboxId": sandbox_id }))),
        Err(e) => Ok(create_error_response(e)),
    }
}

#[get("/hosted-evals/sandboxes/{sandbox_id}")]
pub async fn get_sandbox(
    path: web::Path<String>,
    project_api_key: ProjectApiKey,
    cache: web::Data<Cache>,
    http_client: web::Data<reqwest::Client>,
) -> ResponseResult {
    let Some((daytona, sandbox)) =
        resolve_sandbox(&http_client, &cache, &project_api_key, &path).await?
    else {
        return Ok(sandbox_not_found());
    };
    Ok(HttpResponse::Ok().json(sandboxes::status(&daytona, &sandbox).await?))
}

#[delete("/hosted-evals/sandboxes/{sandbox_id}")]
pub async fn delete_sandbox(
    path: web::Path<String>,
    project_api_key: ProjectApiKey,
    cache: web::Data<Cache>,
    http_client: web::Data<reqwest::Client>,
) -> ResponseResult {
    let Some((daytona, sandbox)) =
        resolve_sandbox(&http_client, &cache, &project_api_key, &path).await?
    else {
        return Ok(sandbox_not_found());
    };
    sandboxes::delete(&daytona, &cache, &project_api_key.project_id, &sandbox).await?;
    Ok(HttpResponse::NoContent().finish())
}

#[derive(Deserialize)]
pub struct StartCommand {
    command: String,
}

#[post("/hosted-evals/sandboxes/{sandbox_id}/commands")]
pub async fn start_command(
    path: web::Path<String>,
    req: Json<StartCommand>,
    project_api_key: ProjectApiKey,
    cache: web::Data<Cache>,
    http_client: web::Data<reqwest::Client>,
) -> ResponseResult {
    let Some((daytona, sandbox)) =
        resolve_sandbox(&http_client, &cache, &project_api_key, &path).await?
    else {
        return Ok(sandbox_not_found());
    };
    let command_id = sandboxes::start_command(&daytona, &sandbox, &req.command).await?;
    Ok(HttpResponse::Accepted().json(json!({ "commandId": command_id })))
}

/// `{exitCode: null}` while running; `{exitCode, stdout, stderr}` once done.
#[get("/hosted-evals/sandboxes/{sandbox_id}/commands/{command_id}")]
pub async fn get_command(
    path: web::Path<(String, String)>,
    project_api_key: ProjectApiKey,
    cache: web::Data<Cache>,
    http_client: web::Data<reqwest::Client>,
) -> ResponseResult {
    let (sandbox_id, command_id) = path.into_inner();
    let Some((daytona, sandbox)) =
        resolve_sandbox(&http_client, &cache, &project_api_key, &sandbox_id).await?
    else {
        return Ok(sandbox_not_found());
    };
    match sandboxes::command_result(&daytona, &sandbox, &command_id).await? {
        Some(result) => Ok(HttpResponse::Ok().json(result)),
        None => Ok(HttpResponse::NotFound().json(json!({ "error": "Unknown command" }))),
    }
}

/// Body: the file's raw bytes, written to `?path=` (absolute) in the sandbox.
#[put("/hosted-evals/sandboxes/{sandbox_id}/files")]
pub async fn upload_file(
    path: web::Path<String>,
    query: web::Query<FilePath>,
    payload: web::Payload,
    project_api_key: ProjectApiKey,
    cache: web::Data<Cache>,
    http_client: web::Data<reqwest::Client>,
) -> ResponseResult {
    if !query.path.starts_with('/') {
        return Ok(relative_path());
    }
    let Some((daytona, sandbox)) =
        resolve_sandbox(&http_client, &cache, &project_api_key, &path).await?
    else {
        return Ok(sandbox_not_found());
    };
    let content = match collect_payload(payload, MAX_FILE_BYTES).await {
        Ok(content) => content,
        Err(e) => return Ok(body_error_response(e)),
    };
    sandboxes::upload_file(&daytona, &sandbox, &query.path, content).await?;
    Ok(HttpResponse::NoContent().finish())
}

#[get("/hosted-evals/sandboxes/{sandbox_id}/files")]
pub async fn download_file(
    path: web::Path<String>,
    query: web::Query<FilePath>,
    project_api_key: ProjectApiKey,
    cache: web::Data<Cache>,
    http_client: web::Data<reqwest::Client>,
) -> ResponseResult {
    if !query.path.starts_with('/') {
        return Ok(relative_path());
    }
    let Some((daytona, sandbox)) =
        resolve_sandbox(&http_client, &cache, &project_api_key, &path).await?
    else {
        return Ok(sandbox_not_found());
    };
    match sandboxes::download_file(&daytona, &sandbox, &query.path).await? {
        Some(response) => Ok(HttpResponse::Ok()
            .content_type("application/octet-stream")
            .streaming(response.bytes_stream())),
        None => Ok(HttpResponse::NotFound().json(json!({ "error": "File not found" }))),
    }
}

// ---- Detached runs (uploads and runs also under /v1/cli) ----

/// Body: the `.tar.gz` of the `evals/` folder's contents, streamed to S3.
#[post("/hosted-evals/uploads")]
pub async fn create_upload(
    payload: web::Payload,
    project_api_key: ProjectApiKey,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_create_upload(project_api_key.project_id, payload, &storage).await
}

/// The orchestrator sandbox downloads its run's archive here with the run key.
#[get("/hosted-evals/uploads/{upload_id}")]
pub async fn download_upload(
    path: web::Path<Uuid>,
    project_api_key: ProjectApiKey,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    let Some(bucket) = uploads_bucket() else {
        return Ok(not_enabled());
    };
    let key = hosted_evals::archive_key(&project_api_key.project_id, &path);
    if storage.get_size(&bucket, &key).await.is_err() {
        return Ok(HttpResponse::NotFound().json(json!({ "error": "Upload not found" })));
    }
    let stream = storage.get_stream(&bucket, &key).await?;
    Ok(HttpResponse::Ok()
        .content_type("application/gzip")
        .streaming(stream.map(Ok::<_, actix_web::Error>)))
}

#[post("/hosted-evals/runs")]
pub async fn start_run(
    req: Json<RunRequest>,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
    storage: web::Data<Arc<Storage>>,
    http_client: web::Data<reqwest::Client>,
) -> ResponseResult {
    handle_start_run(
        project_api_key.project_id,
        req.into_inner(),
        &db,
        &cache,
        &storage,
        &http_client,
    )
    .await
}

/// Shared by the project-API-key and CLI (`api::v1::cli::hosted_evals`) uploads.
pub async fn handle_create_upload(
    project_id: Uuid,
    payload: web::Payload,
    storage: &Storage,
) -> ResponseResult {
    let Some(bucket) = uploads_bucket() else {
        return Ok(not_enabled());
    };
    let upload_id = Uuid::new_v4();
    let key = hosted_evals::archive_key(&project_id, &upload_id);

    // `web::Payload` isn't `Send`, so it's pumped through a channel the upload reads.
    let (tx, rx) = mpsc::channel(4);
    let (received, stored) = futures_util::join!(
        forward_payload(payload, tx, MAX_ARCHIVE_BYTES),
        storage.upload_stream(&bucket, &key, rx)
    );
    if let Err(e) = received {
        return Ok(body_error_response(e));
    }
    stored?;

    Ok(HttpResponse::Ok().json(json!({ "uploadId": upload_id })))
}

/// Shared by the project-API-key and CLI (`api::v1::cli::hosted_evals`) runs.
pub async fn handle_start_run(
    project_id: Uuid,
    req: RunRequest,
    db: &DB,
    cache: &Cache,
    storage: &Storage,
    http_client: &reqwest::Client,
) -> ResponseResult {
    let Some(bucket) = uploads_bucket() else {
        return Ok(not_enabled());
    };
    let key = hosted_evals::archive_key(&project_id, &req.upload_id);
    if storage.get_size(&bucket, &key).await.is_err() {
        return Ok(HttpResponse::BadRequest().json(json!({
            "error": "No archive uploaded for this uploadId"
        })));
    }

    let sandbox_id = match hosted_evals::start_run(http_client, db, cache, &project_id, &req).await
    {
        Ok(id) => id,
        Err(RunError::InvalidCliVersion) => {
            return Ok(HttpResponse::BadRequest().json(json!({
                "error": format!("Invalid cliVersion {:?}", req.cli_version)
            })));
        }
        Err(RunError::Sandbox(e)) => return Ok(create_error_response(e)),
        Err(RunError::Internal(e)) => return Err(e.into()),
    };
    log::info!("Started hosted eval run for project {project_id} in sandbox {sandbox_id}");

    Ok(HttpResponse::Accepted().json(json!({ "sandboxId": sandbox_id })))
}

// ---- Helpers ----

async fn resolve_sandbox<'a>(
    http: &'a reqwest::Client,
    cache: &Cache,
    project_api_key: &ProjectApiKey,
    sandbox_id: &str,
) -> anyhow::Result<Option<(Daytona<'a>, ProjectSandbox)>> {
    if !is_feature_enabled(Feature::HostedEvals) {
        return Ok(None);
    }
    let daytona = hosted_evals::daytona_client(http)?;
    let sandbox =
        sandboxes::resolve(&daytona, cache, &project_api_key.project_id, sandbox_id).await?;
    Ok(sandbox.map(|s| (daytona, s)))
}

/// Pumps `payload` into `tx` up to `max_bytes`. Any failure sends an `Err`
/// down the channel so the upload aborts instead of storing a partial object.
async fn forward_payload(
    mut payload: web::Payload,
    tx: Sender<anyhow::Result<Bytes>>,
    max_bytes: u64,
) -> Result<(), BodyError> {
    let mut size = 0;
    let result = loop {
        match payload.next().await {
            None if size == 0 => break Err(BodyError::Empty),
            None => break Ok(()),
            Some(Err(e)) => break Err(BodyError::Payload(e)),
            Some(Ok(chunk)) => {
                size += chunk.len() as u64;
                if size > max_bytes {
                    break Err(BodyError::TooLarge(max_bytes));
                }
                // A closed channel means the upload already failed and reports why.
                if tx.send(Ok(chunk)).await.is_err() {
                    break Ok(());
                }
            }
        }
    };
    if result.is_err() {
        let _ = tx.send(Err(anyhow!("upload aborted"))).await;
    }
    result
}

async fn collect_payload(mut payload: web::Payload, max_bytes: u64) -> Result<Bytes, BodyError> {
    let mut body = BytesMut::new();
    while let Some(chunk) = payload.next().await {
        let chunk = chunk.map_err(BodyError::Payload)?;
        if (body.len() + chunk.len()) as u64 > max_bytes {
            return Err(BodyError::TooLarge(max_bytes));
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body.freeze())
}

fn body_error_response(error: BodyError) -> HttpResponse {
    match error {
        BodyError::Empty => HttpResponse::BadRequest().json(json!({ "error": "Empty body" })),
        BodyError::TooLarge(max) => HttpResponse::PayloadTooLarge().json(json!({
            "error": format!("Body exceeds {max} bytes")
        })),
        BodyError::Payload(e) => HttpResponse::BadRequest().json(json!({
            "error": format!("Failed to read body: {e}")
        })),
    }
}

fn create_error_response(error: CreateError) -> HttpResponse {
    match error {
        CreateError::InvalidImage => HttpResponse::BadRequest().json(json!({
            "error": "image must be a sha256 manifest digest"
        })),
        CreateError::ImageNotReady => HttpResponse::Conflict().json(json!({
            "error": "The image's snapshot for these resources isn't ready; \
                      poll /hosted-evals/images/snapshots until it is"
        })),
        CreateError::TooManySandboxes(max) => HttpResponse::TooManyRequests().json(json!({
            "error": format!(
                "The project already has {max} hosted-evals sandboxes running. \
                 Lower n_concurrent_trials or wait for running trials to finish."
            )
        })),
        CreateError::CapacityBusy => HttpResponse::TooManyRequests().json(json!({
            "error": "Too many hosted-evals sandboxes are being created for this project \
                      at once. Retry shortly."
        })),
        CreateError::Daytona(e) => {
            log::error!("Hosted evals sandbox creation failed: {e:?}");
            HttpResponse::build(StatusCode::BAD_GATEWAY)
                .json(json!({ "error": format!("Failed to create the sandbox: {e}") }))
        }
    }
}

fn uploads_bucket() -> Option<String> {
    if !is_feature_enabled(Feature::HostedEvals) || !is_feature_enabled(Feature::Storage) {
        return None;
    }
    std::env::var(env::storage::S3_EXPORTS_BUCKET).ok()
}

fn not_enabled() -> HttpResponse {
    HttpResponse::NotFound().json(json!({
        "error": "Hosted evals are not enabled on this deployment"
    }))
}

fn sandbox_not_found() -> HttpResponse {
    HttpResponse::NotFound().json(json!({ "error": "Sandbox not found" }))
}

fn invalid_digest() -> HttpResponse {
    HttpResponse::BadRequest().json(json!({
        "error": format!("Expected sha256:<64 hex> digests, at most {MAX_LAYERS}")
    }))
}

fn relative_path() -> HttpResponse {
    HttpResponse::BadRequest().json(json!({ "error": "path must be absolute" }))
}
