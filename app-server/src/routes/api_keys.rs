use crate::{
    db::{self, project_api_keys::ProjectApiKey, DB},
    project_api_keys::ProjectApiKeyVals,
};
use actix_web::{delete, get, post, web, HttpResponse};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::ResponseResult;
use crate::cache::{keys::PROJECT_API_KEY_CACHE_KEY, Cache, CacheTrait};

#[derive(Deserialize)]
struct CreateProjectApiKeyRequest {
    name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateProjectApiKeyResponse {
    value: String,
    project_id: Uuid,
    name: Option<String>,
    shorthand: String,
}

#[post("api-keys")]
async fn create_project_api_key(
    project_id: web::Path<Uuid>,
    db: web::Data<DB>,
    req: web::Json<CreateProjectApiKeyRequest>,
    cache: web::Data<Cache>,
) -> ResponseResult {
    let req = req.into_inner();
    let project_id = project_id.into_inner();

    let ProjectApiKeyVals {
        value,
        hash,
        shorthand,
    } = ProjectApiKeyVals::new();

    let key = db::project_api_keys::create_project_api_key(
        &db.pool,
        &project_id,
        &req.name,
        &hash,
        &shorthand,
    )
    .await?;

    let cache_key = format!("{PROJECT_API_KEY_CACHE_KEY}:{hash}");
    let _ = cache.insert::<ProjectApiKey>(&cache_key, key.clone()).await;

    let response = CreateProjectApiKeyResponse {
        value,
        project_id,
        name: key.name,
        shorthand: key.shorthand,
    };

    Ok(HttpResponse::Ok().json(response))
}

#[get("api-keys")]
async fn get_api_keys_for_project(
    project_id: web::Path<Uuid>,
    db: web::Data<DB>,
) -> ResponseResult {
    let api_keys = db::project_api_keys::get_api_keys_for_project(&db.pool, &project_id).await?;

    Ok(HttpResponse::Ok().json(api_keys))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteProjectApiKeyRequest {
    id: Uuid,
}

#[delete("api-keys")]
async fn revoke_project_api_key(
    project_id: web::Path<Uuid>,
    db: web::Data<DB>,
    req: web::Json<DeleteProjectApiKeyRequest>,
    cache: web::Data<Cache>,
) -> ResponseResult {
    let req = req.into_inner();

    let hash = db::project_api_keys::delete_api_key(&db.pool, &req.id, &project_id).await?;

    let cache_key = format!("{PROJECT_API_KEY_CACHE_KEY}:{hash}");
    let _ = cache.remove(&cache_key).await;

    Ok(HttpResponse::Ok().finish())
}
