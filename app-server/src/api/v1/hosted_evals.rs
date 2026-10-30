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
use futures_util::{Stream, StreamExt};
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
        self, HostedEvals, RunError, RunRequest,
        images::{self, ImageError},
        provider::{SandboxHandle, SandboxProvider, SandboxProviderTrait},
        sandboxes::{self, CreateError, ImageRequest},
    },
    routes::types::ResponseResult,
    storage::{Storage, StorageTrait},
};

// Streamed bodies aren't covered by the global HTTP payload limit, so each gets its own.
const MAX_ARCHIVE_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_FILE_BYTES: u64 = 512 * 1024 * 1024;
const MAX_LAYER_BYTES: u64 = 8 * 1024 * 1024 * 1024;
const MAX_LAYERS: usize = 256;

pub type HostedEvalsData = web::Data<Option<HostedEvals>>;

#[derive(Debug)]
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

#[post("/hosted-evals/images/layers/missing")]
pub async fn missing_layers(
    req: Json<LayersRequest>,
    project_api_key: ProjectApiKey,
    hosted: HostedEvalsData,
    cache: web::Data<Cache>,
) -> ResponseResult {
    handle_missing_layers(
        project_api_key.project_id,
        req.into_inner(),
        &hosted,
        &cache,
    )
    .await
}

#[put("/hosted-evals/images/layers/{diff_id}")]
pub async fn upload_layer(
    path: web::Path<String>,
    payload: web::Payload,
    project_api_key: ProjectApiKey,
    hosted: HostedEvalsData,
    cache: web::Data<Cache>,
) -> ResponseResult {
    handle_upload_layer(project_api_key.project_id, &path, payload, &hosted, &cache).await
}

#[post("/hosted-evals/images")]
pub async fn create_image(
    req: Json<CreateImageRequest>,
    project_api_key: ProjectApiKey,
    hosted: HostedEvalsData,
    cache: web::Data<Cache>,
) -> ResponseResult {
    handle_create_image(
        project_api_key.project_id,
        req.into_inner(),
        &hosted,
        &cache,
    )
    .await
}

/// `{diffIds}` → `{missing}`: the layers the project hasn't uploaded yet.
pub async fn handle_missing_layers(
    project_id: Uuid,
    req: LayersRequest,
    hosted: &HostedEvalsData,
    cache: &Cache,
) -> ResponseResult {
    let Some(hosted) = hosted.get_ref() else {
        return Ok(not_enabled());
    };
    if req.diff_ids.len() > MAX_LAYERS || !req.diff_ids.iter().all(|d| images::is_digest(d)) {
        return Ok(invalid_digests());
    }
    let missing = async {
        let repository = hosted.registry.repository(&project_id).await?;
        images::missing_layers(&repository, cache, &project_id, &req.diff_ids).await
    }
    .await;
    Ok(match missing {
        Ok(missing) => HttpResponse::Ok().json(json!({ "missing": missing })),
        Err(e) => upstream_error("layer check", e),
    })
}

/// Body: one image layer, gzip-compressed. `diff_id` is the digest of its
/// uncompressed tar, as listed in the image config.
pub async fn handle_upload_layer(
    project_id: Uuid,
    diff_id: &str,
    payload: web::Payload,
    hosted: &HostedEvalsData,
    cache: &Cache,
) -> ResponseResult {
    let Some(hosted) = hosted.get_ref() else {
        return Ok(not_enabled());
    };
    if !images::is_digest(diff_id) {
        return Ok(invalid_digests());
    }
    let repository = match hosted.registry.repository(&project_id).await {
        Ok(repository) => repository,
        Err(e) => return Ok(upstream_error("layer upload", e)),
    };
    let (tx, rx) = mpsc::channel(4);
    let (received, stored) = futures_util::join!(
        forward_payload(payload, tx, MAX_LAYER_BYTES),
        images::upload_layer(&repository, cache, &project_id, diff_id, rx)
    );
    if let Err(e) = received {
        return Ok(body_error_response(e));
    }
    Ok(match stored {
        Ok(blob) => HttpResponse::Ok().json(json!({ "digest": blob.digest, "size": blob.size })),
        Err(e) => upstream_error("layer upload", e),
    })
}

/// `{config}` → `{image}`: pushes the image whose layers were uploaded and
/// returns its manifest digest. `409 {missing}` lists layers still to upload.
pub async fn handle_create_image(
    project_id: Uuid,
    req: CreateImageRequest,
    hosted: &HostedEvalsData,
    cache: &Cache,
) -> ResponseResult {
    let Some(hosted) = hosted.get_ref() else {
        return Ok(not_enabled());
    };
    let created = async {
        let repository = hosted.registry.repository(&project_id).await?;
        images::create_image(&repository, cache, &project_id, req.config).await
    }
    .await;
    Ok(match created {
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
        Err(ImageError::Registry(e)) => upstream_error("image push", e),
    })
}

