use crate::db::{self, api_keys::ProjectApiKey, utils::generate_random_key, DB};
use actix_web::{delete, get, post, web, HttpResponse};
use uuid::Uuid;

use super::ResponseResult;
use crate::cache::Cache;

#[derive(serde::Deserialize)]
struct CreateProjectApiKeyRequest {
    name: Option<String>,
}

#[post("api-keys")]
async fn create_project_api_key(
    project_id: web::Path<Uuid>,
    db: web::Data<DB>,
    req: web::Json<CreateProjectApiKeyRequest>,
    cache: web::Data<Cache>,
) -> ResponseResult {
    let req = req.into_inner();

    // TODO: value should be a hash of genereted key
    let api_key = ProjectApiKey {
        value: generate_random_key(),
        project_id: project_id.into_inner(),
        name: req.name,
    };

    db::api_keys::create_project_api_key(&db.pool, &api_key, cache.into_inner()).await?;

    Ok(HttpResponse::Ok().json(api_key))
}

#[get("api-keys")]
async fn get_api_keys_for_project(
    project_id: web::Path<Uuid>,
    db: web::Data<DB>,
) -> ResponseResult {
    let api_keys = db::api_keys::get_api_keys_for_project(&db.pool, &project_id).await?;

    Ok(HttpResponse::Ok().json(api_keys))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteProjectApiKeyRequest {
    api_key: String,
}

#[delete("api-keys")]
async fn revoke_project_api_key(
    project_id: web::Path<Uuid>,
    db: web::Data<DB>,
    req: web::Json<DeleteProjectApiKeyRequest>,
    cache: web::Data<Cache>,
) -> ResponseResult {
    let req = req.into_inner();
    let _ = cache.remove::<ProjectApiKey>(&req.api_key).await;

    db::api_keys::delete_api_key(&db.pool, &req.api_key, &project_id).await?;

    Ok(HttpResponse::Ok().finish())
}
