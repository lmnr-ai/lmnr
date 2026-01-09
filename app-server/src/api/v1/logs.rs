use std::sync::Arc;

use actix_web::{HttpRequest, HttpResponse, post, web};
use bytes::Bytes;
use prost::Message;

use crate::{
    db::project_api_keys::ProjectApiKey,
    logs::producer::push_logs_to_queue,
    mq::MessageQueue,
    opentelemetry_proto::lmnr::logs::v1::ExportLogsServiceRequest,
    routes::types::ResponseResult,
};

// /v1/logs
#[post("")]
pub async fn process_logs(
    req: HttpRequest,
    body: Bytes,
    project_api_key: ProjectApiKey,
    logs_message_queue: web::Data<Arc<MessageQueue>>,
) -> ResponseResult {
    let request = ExportLogsServiceRequest::decode(body).map_err(|e| {
        anyhow::anyhow!("Failed to decode ExportLogsServiceRequest from bytes. {e}")
    })?;
    let logs_message_queue = logs_message_queue.as_ref().clone();

    let response =
        push_logs_to_queue(request, project_api_key.project_id, logs_message_queue).await?;
    if response.partial_success.is_some() {
        return Err(anyhow::anyhow!("There has been an error during logs processing.").into());
    }

    let keep_alive = req.headers().get("connection").map_or(false, |v| {
        v.to_str().unwrap_or_default().trim().to_lowercase() == "keep-alive"
    });
    if keep_alive {
        Ok(HttpResponse::Ok().keep_alive().finish())
    } else {
        Ok(HttpResponse::Ok().finish())
    }
}