/// `{image, cpus?, memoryGb?, diskGb?}` → `{state: ready | pending | failed}`.
/// Prepares the image for these resources on first call; Harbor's environment
/// class polls it before creating a sandbox from the image.
#[post("/hosted-evals/images/snapshots")]
pub async fn ensure_snapshot(
    req: Json<ImageRequest>,
    project_api_key: ProjectApiKey,
    hosted: HostedEvalsData,
) -> ResponseResult {
    let Some(hosted) = hosted.get_ref() else {
        return Ok(not_enabled());
    };
    if !images::is_digest(&req.image) {
        return Ok(invalid_image());
    }
    Ok(
        match sandboxes::prepare_image(hosted, &project_api_key.project_id, &req).await {
            Ok(state) => HttpResponse::Ok().json(state),
            Err(e) => upstream_error("image preparation", e),
        },
    )
}

// ---- Trial sandboxes (project API key only: Harbor's environment class) ----

/// Same body as `/images/snapshots`, whose state must be `ready`.
#[post("/hosted-evals/sandboxes")]
pub async fn create_sandbox(
    req: Json<ImageRequest>,
    project_api_key: ProjectApiKey,
    hosted: HostedEvalsData,
    cache: web::Data<Cache>,
) -> ResponseResult {
    let Some(hosted) = hosted.get_ref() else {
        return Ok(not_enabled());
    };
    if !images::is_digest(&req.image) {
        return Ok(invalid_image());
    }
    Ok(
        match sandboxes::create_trial(&hosted.provider, &cache, &project_api_key.project_id, &req)
            .await
        {
            Ok(sandbox_id) => HttpResponse::Created().json(json!({ "sandboxId": sandbox_id })),
            Err(e) => create_error_response(e),
        },
    )
}

/// `{state: pending | started | error | destroyed, errorReason?}`.
#[get("/hosted-evals/sandboxes/{sandbox_id}")]
pub async fn get_sandbox(
    path: web::Path<String>,
    project_api_key: ProjectApiKey,
    hosted: HostedEvalsData,
    cache: web::Data<Cache>,
) -> ResponseResult {
    Ok(with_sandbox(
        &hosted,
        &cache,
        &project_api_key,
        &path,
        async |provider, sandbox| {
            Ok(HttpResponse::Ok().json(sandboxes::status(provider, &sandbox).await?))
        },
    )
    .await)
}

#[delete("/hosted-evals/sandboxes/{sandbox_id}")]
pub async fn delete_sandbox(
    path: web::Path<String>,
    project_api_key: ProjectApiKey,
    hosted: HostedEvalsData,
    cache: web::Data<Cache>,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    Ok(with_sandbox(
        &hosted,
        &cache,
        &project_api_key,
        &path,
        async |provider, sandbox| {
            sandboxes::delete(provider, &cache, &project_id, &sandbox.id).await?;
            Ok(HttpResponse::NoContent().finish())
        },
    )
    .await)
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
    hosted: HostedEvalsData,
    cache: web::Data<Cache>,
) -> ResponseResult {
    Ok(with_sandbox(
        &hosted,
        &cache,
        &project_api_key,
        &path,
        async |provider, sandbox| {
            let command_id = provider.start_command(&sandbox, &req.command).await?;
            Ok(HttpResponse::Accepted().json(json!({ "commandId": command_id })))
        },
    )
    .await)
}

/// `{exitCode: null}` while running; `{exitCode, stdout, stderr}` once done.
#[get("/hosted-evals/sandboxes/{sandbox_id}/commands/{command_id}")]
pub async fn get_command(
    path: web::Path<(String, String)>,
    project_api_key: ProjectApiKey,
    hosted: HostedEvalsData,
    cache: web::Data<Cache>,
) -> ResponseResult {
    let (sandbox_id, command_id) = path.into_inner();
    Ok(with_sandbox(
        &hosted,
        &cache,
        &project_api_key,
        &sandbox_id,
        async |provider, sandbox| {
            Ok(
                match provider.command_result(&sandbox, &command_id).await? {
                    Some(result) => HttpResponse::Ok().json(result),
                    None => HttpResponse::NotFound().json(json!({ "error": "Unknown command" })),
                },
            )
        },
    )
    .await)
}

