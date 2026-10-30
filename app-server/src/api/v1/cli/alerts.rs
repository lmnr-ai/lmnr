//! CLI alert writes; reads go through SQL (`alerts`, `alert_targets`, `alert_filters`). The
//! frontend is the only alert writer (`lib/actions/alerts`), so these handlers forward to its
//! `/api/cli/projects/{project_id}/alerts` routes. The caller's bearer token is passed through
//! and the frontend verifies it again, because those routes are public.

use actix_web::{HttpRequest, HttpResponse, delete, http::StatusCode, patch, post, web};
use reqwest::Method;
use serde_json::json;
use uuid::Uuid;

use crate::auth::cli_user::CliProjectAuth;
use crate::env::notifications::next_server_url;
use crate::routes::types::ResponseResult;

async fn forward(
    req: &HttpRequest,
    auth: &CliProjectAuth,
    http_client: &reqwest::Client,
    method: Method,
    alert_id: Option<Uuid>,
    body: Option<web::Bytes>,
) -> ResponseResult {
    let Some(base) = next_server_url() else {
        log::error!("NEXT_INTERNAL_URL/NEXT_PUBLIC_URL unset; can't reach the frontend for alerts");
        return Ok(HttpResponse::InternalServerError().json(
            json!({ "error": "Alerts are unavailable: the frontend URL isn't configured" }),
        ));
    };
    let mut url = format!("{base}/api/cli/projects/{}/alerts", auth.project_id);
    if let Some(alert_id) = alert_id {
        url.push_str(&format!("/{alert_id}"));
    }

    let mut request = http_client.request(method, url);
    if let Some(authorization) = req.headers().get(actix_web::http::header::AUTHORIZATION) {
        request = request.header(reqwest::header::AUTHORIZATION, authorization.as_bytes());
    }
    if let Some(body) = body {
        request = request
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .body(body);
    }

    let response = match request.send().await {
        Ok(response) => response,
        Err(e) => {
            log::error!("Alerts request to the frontend failed: {e:?}");
            return Ok(HttpResponse::BadGateway()
                .json(json!({ "error": "Couldn't reach the frontend to manage alerts" })));
        }
    };
    let status = StatusCode::from_u16(response.status().as_u16())
        .unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
    let body = response
        .bytes()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to read the frontend's alerts response: {e}"))?;
    Ok(HttpResponse::build(status)
        .content_type("application/json")
        .body(body))
}

#[post("alerts")]
pub async fn create_alert(
    req: HttpRequest,
    auth: CliProjectAuth,
    body: web::Bytes,
    http_client: web::Data<reqwest::Client>,
) -> ResponseResult {
    forward(&req, &auth, &http_client, Method::POST, None, Some(body)).await
}

#[patch("alerts/{alert_id}")]
pub async fn update_alert(
    req: HttpRequest,
    auth: CliProjectAuth,
    path: web::Path<Uuid>,
    body: web::Bytes,
    http_client: web::Data<reqwest::Client>,
) -> ResponseResult {
    let alert_id = Some(path.into_inner());
    forward(
        &req,
        &auth,
        &http_client,
        Method::PATCH,
        alert_id,
        Some(body),
    )
    .await
}

#[delete("alerts/{alert_id}")]
pub async fn delete_alert(
    req: HttpRequest,
    auth: CliProjectAuth,
    path: web::Path<Uuid>,
    http_client: web::Data<reqwest::Client>,
) -> ResponseResult {
    let alert_id = Some(path.into_inner());
    forward(&req, &auth, &http_client, Method::DELETE, alert_id, None).await
}
