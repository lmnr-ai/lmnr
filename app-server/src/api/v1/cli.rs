use actix_web::{HttpResponse, get, web};
use serde_json::json;

use crate::auth::cli_user::CliUser;
use crate::db::project_api_keys::ProjectApiKey;
use crate::db::{self, DB};

/// `GET /v1/cli/projects` — user-scoped project discovery (authed by `cli_user_jwt_validator`).
#[get("")]
pub async fn list_projects(user: CliUser, db: web::Data<DB>) -> actix_web::Result<HttpResponse> {
    let projects = db::projects::get_projects_for_user(&db.pool, &user.user_id)
        .await
        .map_err(actix_web::error::ErrorInternalServerError)?;
    Ok(HttpResponse::Ok().json(json!({ "projects": projects })))
}

/// `GET /v1/cli/whoami` — returns the project id behind the supplied project API key (project-key authed).
#[get("/cli/whoami")]
pub async fn whoami(key: ProjectApiKey) -> actix_web::Result<HttpResponse> {
    Ok(HttpResponse::Ok().json(json!({ "projectId": key.project_id })))
}
