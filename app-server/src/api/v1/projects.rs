use actix_web::{HttpResponse, get};
use serde_json::json;

use crate::auth::ProjectAuthContext;

/// `GET /v1/project` — returns the project id behind the supplied project API key
/// (project-key authed). Generic project endpoint, not CLI-specific.
#[get("/project")]
pub async fn get_current_project(project_auth_ctx: ProjectAuthContext) -> actix_web::Result<HttpResponse> {
    Ok(HttpResponse::Ok().json(json!({ "projectId": project_auth_ctx.project_id })))
}
