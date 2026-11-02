//! CLI alert writes; reads go through SQL (`alerts`, `alert_targets`, `alert_filters`). The
//! frontend is the only alert writer (`lib/actions/alerts`), so these handlers forward to its
//! `/api/internal/projects/{project_id}/alerts` routes as the authorized CLI user.

use actix_web::{HttpResponse, delete, patch, post, web};
use reqwest::Method;
use serde_json::Value;
use uuid::Uuid;

use crate::auth::cli_user::CliProjectAuth;
use crate::next_api::{self, NextApiError};

type AlertResult = Result<HttpResponse, NextApiError>;

#[post("alerts")]
pub async fn create_alert(
    auth: CliProjectAuth,
    body: web::Json<Value>,
    http_client: web::Data<reqwest::Client>,
) -> AlertResult {
    let alert: Value = next_api::call_as(
        &http_client,
        Method::POST,
        auth.project_id,
        auth.user_id,
        "alerts",
        Some(body.into_inner()),
    )
    .await?;
    Ok(HttpResponse::Ok().json(alert))
}

#[patch("alerts/{alert_id}")]
pub async fn update_alert(
    auth: CliProjectAuth,
    path: web::Path<Uuid>,
    body: web::Json<Value>,
    http_client: web::Data<reqwest::Client>,
) -> AlertResult {
    let path = format!("alerts/{}", path.into_inner());
    let alert: Value = next_api::call_as(
        &http_client,
        Method::PATCH,
        auth.project_id,
        auth.user_id,
        &path,
        Some(body.into_inner()),
    )
    .await?;
    Ok(HttpResponse::Ok().json(alert))
}

#[delete("alerts/{alert_id}")]
pub async fn delete_alert(
    auth: CliProjectAuth,
    path: web::Path<Uuid>,
    http_client: web::Data<reqwest::Client>,
) -> AlertResult {
    let path = format!("alerts/{}", path.into_inner());
    let deleted: Value = next_api::call_as(
        &http_client,
        Method::DELETE,
        auth.project_id,
        auth.user_id,
        &path,
        None,
    )
    .await?;
    Ok(HttpResponse::Ok().json(deleted))
}
