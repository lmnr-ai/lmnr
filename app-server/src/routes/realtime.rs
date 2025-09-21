use actix_web::{
    HttpRequest, HttpResponse, Result as ActixResult, get,
    web::{Data, Path},
};
use uuid::Uuid;

use crate::realtime::{SseConnectionMap, create_sse_response};

#[get("realtime")]
pub async fn sse_endpoint(
    path: Path<Uuid>,
    connections: Data<SseConnectionMap>,
    _req: HttpRequest,
) -> ActixResult<HttpResponse> {
    let project_id = path.into_inner();

    log::info!("New SSE connection for project: {}", project_id);

    create_sse_response(project_id, connections.get_ref().clone())
}
