use std::{sync::Arc, time::Duration};

use actix_web::{
    HttpResponse, post,
    web::{self, Json},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::{
    db::{DB, project_api_keys::ProjectApiKey},
    env,
    features::{Feature, is_feature_enabled},
    hosted_evals::{self, RunOptions},
    routes::types::ResponseResult,
    storage::{Storage, StorageTrait},
};

const UPLOAD_URL_TTL: Duration = Duration::from_secs(15 * 60);
// The orchestrator downloads the archive right after it starts.
const DOWNLOAD_URL_TTL: Duration = Duration::from_secs(60 * 60);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateUploadResponse {
    upload_id: Uuid,
    /// Presigned URL to `PUT` the `.tar.gz` of the `evals/` folder to.
    url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartRunRequest {
    upload_id: Uuid,
    #[serde(flatten)]
    options: RunOptions,
}

#[post("/hosted-evals/uploads")]
pub async fn create_upload(
    project_api_key: ProjectApiKey,
    storage: web::Data<Arc<Storage>>,
) -> ResponseResult {
    let Some(bucket) = hosted_evals_bucket() else {
        return Ok(not_enabled());
    };
    let upload_id = Uuid::new_v4();
    let key = hosted_evals::archive_key(&project_api_key.project_id, &upload_id);
    let url = storage
        .presigned_put_url(&bucket, &key, UPLOAD_URL_TTL)
        .await?;
    Ok(HttpResponse::Ok().json(CreateUploadResponse { upload_id, url }))
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
