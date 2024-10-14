use crate::db::{self, api_keys::ProjectApiKey, utils::generate_random_key, DB};
use actix_web::{delete, get, post, web, HttpResponse};
use serde::{Deserialize, Serialize};
use sha3::{Digest, Sha3_256};
use uuid::Uuid;

use super::ResponseResult;
use crate::cache::Cache;

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

    let value = generate_random_key();
    let shorthand = format!("{}...{}", &value[..4], &value[value.len() - 4..]);

    let hash = hash_api_key(&value);

    let key =
        db::api_keys::create_project_api_key(&db.pool, &project_id, &req.name, &hash, &shorthand)
            .await?;

    let _ = cache.insert::<ProjectApiKey>(key.hash.clone(), &key).await;

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
    let api_keys = db::api_keys::get_api_keys_for_project(&db.pool, &project_id).await?;

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

    let hash = db::api_keys::delete_api_key(&db.pool, &req.id, &project_id).await?;

    let _ = cache.remove::<ProjectApiKey>(&hash).await;

    Ok(HttpResponse::Ok().finish())
}

pub fn hash_api_key(api_key: &str) -> String {
    let mut hasher = Sha3_256::new();
    hasher.update(api_key.as_bytes());
    format!("{:x}", hasher.finalize())
}
