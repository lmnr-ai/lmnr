//! CLI workspace LLM profile CRUD. Auth via `CliProjectAuth`; the caller's
//! project resolves to a workspace and the shared `api::v1::llm_profiles::handlers`
//! do the rest. Any workspace member may write, matching the signals CLI.
//! Profiles back the playground everywhere, so these routes are not Cloud-gated;
//! only pinning a profile on a signal is (`Feature::SignalLlmProfiles`).

use actix_web::{HttpResponse, delete, get, patch, post, web};
use uuid::Uuid;

use crate::api::v1::llm_profiles::handlers;
use crate::auth::cli_user::CliProjectAuth;
use crate::cache::Cache;
use crate::db::DB;
use crate::llm::profiles::service::{CreateLlmProfileInput, UpdateLlmProfileInput};

#[get("llm-profiles")]
pub async fn list_llm_profiles(
    auth: CliProjectAuth,
    db: web::Data<DB>,
) -> actix_web::Result<HttpResponse> {
    Ok(handlers::list(&db, auth.project_id).await)
}

#[get("llm-profiles/{profile_id}")]
pub async fn get_llm_profile(
    auth: CliProjectAuth,
    path: web::Path<Uuid>,
    db: web::Data<DB>,
) -> actix_web::Result<HttpResponse> {
    Ok(handlers::get(&db, auth.project_id, path.into_inner()).await)
}

#[post("llm-profiles")]
pub async fn create_llm_profile(
    auth: CliProjectAuth,
    body: web::Json<CreateLlmProfileInput>,
    db: web::Data<DB>,
) -> actix_web::Result<HttpResponse> {
    Ok(handlers::create(&db, auth.project_id, body.into_inner()).await)
}

#[patch("llm-profiles/{profile_id}")]
pub async fn update_llm_profile(
    auth: CliProjectAuth,
    path: web::Path<Uuid>,
    body: web::Json<UpdateLlmProfileInput>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
) -> actix_web::Result<HttpResponse> {
    Ok(handlers::update(
        &db,
        &cache,
        auth.project_id,
        path.into_inner(),
        body.into_inner(),
    )
    .await)
}

#[delete("llm-profiles/{profile_id}")]
pub async fn delete_llm_profile(
    auth: CliProjectAuth,
    path: web::Path<Uuid>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
) -> actix_web::Result<HttpResponse> {
    Ok(handlers::delete(&db, &cache, auth.project_id, path.into_inner()).await)
}
