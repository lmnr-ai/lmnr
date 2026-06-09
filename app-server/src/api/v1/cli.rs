use actix_web::{HttpResponse, get, web};
use serde_json::json;

use crate::auth::cli_user::CliUser;
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
