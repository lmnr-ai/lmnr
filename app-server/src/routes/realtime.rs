use std::sync::Arc;

use actix_web::{
    HttpResponse, Result as ActixResult, get,
    web::{Data, Path},
};
use uuid::Uuid;

use crate::realtime::{SseConnectionMap, create_sse_response};

#[derive(Clone)]
pub struct ReStreamClient {
    client: Arc<reqwest::Client>,
    base_url: String,
}

impl ReStreamClient {
    pub fn new(base_url: String) -> Self {
        Self {
            client: Arc::new(reqwest::Client::new()),
            base_url,
        }
    }
}

// SSE Endpoint on the main HTTP server (producer mode)
#[get("realtime")]
pub async fn sse_endpoint(
    path: Path<Uuid>,
    connections: Data<SseConnectionMap>,
    client: Data<Option<ReStreamClient>>,
) -> ActixResult<HttpResponse> {
    let project_id = path.into_inner();
    let client = client.as_ref();

    if let Some(client) = client {
        let response = client
            .client
            .get(format!(
                "{}/projects/{project_id}/realtime",
                client.base_url,
            ))
            .send()
            .await
            .map_err(|e| {
                actix_web::error::ErrorInternalServerError(format!(
                    "Failed to connect to realtime service: {}",
                    e
                ))
            })?;

        if !response.status().is_success() {
            return Err(actix_web::error::ErrorInternalServerError(format!(
                "Failed to connect to realtime service: {}",
                response.status()
            )));
        }

        let stream = futures_util::stream::unfold(response, |mut resp| async move {
            match resp.chunk().await {
                Ok(Some(chunk)) => Some((Ok(chunk), resp)),
                Ok(None) => None,
                Err(e) => Some((
                    Err(actix_web::error::ErrorInternalServerError(format!(
                        "Stream error: {}",
                        e
                    ))),
                    resp,
                )),
            }
        });
        Ok(HttpResponse::Ok()
            .insert_header(("Content-Type", "text/event-stream"))
            .insert_header(("Cache-Control", "no-cache"))
            .insert_header(("Connection", "keep-alive"))
            .insert_header(("Access-Control-Allow-Origin", "*"))
            .insert_header(("Access-Control-Allow-Headers", "Cache-Control"))
            .streaming(stream))
    } else {
        create_sse_response(project_id, connections.get_ref().clone())
    }
}

// SSE Endpoint on the consumer HTTP server (consumer mode)
#[get("/projects/{project_id}/realtime")]
pub async fn original_realtime_endpoint(
    path: Path<Uuid>,
    connections: Data<SseConnectionMap>,
) -> ActixResult<HttpResponse> {
    let project_id = path.into_inner();

    create_sse_response(project_id, connections.get_ref().clone())
}
