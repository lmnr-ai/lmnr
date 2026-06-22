use actix_web::{HttpResponse, get};
use serde_json::json;

use crate::db::project_api_keys::ProjectApiKey;

/// `GET /v1/project` — returns the project id behind the supplied project API key
/// (project-key authed). Generic project endpoint, not CLI-specific.
#[get("/project")]
pub async fn get_current_project(
    project_api_key: ProjectApiKey,
) -> actix_web::Result<HttpResponse> {
    Ok(HttpResponse::Ok().json(json!({ "projectId": project_api_key.project_id })))
}
