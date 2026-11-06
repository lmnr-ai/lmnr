//! CLI alert writes, forwarded through `crate::alerts` as the authorized CLI user. Reads go through
//! SQL (`alerts`, `alert_targets`, `alert_filters`).

use actix_web::{HttpRequest, HttpResponse, delete, patch, post, web};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::alerts;
use crate::audit;
use crate::auth::cli_user::CliProjectAuth;
use crate::next_api::NextApiError;

type AlertResult = Result<HttpResponse, NextApiError>;

/// The frontend answers with the alert row.
fn target_alert(req: &HttpRequest, alert: &Value) {
    if let Some(id) = alert.get("id").and_then(Value::as_str) {
        let name = alert
            .get("name")
            .and_then(Value::as_str)
            .map(str::to_string);
        audit::target_named(req, id, name);
    }
}

#[post("alerts")]
pub async fn create_alert(
    req: HttpRequest,
    auth: CliProjectAuth,
    body: web::Json<Value>,
    http_client: web::Data<reqwest::Client>,
) -> AlertResult {
    let alert = alerts::create_alert(
        &http_client,
        auth.project_id,
        auth.user_id,
        body.into_inner(),
    )
    .await?;
    target_alert(&req, &alert);
    Ok(HttpResponse::Ok().json(alert))
}

#[patch("alerts/{alert_id}")]
pub async fn update_alert(
    req: HttpRequest,
    auth: CliProjectAuth,
    path: web::Path<Uuid>,
    body: web::Json<Value>,
    http_client: web::Data<reqwest::Client>,
) -> AlertResult {
    let alert = alerts::update_alert(
        &http_client,
        auth.project_id,
        auth.user_id,
        path.into_inner(),
        body.into_inner(),
    )
    .await?;
    target_alert(&req, &alert);
    Ok(HttpResponse::Ok().json(alert))
}

#[delete("alerts/{alert_id}")]
pub async fn delete_alert(
    req: HttpRequest,
    auth: CliProjectAuth,
    path: web::Path<Uuid>,
    http_client: web::Data<reqwest::Client>,
) -> AlertResult {
    let alert_id = path.into_inner();
    audit::target(&req, [alert_id]).await;
    alerts::delete_alert(&http_client, auth.project_id, auth.user_id, alert_id).await?;
    Ok(HttpResponse::Ok().json(json!({ "id": alert_id, "deleted": true })))
}
