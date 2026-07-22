//! Trusted frontend surface for signal creation, mounted under
//! `/api/v1/projects/{project_id}` (no app-server auth — the Next.js `proxy.ts`
//! middleware has already checked project membership). The browser create-signal
//! drawer reaches these via thin Next.js proxy routes. Shares the same
//! `signals::service` as the CLI surface, so there is one implementation.

use actix_web::{HttpResponse, post, web};
use serde::Deserialize;
use uuid::Uuid;

use crate::cache::Cache;
use crate::db::DB;
use crate::signals::service::{self, SignalInput, TriggerInput};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSignalRequest {
    #[serde(flatten)]
    signal: SignalInput,
    /// Resolved from the session by the Next.js proxy and forwarded here (the
    /// trusted route has no session of its own).
    #[serde(default)]
    subscriber_email: Option<String>,
}

#[post("signals")]
pub async fn create_signal(
    path: web::Path<Uuid>,
    body: web::Json<CreateSignalRequest>,
    db: web::Data<DB>,
) -> actix_web::Result<HttpResponse> {
    let project_id = path.into_inner();
    let CreateSignalRequest {
        signal,
        subscriber_email,
    } = body.into_inner();

    let result =
        service::create_signal(&db.pool, project_id, subscriber_email.as_deref(), signal).await;
    Ok(match result {
        Ok(resp) => HttpResponse::Ok().json(resp),
        Err(e) => service::error_response(e),
    })
}

#[post("signals/{signal_id}/triggers")]
pub async fn create_signal_trigger(
    path: web::Path<(Uuid, Uuid)>,
    body: web::Json<TriggerInput>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
) -> actix_web::Result<HttpResponse> {
    let (project_id, signal_id) = path.into_inner();

    let result =
        service::create_trigger(&db.pool, cache.get_ref(), project_id, signal_id, body.into_inner())
            .await;
    Ok(match result {
        Ok(resp) => HttpResponse::Ok().json(resp),
        Err(e) => service::error_response(e),
    })
}
