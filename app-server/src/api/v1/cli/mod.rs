//! CLI user-token surface (`/v1/cli/*`).
//!
//! Thin handlers that resolve auth via the `CliUserAuth` / `CliProjectAuth`
//! extractors (see `auth::cli_user`) and delegate to the SAME helper functions
//! the project-API-key handlers use (`api::v1::{sql, datasets, traces_metadata}`).
//! The only difference between a CLI handler and its `/v1` counterpart is the
//! auth extractor type — the work lives in the shared `run_*` helpers.

pub mod datasets;
pub mod rollouts;
pub mod sql;
pub mod traces;

use actix_web::{HttpResponse, get, web};
use serde_json::json;

use crate::auth::cli_user::CliUserAuth;
use crate::db::{self, DB};

/// `GET /v1/cli/projects` — user-scoped project discovery. Takes `CliUserAuth`
/// (identity only): there is no project to authorize against at discovery time,
/// so this is the one CLI route that does NOT use `CliProjectAuth`.
#[get("projects")]
pub async fn list_projects(user: CliUserAuth, db: web::Data<DB>) -> actix_web::Result<HttpResponse> {
    let projects = db::projects::get_projects_for_user(&db.pool, &user.user_id)
        .await
        .map_err(actix_web::error::ErrorInternalServerError)?;
    Ok(HttpResponse::Ok().json(json!({ "projects": projects })))
}
