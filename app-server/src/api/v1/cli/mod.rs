//! CLI user-token surface (`/v1/cli/*`). Handlers resolve auth via the
//! `CliUserAuth` / `CliProjectAuth` extractors (see `auth::cli_user`) and call
//! the same service/db helpers as the project-API-key handlers.

pub mod datasets;
pub mod rollouts;
pub mod sql;
pub mod traces;

use actix_web::{HttpResponse, get, web};
use serde_json::json;

use crate::auth::cli_user::CliUserAuth;
use crate::db::{self, DB};

/// `GET /v1/cli/projects` — user-scoped project discovery (no project to authorize, so `CliUserAuth`).
#[get("projects")]
pub async fn list_projects(user: CliUserAuth, db: web::Data<DB>) -> actix_web::Result<HttpResponse> {
    let projects = db::projects::get_projects_for_user(&db.pool, &user.user_id)
        .await
        .map_err(actix_web::error::ErrorInternalServerError)?;
    Ok(HttpResponse::Ok().json(json!({ "projects": projects })))
}
