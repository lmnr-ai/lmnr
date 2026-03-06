use std::sync::Arc;

use actix_web::{post, web, HttpResponse};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    cache::Cache,
    language_model::costs::invalidate_custom_model_costs_cache,
};

use super::{error::Error, ResponseResult};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvalidateCacheRequest {
    pub model: String,
    pub provider: Option<String>,
}

/// Invalidate cached custom model costs for a project.
/// Called by the frontend after upsert/delete operations on custom model costs.
#[post("custom-model-costs/invalidate-cache")]
pub async fn invalidate_cache(
    project_id: web::Path<Uuid>,
    request: web::Json<InvalidateCacheRequest>,
    cache: web::Data<Cache>,
) -> ResponseResult {
    let project_id = project_id.into_inner();
    let cache = cache.into_inner();
    let InvalidateCacheRequest { model, provider } = request.into_inner();

    invalidate_custom_model_costs_cache(
        cache,
        &project_id,
        &model,
        provider.as_deref(),
    )
    .await;

    Ok(HttpResponse::Ok().finish())
}
