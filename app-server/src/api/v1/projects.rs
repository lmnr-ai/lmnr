use actix_web::{HttpResponse, get};
use serde_json::json;

use crate::db::project_api_keys::ProjectApiKey;

// /v1/project
/// Returns the project id behind the supplied project API key. Mounted under a
/// dedicated ingestion-authed scope so `lmnr-cli setup` can probe it with an
/// ingest-only key. Generic project endpoint, not CLI-specific.
#[get("")]
pub async fn get_current_project(
    project_api_key: ProjectApiKey,
) -> actix_web::Result<HttpResponse> {
    Ok(HttpResponse::Ok().json(json!({ "projectId": project_api_key.project_id })))
}
