//! Project-API-key LLM profile CRUD (`/v1/llm-profiles`). Profiles are
//! workspace-scoped, so a project key manages every profile of its project's
//! workspace. The CLI surface (`api::v1::cli::llm_profiles`) shares the
//! `handlers` below and differs only in auth.

use actix_web::{HttpResponse, delete, get, patch, post, web};
use uuid::Uuid;

use crate::cache::Cache;
use crate::db::{DB, project_api_keys::ProjectApiKey};
use crate::llm::profiles::service::{CreateLlmProfileInput, UpdateLlmProfileInput};

#[get("llm-profiles")]
pub async fn list_llm_profiles(
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
) -> actix_web::Result<HttpResponse> {
    Ok(handlers::list(&db, project_api_key.project_id).await)
}

#[get("llm-profiles/{profile_id}")]
pub async fn get_llm_profile(
    project_api_key: ProjectApiKey,
    path: web::Path<Uuid>,
    db: web::Data<DB>,
) -> actix_web::Result<HttpResponse> {
    Ok(handlers::get(&db, project_api_key.project_id, path.into_inner()).await)
}

#[post("llm-profiles")]
pub async fn create_llm_profile(
    project_api_key: ProjectApiKey,
    body: web::Json<CreateLlmProfileInput>,
    db: web::Data<DB>,
) -> actix_web::Result<HttpResponse> {
    Ok(handlers::create(&db, project_api_key.project_id, body.into_inner()).await)
}

#[patch("llm-profiles/{profile_id}")]
pub async fn update_llm_profile(
    project_api_key: ProjectApiKey,
    path: web::Path<Uuid>,
    body: web::Json<UpdateLlmProfileInput>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
) -> actix_web::Result<HttpResponse> {
    Ok(handlers::update(
        &db,
        &cache,
        project_api_key.project_id,
        path.into_inner(),
        body.into_inner(),
    )
    .await)
}

#[delete("llm-profiles/{profile_id}")]
pub async fn delete_llm_profile(
    project_api_key: ProjectApiKey,
    path: web::Path<Uuid>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
) -> actix_web::Result<HttpResponse> {
    Ok(handlers::delete(&db, &cache, project_api_key.project_id, path.into_inner()).await)
}

/// Auth-agnostic bodies: resolve the project's workspace, run the service, map errors.
pub mod handlers {
    use actix_web::HttpResponse;
    use uuid::Uuid;

    use crate::cache::Cache;
    use crate::db::DB;
    use crate::llm::profiles::service::{
        self, CreateLlmProfileInput, CrudError, UpdateLlmProfileInput,
    };

    fn respond<T: serde::Serialize>(result: Result<T, CrudError>) -> HttpResponse {
        match result {
            Ok(value) => HttpResponse::Ok().json(value),
            Err(e) => service::error_response(e),
        }
    }

    pub async fn list(db: &DB, project_id: Uuid) -> HttpResponse {
        let result = async {
            let workspace_id = service::workspace_for_project(&db.pool, project_id).await?;
            let profiles = service::list_llm_profiles(&db.pool, workspace_id).await?;
            Ok(serde_json::json!({ "llmProfiles": profiles }))
        };
        respond(result.await)
    }

    pub async fn get(db: &DB, project_id: Uuid, profile_id: Uuid) -> HttpResponse {
        let result = async {
            let workspace_id = service::workspace_for_project(&db.pool, project_id).await?;
            service::get_llm_profile(&db.pool, workspace_id, profile_id).await
        };
        respond(result.await)
    }

    pub async fn create(db: &DB, project_id: Uuid, input: CreateLlmProfileInput) -> HttpResponse {
        let result = async {
            let workspace_id = service::workspace_for_project(&db.pool, project_id).await?;
            service::create_llm_profile(&db.pool, workspace_id, input).await
        };
        respond(result.await)
    }

    pub async fn update(
        db: &DB,
        cache: &Cache,
        project_id: Uuid,
        profile_id: Uuid,
        input: UpdateLlmProfileInput,
    ) -> HttpResponse {
        let result = async {
            let workspace_id = service::workspace_for_project(&db.pool, project_id).await?;
            service::update_llm_profile(&db.pool, cache, workspace_id, profile_id, input).await
        };
        respond(result.await)
    }

    pub async fn delete(
        db: &DB,
        cache: &Cache,
        project_id: Uuid,
        profile_id: Uuid,
    ) -> HttpResponse {
        let result = async {
            let workspace_id = service::workspace_for_project(&db.pool, project_id).await?;
            service::delete_llm_profile(&db.pool, cache, workspace_id, profile_id).await
        };
        respond(result.await)
    }
}
