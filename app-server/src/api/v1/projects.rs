use actix_web::HttpResponse;
use serde_json::json;

use crate::db::project_api_keys::ProjectApiKey;

/// `GET /v1/project` — returns the project id behind the supplied project API key.
/// Registered manually (not via attribute macro) so main.rs can mount it under a
/// dedicated ingestion-authed scope; `lmnr-cli setup` probes it with an
/// ingest-only key. Generic project endpoint, not CLI-specific.
pub async fn get_current_project(
    project_api_key: ProjectApiKey,
) -> actix_web::Result<HttpResponse> {
    Ok(HttpResponse::Ok().json(json!({ "projectId": project_api_key.project_id })))
}
