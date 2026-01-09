use std::sync::Arc;

use actix_web::{get, web};
use serde::Deserialize;

use crate::{db::project_api_keys::ProjectApiKey, routes::types::ResponseResult, storage::StorageService};

#[derive(Deserialize)]
pub struct PayloadQuery {
    #[serde(rename = "payloadType")]
    pub payload_type: Option<String>,
}

#[get("payloads/{payload_id}")]
pub async fn get_payload(
    path: web::Path<String>,
    query: web::Query<PayloadQuery>,
    storage: web::Data<Arc<StorageService>>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let payload_id = path.into_inner();
    let payload_type = query.payload_type.as_deref();

    storage
        .get_payload_response(project_id, &payload_id, payload_type)
        .await
}
