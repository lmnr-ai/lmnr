//! Payload routes for project-scoped payload access.
//!
//! These routes are under /api/v1/projects/{project_id} where Next.js handles auth.

use std::sync::Arc;

use actix_web::{get, web};
use serde::Deserialize;
use uuid::Uuid;

use super::types::ResponseResult;
use crate::api::v1::payloads::PayloadQuery;
use crate::storage::StorageService;

#[derive(Deserialize)]
pub struct PayloadPath {
    project_id: Uuid,
    payload_id: String,
}

#[get("/payloads/{payload_id}")]
pub async fn get_payload(
    path: web::Path<PayloadPath>,
    query: web::Query<PayloadQuery>,
    storage: web::Data<Arc<StorageService>>,
) -> ResponseResult {
    let PayloadPath {
        project_id,
        payload_id,
    } = path.into_inner();
    let payload_type = query.payload_type.as_deref();

    storage
        .get_payload_response(project_id, &payload_id, payload_type)
        .await
}
