use actix_web::{HttpResponse, patch, web};
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    api::v1::rollouts::{UpdateStatusRequest, update_status_and_broadcast},
    db::DB,
    pubsub::PubSub,
    routes::types::ResponseResult,
};

/// Frontend-driven status update (e.g. a human marks a session STOPPED). With
/// no executor there is nothing server-side to kill — status is just a label.
#[patch("rollouts/{session_id}/status")]
pub async fn update_status(
    path: web::Path<(Uuid, Uuid)>,
    body: web::Json<UpdateStatusRequest>,
    db: web::Data<DB>,
    pubsub: web::Data<Arc<PubSub>>,
) -> ResponseResult {
    let (project_id, session_id) = path.into_inner();
    let new_status = body.into_inner().status;

    update_status_and_broadcast(
        db.get_ref(),
        pubsub.get_ref().as_ref(),
        &project_id,
        &session_id,
        new_status,
    )
    .await?;

    Ok(HttpResponse::Ok().finish())
}
