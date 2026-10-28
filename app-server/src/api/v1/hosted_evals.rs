use std::{sync::Arc, time::Duration};

use actix_web::{
    HttpResponse,
    error::PayloadError,
    post,
    web::{self, Json},
};
use anyhow::anyhow;
use bytes::Bytes;
use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::json;
use tokio::sync::mpsc::{self, Sender};
use uuid::Uuid;

use crate::{
    db::{DB, project_api_keys::ProjectApiKey},
    env,
    features::{Feature, is_feature_enabled},
    hosted_evals::{self, RunOptions},
    routes::types::ResponseResult,
    storage::{Storage, StorageTrait},
};

// The streamed archive isn't covered by the global HTTP payload limit, so it gets its own.
const MAX_ARCHIVE_BYTES: u64 = 100 * 1024 * 1024;
// The orchestrator downloads the archive right after it starts.
const DOWNLOAD_URL_TTL: Duration = Duration::from_secs(60 * 60);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartRunRequest {
    upload_id: Uuid,
    #[serde(flatten)]
    options: RunOptions,
}

enum ArchiveError {
    Empty,
    TooLarge,
    Payload(PayloadError),
}

/// Body: the `.tar.gz` of the `evals/` folder's contents, streamed to S3.
#[post("/hosted-evals/uploads")]
pub async fn create_upload(
    payload: web::Payload,
    project_api_key: ProjectApiKey,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    let Some(bucket) = hosted_evals_bucket() else {
        return Ok(not_enabled());
    };
    let upload_id = Uuid::new_v4();
    let key = hosted_evals::archive_key(&project_api_key.project_id, &upload_id);

    // `web::Payload` isn't `Send`, so it's pumped through a channel the upload reads.
    let (tx, rx) = mpsc::channel(4);
    let (received, stored) = futures_util::join!(
        forward_archive(payload, tx),
        storage.upload_stream(&bucket, &key, rx)
    );
    match received {
        Ok(()) => {}
        Err(ArchiveError::Empty) => {
            return Ok(HttpResponse::BadRequest().json(json!({ "error": "Empty archive" })));
        }
        Err(ArchiveError::TooLarge) => {
            return Ok(HttpResponse::PayloadTooLarge().json(json!({
                "error": format!("Archive exceeds {MAX_ARCHIVE_BYTES} bytes")
            })));
        }
        Err(ArchiveError::Payload(e)) => {
            return Ok(HttpResponse::BadRequest().json(json!({
                "error": format!("Failed to read archive: {e}")
            })));
        }
    }
    stored?;

    Ok(HttpResponse::Ok().json(json!({ "uploadId": upload_id })))
}

async fn forward_archive(
    mut payload: web::Payload,
    tx: Sender<anyhow::Result<Bytes>>,
) -> Result<(), ArchiveError> {
    let mut size = 0;
    let result = loop {
        match payload.next().await {
            None if size == 0 => break Err(ArchiveError::Empty),
            None => break Ok(()),
            Some(Err(e)) => break Err(ArchiveError::Payload(e)),
            Some(Ok(chunk)) => {
                size += chunk.len() as u64;
                if size > MAX_ARCHIVE_BYTES {
                    break Err(ArchiveError::TooLarge);
                }
                // A closed channel means the upload already failed and reports why.
                if tx.send(Ok(chunk)).await.is_err() {
                    break Ok(());
                }
            }
        }
    };
    if result.is_err() {
        // Makes the upload abort instead of storing a partial archive.
        let _ = tx.send(Err(anyhow!("archive upload aborted"))).await;
    }
    result
}

#[post("/hosted-evals/runs")]
pub async fn start_run(
    req: Json<StartRunRequest>,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
    storage: web::Data<Arc<Storage>>,
    http_client: web::Data<reqwest::Client>,
) -> ResponseResult {
    let Some(bucket) = hosted_evals_bucket() else {
        return Ok(not_enabled());
    };
    let req = req.into_inner();
    let project_id = project_api_key.project_id;
    let key = hosted_evals::archive_key(&project_id, &req.upload_id);
    if storage.get_size(&bucket, &key).await.is_err() {
        return Ok(HttpResponse::BadRequest().json(json!({
            "error": "No archive uploaded for this uploadId"
        })));
    }
    let archive_url = storage
        .presigned_get_url(&bucket, &key, DOWNLOAD_URL_TTL)
        .await?;

    let sandbox_id =
        hosted_evals::start_run(&http_client, &db, &project_id, &archive_url, &req.options).await?;
    log::info!("Started hosted eval run for project {project_id} in sandbox {sandbox_id}");

    Ok(HttpResponse::Accepted().json(json!({ "sandboxId": sandbox_id })))
}

fn hosted_evals_bucket() -> Option<String> {
    if !is_feature_enabled(Feature::HostedEvals) {
        return None;
    }
    std::env::var(env::storage::S3_EXPORTS_BUCKET).ok()
}

fn not_enabled() -> HttpResponse {
    HttpResponse::NotFound().json(json!({
        "error": "Hosted evals are not enabled on this deployment"
    }))
}
