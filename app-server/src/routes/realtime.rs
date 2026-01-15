use actix_web::{
    HttpResponse, Result as ActixResult, get,
    web::{Data, Path, Query},
};
use serde::Deserialize;
use uuid::Uuid;

use crate::realtime::{SseConnectionMap, create_sse_response};

#[derive(Deserialize)]
pub struct RealtimeQuery {
    /// Subscription key: "traces" for all traces, "trace_{trace_id}" for specific trace
    key: String,
}

// SSE Endpoint on the main HTTP server (producer mode)
#[get("realtime")]
pub async fn sse_endpoint(
    path: Path<Uuid>,
    query: Query<RealtimeQuery>,
    connections: Data<SseConnectionMap>,
) -> ActixResult<HttpResponse> {
    let project_id = path.into_inner();

    create_sse_response(
        project_id,
        query.key.clone(),
        connections.get_ref().clone(),
        None,
    )
}
