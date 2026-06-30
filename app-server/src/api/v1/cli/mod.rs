//! CLI user-token surface (`/v1/cli/*`). Handlers resolve auth via the
//! `CliUserAuth` / `CliProjectAuth` extractors (see `auth::cli_user`) and call
//! the same service/db helpers as the project-API-key handlers.

// The agent twin depends on `crate::agent`, which is signals-gated.
#[cfg(feature = "signals")]
pub mod agent;
pub mod datasets;
pub mod rollouts;
pub mod sql;
pub mod traces;

use actix_web::{HttpResponse, get, post, web};
use serde_json::json;

use crate::api::utils::get_api_key_from_raw_value;
use crate::auth::cli_user::{CliUserAuth, is_user_member_of_project};
use crate::cache::Cache;
use crate::db::{self, DB};

/// `GET /v1/cli/projects` — user-scoped project discovery (no project to authorize, so `CliUserAuth`).
#[get("projects")]
pub async fn list_projects(
    user: CliUserAuth,
    db: web::Data<DB>,
) -> actix_web::Result<HttpResponse> {
    let projects = db::projects::get_projects_for_user(&db.pool, &user.user_id)
        .await
        .map_err(actix_web::error::ErrorInternalServerError)?;
    Ok(HttpResponse::Ok().json(json!({ "projects": projects })))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveProjectRequest {
    api_key: String,
}

/// `POST /v1/cli/project` — resolve which project a project API key belongs to.
/// User-token authed (`CliUserAuth`): by the time the CLI calls this it has
/// logged in, so it identifies the user and passes the project key in the body
/// (not in `Authorization`, which carries the user JWT). The key is verified by
/// `get_api_key_from_raw_value` and the caller is membership-checked against the
/// resolved project so a leaked key can't reveal a project the user can't access.
#[post("project")]
pub async fn resolve_project(
    user: CliUserAuth,
    body: web::Json<ResolveProjectRequest>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
) -> actix_web::Result<HttpResponse> {
    let cache = cache.into_inner();
    let api_key = get_api_key_from_raw_value(&db.pool, cache.clone(), body.into_inner().api_key)
        .await
        .map_err(|_| actix_web::error::ErrorUnauthorized("invalid project API key"))?;

    let is_member = is_user_member_of_project(&db.pool, &cache, user.user_id, api_key.project_id)
        .await
        .map_err(actix_web::error::ErrorInternalServerError)?;
    if !is_member {
        return Err(actix_web::error::ErrorForbidden(
            "user is not a member of the project",
        ));
    }

    Ok(HttpResponse::Ok().json(json!({ "projectId": api_key.project_id })))
}
