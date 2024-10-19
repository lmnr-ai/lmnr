use actix_web::{post, web, HttpResponse};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    db::{self, DB},
    provider_api_keys,
};

use super::ResponseResult;

#[derive(Deserialize)]
pub struct SaveApiKeyRequest {
    pub name: String,
    pub value: String,
}

#[post("provider-api-keys")]
pub async fn save_api_key(
    path: web::Path<Uuid>,
    req: web::Json<SaveApiKeyRequest>,
    db: web::Data<DB>,
) -> ResponseResult {
    let req = req.into_inner();
    let value_and_nonce_hex = provider_api_keys::encode_api_key(&req.name, &req.value);
    let encrypted_value = value_and_nonce_hex.value;
    let nonce = value_and_nonce_hex.nonce;
    let project_id = path.into_inner();

    db::provider_api_keys::save_api_key(&db.pool, &project_id, &req.name, &nonce, &encrypted_value)
        .await?;

    Ok(HttpResponse::Ok().finish())
}
