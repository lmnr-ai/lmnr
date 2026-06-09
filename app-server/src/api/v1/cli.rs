use actix_web::{HttpResponse, get, web};
use serde_json::json;

use crate::auth::cli_user::CliUser;
use crate::db::project_api_keys::ProjectApiKey;
use crate::db::{self, DB};

/// `GET /v1/cli/projects` — workspaces + projects the authenticated user can
/// access. User-scoped (no project header); authed by `cli_user_jwt_validator`.
/// Lets the CLI discover and select a project after `login`.
#[get("")]
pub async fn list_projects(user: CliUser, db: web::Data<DB>) -> actix_web::Result<HttpResponse> {
    let projects = db::projects::get_projects_for_user(&db.pool, &user.user_id)
        .await
        .map_err(actix_web::error::ErrorInternalServerError)?;
    Ok(HttpResponse::Ok().json(json!({ "projects": projects })))
}

/// `GET /v1/cli/whoami` — returns the project id behind the supplied project API
/// key. Project-API-key authed (NOT the CLI user JWT), so it lives outside the
/// `/v1/cli` JWT scope. The CLI uses this to check whether an
/// `LMNR_PROJECT_API_KEY` already in the environment belongs to the selected
/// project. Full path on the macro so it can mount under a project-key scope.
#[get("/cli/whoami")]
pub async fn whoami(key: ProjectApiKey) -> actix_web::Result<HttpResponse> {
    Ok(HttpResponse::Ok().json(json!({ "projectId": key.project_id })))
}
