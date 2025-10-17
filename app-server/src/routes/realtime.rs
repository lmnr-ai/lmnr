use actix_web::{
    HttpResponse, Result as ActixResult, get,
    web::{Data, Path},
};
use uuid::Uuid;

use crate::realtime::{SseConnectionMap, create_sse_response};

// SSE Endpoint on the main HTTP server (producer mode)
#[get("realtime")]
pub async fn sse_endpoint(
    path: Path<Uuid>,
    connections: Data<SseConnectionMap>,
) -> ActixResult<HttpResponse> {
    let project_id = path.into_inner();

    create_sse_response(project_id, connections.get_ref().clone())
}
