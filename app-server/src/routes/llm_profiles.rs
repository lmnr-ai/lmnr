//! Workspace LLM profile writes and "test connection" for the frontend, which
//! is the only caller (server-to-server, workspace membership checked there).
//! Reads stay in the frontend; every write goes through `profiles::service`.

use actix_web::{HttpResponse, delete, patch, post, web};
use serde::Serialize;
use uuid::Uuid;

use crate::cache::Cache;
use crate::db::DB;
use crate::llm::profiles::service::{
    self, CreateLlmProfileInput, ProbeLlmProfileInput, UpdateLlmProfileInput,
};
use crate::routes::ResponseResult;

#[post("llm-profiles")]
pub async fn create_llm_profile(
    workspace_id: web::Path<Uuid>,
    body: web::Json<CreateLlmProfileInput>,
    db: web::Data<DB>,
) -> ResponseResult {
    let result =
        service::create_llm_profile(&db.pool, workspace_id.into_inner(), body.into_inner()).await;
    Ok(match result {
        Ok(profile) => HttpResponse::Ok().json(profile),
        Err(e) => service::error_response(e),
    })
}

#[patch("llm-profiles/{profile_id}")]
pub async fn update_llm_profile(
    path: web::Path<(Uuid, Uuid)>,
    body: web::Json<UpdateLlmProfileInput>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
) -> ResponseResult {
    let (workspace_id, profile_id) = path.into_inner();
    let result = service::update_llm_profile(
        &db.pool,
        cache.get_ref(),
        workspace_id,
        profile_id,
        body.into_inner(),
    )
    .await;
    Ok(match result {
        Ok(profile) => HttpResponse::Ok().json(profile),
        Err(e) => service::error_response(e),
    })
}

#[delete("llm-profiles/{profile_id}")]
pub async fn delete_llm_profile(
    path: web::Path<(Uuid, Uuid)>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
) -> ResponseResult {
    let (workspace_id, profile_id) = path.into_inner();
    let result =
        service::delete_llm_profile(&db.pool, cache.get_ref(), workspace_id, profile_id).await;
    Ok(match result {
        Ok(profile) => HttpResponse::Ok().json(profile),
        Err(e) => service::error_response(e),
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeLlmProfileResponse {
    pub ok: bool,
    pub model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<u128>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Always 200 with `ok` when the probe ran; a failing provider call is a
/// result for the user, not a transport error.
#[post("llm-profiles/test")]
pub async fn probe_llm_profile(
    workspace_id: web::Path<Uuid>,
    body: web::Json<ProbeLlmProfileInput>,
    db: web::Data<DB>,
) -> ResponseResult {
    let model = body.model.trim().to_string();
    let result =
        service::probe_llm_profile(&db.pool, workspace_id.into_inner(), body.into_inner()).await;
    Ok(match result {
        Ok(Ok(latency)) => HttpResponse::Ok().json(ProbeLlmProfileResponse {
            ok: true,
            model,
            latency_ms: Some(latency.as_millis()),
            error: None,
        }),
        Ok(Err(error)) => HttpResponse::Ok().json(ProbeLlmProfileResponse {
            ok: false,
            model,
            latency_ms: None,
            error: Some(error),
        }),
        Err(e) => service::error_response(e),
    })
}