/// Body: the file's raw bytes, written to `?path=` (absolute) in the sandbox.
#[put("/hosted-evals/sandboxes/{sandbox_id}/files")]
pub async fn upload_file(
    path: web::Path<String>,
    query: web::Query<FilePath>,
    payload: web::Payload,
    project_api_key: ProjectApiKey,
    hosted: HostedEvalsData,
    cache: web::Data<Cache>,
) -> ResponseResult {
    if !query.path.starts_with('/') {
        return Ok(relative_path());
    }
    Ok(with_sandbox(
        &hosted,
        &cache,
        &project_api_key,
        &path,
        async move |provider, sandbox| {
            let content = match collect_payload(payload, MAX_FILE_BYTES).await {
                Ok(content) => content,
                Err(e) => return Ok(body_error_response(e)),
            };
            provider.upload_file(&sandbox, &query.path, content).await?;
            Ok(HttpResponse::NoContent().finish())
        },
    )
    .await)
}

#[get("/hosted-evals/sandboxes/{sandbox_id}/files")]
pub async fn download_file(
    path: web::Path<String>,
    query: web::Query<FilePath>,
    project_api_key: ProjectApiKey,
    hosted: HostedEvalsData,
    cache: web::Data<Cache>,
) -> ResponseResult {
    if !query.path.starts_with('/') {
        return Ok(relative_path());
    }
    Ok(with_sandbox(
        &hosted,
        &cache,
        &project_api_key,
        &path,
        async |provider, sandbox| {
            Ok(match provider.download_file(&sandbox, &query.path).await? {
                Some(stream) => HttpResponse::Ok()
                    .content_type("application/octet-stream")
                    .streaming(stream),
                None => HttpResponse::NotFound().json(json!({ "error": "File not found" })),
            })
        },
    )
    .await)
}

// ---- Detached runs (uploads and runs also under /v1/cli) ----

/// Body: the `.tar.gz` of the `evals/` folder's contents, streamed to S3.
#[post("/hosted-evals/uploads")]
pub async fn create_upload(
    payload: web::Payload,
    project_api_key: ProjectApiKey,
    hosted: HostedEvalsData,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_create_upload(project_api_key.project_id, payload, &hosted, &storage).await
}

