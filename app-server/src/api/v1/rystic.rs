//! `/v1/hosted-evals/rystic/*`: what Rystic simulators in trial sandboxes send
//! to Rystic, forwarded with Laminar's key (`hosted_evals::rystic`). The caller
//! authenticates with its trial's token, not a project API key, so this scope
//! sits outside `project_auth`.

use actix_web::{
    HttpRequest, HttpResponse,
    http::{StatusCode, header},
    post, web,
};
use bytes::Bytes;
use serde_json::json;

use super::payload::upstream_error;
use crate::{
    cache::Cache,
    hosted_evals::rystic::{self, LicenseCheck, RysticCall},
};

/// Simulators send small JSON bodies (under 1 KiB).
const MAX_BODY_BYTES: usize = 64 * 1024;

/// The simulator download: answers with a short-lived asset URL, which the
/// trial then fetches directly.
#[post("/download")]
pub async fn download(
    req: HttpRequest,
    body: Bytes,
    cache: web::Data<Cache>,
    client: web::Data<reqwest::Client>,
) -> HttpResponse {
    proxy(&req, body, &cache, &client, RysticCall::Download).await
}

/// The simulator's license check-ins: `register` at start, `heartbeat` every
/// 30 s, `close` on exit.
#[post("/license-check/v1/{check}")]
pub async fn license_check(
    req: HttpRequest,
    path: web::Path<String>,
    body: Bytes,
    cache: web::Data<Cache>,
    client: web::Data<reqwest::Client>,
) -> HttpResponse {
    let Some(check) = LicenseCheck::parse(&path) else {
        return HttpResponse::NotFound().finish();
    };
    proxy(&req, body, &cache, &client, RysticCall::LicenseCheck(check)).await
}

async fn proxy(
    req: &HttpRequest,
    body: Bytes,
    cache: &Cache,
    client: &reqwest::Client,
    call: RysticCall,
) -> HttpResponse {
    let Some(api_key) = rystic::api_key() else {
        return HttpResponse::NotFound().json(json!({
            "error": "Rystic simulators are not enabled on this deployment"
        }));
    };
    if body.len() > MAX_BODY_BYTES {
        return HttpResponse::PayloadTooLarge().finish();
    }
    let authorization = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok());
    // Rystic's error shape, so the CLI reports a rejected key the way it would
    // for Rystic itself.
    let (token_hash, _project_id) = match rystic::authorize(cache, authorization).await {
        Ok(Some(grant)) => grant,
        Ok(None) => {
            return HttpResponse::Unauthorized().json(json!({ "error": "invalid_token" }));
        }
        Err(e) => return upstream_error("Rystic", "token check", e),
    };
    if matches!(call, RysticCall::LicenseCheck(LicenseCheck::Register)) {
        match rystic::count_registration(cache, &token_hash).await {
            Ok(true) => {}
            Ok(false) => {
                return HttpResponse::TooManyRequests().json(json!({
                    "error": "too_many_simulators",
                    "message": "This trial has started the most Rystic simulators it may."
                }));
            }
            Err(e) => return upstream_error("Rystic", "registration count", e),
        }
    }
    let content_type = req
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok());
    match rystic::forward(client, &api_key, &call, content_type, body).await {
        Ok(response) => {
            let status = StatusCode::from_u16(response.status).unwrap_or(StatusCode::BAD_GATEWAY);
            let mut builder = HttpResponse::build(status);
            if let Some(content_type) = response.content_type {
                builder.insert_header((header::CONTENT_TYPE, content_type));
            }
            builder.body(response.body)
        }
        Err(e) => upstream_error("Rystic", "request", e),
    }
}
