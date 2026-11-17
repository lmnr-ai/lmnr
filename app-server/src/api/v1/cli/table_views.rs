//! CLI saved table view writes, forwarded through `crate::table_views`. Reads go through SQL
//! (`table_views`).

use actix_web::{HttpRequest, HttpResponse, delete, patch, post, web};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::audit;
use crate::auth::cli_user::CliProjectAuth;
use crate::next_api::NextApiError;
use crate::table_views;

type ViewResult = Result<HttpResponse, NextApiError>;

/// The frontend answers with the view row.
fn target_view(req: &HttpRequest, view: &Value) {
    if let Some(id) = view.get("id").and_then(Value::as_str) {
        let name = view.get("name").and_then(Value::as_str).map(str::to_string);
        audit::target_named(req, id, name);
    }
}

#[post("views")]
pub async fn create_view(
    req: HttpRequest,
    auth: CliProjectAuth,
    body: web::Json<Value>,
    http_client: web::Data<reqwest::Client>,
) -> ViewResult {
    let view = table_views::create_view(&http_client, auth.project_id, body.into_inner()).await?;
    target_view(&req, &view);
    Ok(HttpResponse::Ok().json(view))
}

#[patch("views/{view_id}")]
pub async fn update_view(
    req: HttpRequest,
    auth: CliProjectAuth,
    path: web::Path<Uuid>,
    body: web::Json<Value>,
    http_client: web::Data<reqwest::Client>,
) -> ViewResult {
    let body = body.into_inner();
    if let Some(is_default) = body.get("isDefault").and_then(Value::as_bool) {
        audit::metadata(&req, "isDefault", is_default);
    }
    let view =
        table_views::update_view(&http_client, auth.project_id, path.into_inner(), body).await?;
    target_view(&req, &view);
    Ok(HttpResponse::Ok().json(view))
}

#[delete("views/{view_id}")]
pub async fn delete_view(
    req: HttpRequest,
    auth: CliProjectAuth,
    path: web::Path<Uuid>,
    http_client: web::Data<reqwest::Client>,
) -> ViewResult {
    let view_id = path.into_inner();
    audit::target(&req, [view_id]).await;
    table_views::delete_view(&http_client, auth.project_id, view_id).await?;
    Ok(HttpResponse::Ok().json(json!({ "id": view_id, "deleted": true })))
}