/// The orchestrator sandbox downloads its run's archive here with the run key.
#[get("/hosted-evals/uploads/{upload_id}")]
pub async fn download_upload(
    path: web::Path<Uuid>,
    project_api_key: ProjectApiKey,
    hosted: HostedEvalsData,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    let Some(bucket) = uploads_bucket(&hosted) else {
        return Ok(not_enabled());
    };
    let key = hosted_evals::archive_key(&project_api_key.project_id, &path);
    let stream = match storage.exists(&bucket, &key).await {
        Ok(true) => storage.get_stream(&bucket, &key).await,
        Ok(false) => {
            return Ok(HttpResponse::NotFound().json(json!({ "error": "Upload not found" })));
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

#[post("/hosted-evals/runs")]
pub async fn start_run(
    req: Json<RunRequest>,
    project_api_key: ProjectApiKey,
    hosted: HostedEvalsData,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    handle_start_run(
        project_api_key.project_id,
        req.into_inner(),
        &hosted,
        &db,
        &cache,
        &storage,
    )
    .await
}

/// Shared by the project-API-key and CLI (`api::v1::cli::hosted_evals`) uploads.
pub async fn handle_create_upload(
    project_id: Uuid,
    payload: web::Payload,
    hosted: &HostedEvalsData,
    storage: &Storage,
) -> ResponseResult {
    let Some(bucket) = uploads_bucket(hosted) else {
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
    Ok(match stored {
        Ok(_) => HttpResponse::Ok().json(json!({ "uploadId": upload_id })),
        Err(e) => upstream_error("archive upload", e),
    })
}

/// Shared by the project-API-key and CLI (`api::v1::cli::hosted_evals`) runs.
pub async fn handle_start_run(
    project_id: Uuid,
    req: RunRequest,
    hosted: &HostedEvalsData,
    db: &DB,
    cache: &Cache,
    storage: &Storage,
) -> ResponseResult {
    let (Some(bucket), Some(hosted)) = (uploads_bucket(hosted), hosted.get_ref()) else {
        return Ok(not_enabled());
    };
    let key = hosted_evals::archive_key(&project_id, &req.upload_id);
    match storage.exists(&bucket, &key).await {
        Ok(true) => {}
        Ok(false) => {
            return Ok(HttpResponse::BadRequest().json(json!({
                "error": "No archive uploaded for this uploadId"
            })));
        }
        Err(e) => return Ok(upstream_error("archive check", e)),
    }

    let sandbox_id =
        match hosted_evals::start_run(&hosted.provider, db, cache, &project_id, &req).await {
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

/// Resolves the caller's sandbox and runs `f` on it. Provider failures become a
/// generic 502 with the details logged.
async fn with_sandbox<F>(
    hosted: &HostedEvalsData,
    cache: &Cache,
    project_api_key: &ProjectApiKey,
    sandbox_id: &str,
    f: F,
) -> HttpResponse
where
    F: AsyncFnOnce(&SandboxProvider, SandboxHandle) -> anyhow::Result<HttpResponse>,
{
    let Some(hosted) = hosted.get_ref() else {
        return not_enabled();
    };
    let provider = &hosted.provider;
    let result = async {
        match sandboxes::resolve(provider, cache, &project_api_key.project_id, sandbox_id).await? {
            Some(sandbox) => f(provider, sandbox).await,
            None => Ok(HttpResponse::NotFound().json(json!({ "error": "Sandbox not found" }))),
        }
    }
    .await;
    result.unwrap_or_else(|e| upstream_error("sandbox call", e))
}

/// Pumps `payload` into `tx` up to `max_bytes`. Any failure sends an `Err`
/// down the channel so the upload aborts instead of storing a partial object.
async fn forward_payload<S>(
    mut payload: S,
    tx: Sender<anyhow::Result<Bytes>>,
    max_bytes: u64,
) -> Result<(), BodyError>
where
    S: Stream<Item = Result<Bytes, PayloadError>> + Unpin,
{
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

async fn collect_payload<S>(mut payload: S, max_bytes: u64) -> Result<Bytes, BodyError>
where
    S: Stream<Item = Result<Bytes, PayloadError>> + Unpin,
{
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
        CreateError::ImageNotReady => HttpResponse::Conflict().json(json!({
            "error": "The image isn't ready for these resources; \
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
        CreateError::Upstream(e) => upstream_error("sandbox creation", e),
    }
}

/// The sandbox provider, registry or S3 failed. Their errors can carry upstream
/// response bodies, so the client only gets a generic message.
fn upstream_error(operation: &str, error: anyhow::Error) -> HttpResponse {
    log::error!("Hosted evals {operation} failed: {error:?}");
    HttpResponse::build(StatusCode::BAD_GATEWAY).json(json!({
        "error": format!("Hosted evals {operation} failed upstream. Retry shortly.")
    }))
}

fn uploads_bucket(hosted: &HostedEvalsData) -> Option<String> {
    if hosted.get_ref().is_none() || !is_feature_enabled(Feature::Storage) {
        return None;
    }
    env::optional_string(env::storage::S3_EXPORTS_BUCKET)
}

fn not_enabled() -> HttpResponse {
    HttpResponse::NotFound().json(json!({
        "error": "Hosted evals are not enabled on this deployment"
    }))
}

fn invalid_digests() -> HttpResponse {
    HttpResponse::BadRequest().json(json!({
        "error": format!("Expected sha256:<64 hex> digests, at most {MAX_LAYERS}")
    }))
}

fn invalid_image() -> HttpResponse {
    HttpResponse::BadRequest().json(json!({
        "error": "image must be a sha256 manifest digest"
    }))
}

fn relative_path() -> HttpResponse {
    HttpResponse::BadRequest().json(json!({ "error": "path must be absolute" }))
}

#[cfg(test)]
mod tests {
    use futures_util::stream;

    use super::*;

    fn chunks(sizes: &[usize]) -> impl Stream<Item = Result<Bytes, PayloadError>> + Unpin {
        stream::iter(
            sizes
                .iter()
                .map(|n| Ok(Bytes::from(vec![0u8; *n])))
                .collect::<Vec<_>>(),
        )
    }

    #[tokio::test]
    async fn forward_payload_caps_the_body_and_aborts_the_upload() {
        let (tx, mut rx) = mpsc::channel(8);
        let result = forward_payload(chunks(&[4, 4, 4]), tx, 10).await;
        assert!(matches!(result, Err(BodyError::TooLarge(10))));
        assert!(rx.recv().await.unwrap().is_ok());
        assert!(rx.recv().await.unwrap().is_ok());
        assert!(rx.recv().await.unwrap().is_err());

        let (tx, mut rx) = mpsc::channel(8);
        assert!(forward_payload(chunks(&[5, 5]), tx, 10).await.is_ok());
        assert!(rx.recv().await.unwrap().is_ok());
        assert!(rx.recv().await.unwrap().is_ok());
        assert!(rx.recv().await.is_none());

        let (tx, mut rx) = mpsc::channel(8);
        let result = forward_payload(chunks(&[]), tx, 10).await;
        assert!(matches!(result, Err(BodyError::Empty)));
        assert!(rx.recv().await.unwrap().is_err());
    }

    #[tokio::test]
    async fn collect_payload_caps_the_body() {
        assert_eq!(collect_payload(chunks(&[3, 3]), 6).await.unwrap().len(), 6);
        assert!(matches!(
            collect_payload(chunks(&[3, 4]), 6).await,
            Err(BodyError::TooLarge(6))
        ));
    }
}
