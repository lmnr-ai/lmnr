//! CLI signal CRUD (`/v1/cli/signals`). User-token authed via `CliProjectAuth`
//! (JWT + `x-lmnr-project-id` + membership check), like every other `/v1/cli`
//! route.
//!
//! Unlike the browser drawer (which posts the signal and its triggers
//! separately), the CLI creates or replaces a signal AND its triggers in one
//! request — an agent driving the CLI has no way to recover from a half-applied
//! two-call sequence, and the second call would 409 on the unique name.
//!
//! Validation + the write path live in `signals::service`.

use actix_web::{HttpResponse, delete, get, patch, post, web};
use serde::Deserialize;
use uuid::Uuid;

use crate::auth::cli_user::CliProjectAuth;
use crate::cache::Cache;
use crate::db::{self, DB};
use crate::signals::service::{self, SignalInput, TriggerInput, UpdateSignalInput};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSignalRequest {
    #[serde(flatten)]
    signal: SignalInput,
    /// Omitted → the UI's default trigger is seeded so the signal actually fires.
    /// `[]` explicitly creates a signal with no triggers (inert until one is added).
    #[serde(default)]
    triggers: Option<Vec<TriggerInput>>,
}

/// `POST /v1/cli/signals`
#[post("signals")]
pub async fn create_signal(
    auth: CliProjectAuth,
    body: web::Json<CreateSignalRequest>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
) -> actix_web::Result<HttpResponse> {
    let CreateSignalRequest { signal, triggers } = body.into_inner();

    // The CLI JWT carries no email; resolve the creator's so they're subscribed
    // to the auto-created alert exactly as the drawer does off the session.
    let email = db::users::get_user_email(&db.pool, auth.user_id)
        .await
        .map_err(actix_web::error::ErrorInternalServerError)?;

    let result = service::create_signal(
        &db.pool,
        cache.get_ref(),
        auth.project_id,
        email.as_deref(),
        signal,
        triggers,
        crate::env::clustering::ENABLED.get(),
    )
    .await;

    Ok(match result {
        Ok(signal) => HttpResponse::Ok().json(signal),
        Err(e) => service::error_response(e),
    })
}

#[derive(Debug, Deserialize)]
pub struct ListSignalsQuery {
    /// Case-insensitive substring match, so the CLI can resolve a signal by name.
    #[serde(default)]
    name: Option<String>,
}

/// `GET /v1/cli/signals` — list signals, so the CLI can resolve a name to an id
/// before update/delete.
#[get("signals")]
pub async fn list_signals(
    auth: CliProjectAuth,
    query: web::Query<ListSignalsQuery>,
    db: web::Data<DB>,
) -> actix_web::Result<HttpResponse> {
    let name = query.into_inner().name;
    let result = service::list_signals(&db.pool, auth.project_id, name.as_deref()).await;

    Ok(match result {
        Ok(signals) => HttpResponse::Ok().json(serde_json::json!({ "signals": signals })),
        Err(e) => service::error_response(e),
    })
}

/// `GET /v1/cli/signals/{signal_id}`
#[get("signals/{signal_id}")]
pub async fn get_signal(
    auth: CliProjectAuth,
    path: web::Path<Uuid>,
    db: web::Data<DB>,
) -> actix_web::Result<HttpResponse> {
    let result = service::get_signal(&db.pool, auth.project_id, path.into_inner()).await;

    Ok(match result {
        Ok(signal) => HttpResponse::Ok().json(signal),
        Err(e) => service::error_response(e),
    })
}

/// `PATCH /v1/cli/signals/{signal_id}` — partial update. Absent fields keep their
/// stored value (PATCH, not PUT), so editing the prompt can't clear sampling or
/// re-enable a deactivated signal.
#[patch("signals/{signal_id}")]
pub async fn update_signal(
    auth: CliProjectAuth,
    path: web::Path<Uuid>,
    body: web::Json<UpdateSignalInput>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
) -> actix_web::Result<HttpResponse> {
    let result = service::update_signal(
        &db.pool,
        cache.get_ref(),
        auth.project_id,
        path.into_inner(),
        body.into_inner(),
    )
    .await;

    Ok(match result {
        Ok(signal) => HttpResponse::Ok().json(signal),
        Err(e) => service::error_response(e),
    })
}

/// `DELETE /v1/cli/signals/{signal_id}` — deletes the signal, its auto-created
/// alerts, and its ClickHouse footprint (events / clusters / link rows).
#[delete("signals/{signal_id}")]
pub async fn delete_signal(
    auth: CliProjectAuth,
    path: web::Path<Uuid>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
    clickhouse: web::Data<clickhouse::Client>,
) -> actix_web::Result<HttpResponse> {
    let result = service::delete_signal(
        &db.pool,
        cache.get_ref(),
        clickhouse.get_ref(),
        auth.project_id,
        path.into_inner(),
    )
    .await;

    Ok(match result {
        Ok(signal) => HttpResponse::Ok().json(signal),
        Err(e) => service::error_response(e),
    })
}
