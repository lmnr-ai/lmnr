//! CLI alert writes; reads go through SQL (`alerts`, `alert_targets`, `alert_filters`). The
//! frontend is the only alert writer (`lib/actions/alerts`), so these handlers forward to its
//! `/api/internal/projects/{project_id}/alerts` routes as the authorized CLI user.

use actix_web::{HttpResponse, delete, http::StatusCode, patch, post, web};
use reqwest::Method;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::auth::cli_user::CliProjectAuth;
use crate::next_api::{self, NextApiError};
use crate::routes::types::ResponseResult;

async fn forward(
    auth: &CliProjectAuth,
    http_client: &reqwest::Client,
    method: Method,
    alert_id: Option<Uuid>,
    body: Option<web::Bytes>,
) -> ResponseResult {
    let body = match body
        .map(|b| serde_json::from_slice::<Value>(&b))
        .transpose()
    {
        Ok(body) => body,
        Err(e) => {
            return Ok(HttpResponse::BadRequest()
                .json(json!({ "error": format!("Request body must be JSON: {e}") })));
        }
    };
    let path = match alert_id {
        Some(alert_id) => format!("alerts/{alert_id}"),
        None => "alerts".to_string(),
    };

    match next_api::call_as::<Value>(
        http_client,
        method,
        auth.project_id,
        auth.user_id,
        &path,
        body,
    )
    .await
    {
        Ok(value) => Ok(HttpResponse::Ok().json(value)),
        Err(NextApiError::Status { status, message }) if status < 500 => Ok(HttpResponse::build(
            StatusCode::from_u16(status).unwrap_or(StatusCode::BAD_REQUEST),
        )
        .json(json!({ "error": message }))),
        Err(e) => {
            log::error!("Alert write failed: {e:?}");
            Ok(HttpResponse::InternalServerError()
                .json(json!({ "error": "Internal server error" })))
        }
    }
}

#[post("alerts")]
pub async fn create_alert(
    auth: CliProjectAuth,
    body: web::Bytes,
    http_client: web::Data<reqwest::Client>,
) -> ResponseResult {
    forward(&auth, &http_client, Method::POST, None, Some(body)).await
}

#[patch("alerts/{alert_id}")]
pub async fn update_alert(
    auth: CliProjectAuth,
    path: web::Path<Uuid>,
    body: web::Bytes,
    http_client: web::Data<reqwest::Client>,
) -> ResponseResult {
    let alert_id = Some(path.into_inner());
    forward(&auth, &http_client, Method::PATCH, alert_id, Some(body)).await
}

#[delete("alerts/{alert_id}")]
pub async fn delete_alert(
    auth: CliProjectAuth,
    path: web::Path<Uuid>,
    http_client: web::Data<reqwest::Client>,
) -> ResponseResult {
    let alert_id = Some(path.into_inner());
    forward(&auth, &http_client, Method::DELETE, alert_id, None).await
}
