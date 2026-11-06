use std::sync::Arc;

use actix_web::{HttpResponse, post, web};

use super::{AuditEventInput, emit};
use crate::{cache::Cache, db::DB, mq::MessageQueue, routes::types::ResponseResult};

/// Internal: the frontend's audit events. Like the other `/api/v1` routes it
/// has no HTTP auth and is reachable only inside the cluster; the frontend
/// resolves the actor from the session. Replies after the broker confirms the
/// publish; the frontend sends from `after()`, so no user request waits on it.
#[post("/api/v1/audit")]
pub async fn create_audit_event(
    input: web::Json<AuditEventInput>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
    queue: web::Data<Arc<MessageQueue>>,
) -> ResponseResult {
    emit(
        db.into_inner(),
        cache.into_inner(),
        &queue,
        input.into_inner(),
    )
    .await?;
    Ok(HttpResponse::NoContent().finish())
}
