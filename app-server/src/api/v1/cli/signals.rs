//! CLI signal creation (`POST /v1/cli/signals` and
//! `POST /v1/cli/signals/{signal_id}/triggers`). User-token authed via
//! `CliProjectAuth` (JWT + `x-lmnr-project-id` header + membership check). Unlike
//! the browser drawer (two calls: signal then triggers), the CLI creates the
//! signal AND its triggers in one request; the standalone trigger route exists
//! so a partial failure (signal committed, trigger insert failed) is recoverable
//! from the CLI without re-creating the signal (which would 409 on the unique
//! name). Shares `signals::service`, so the validation + write path is identical
//! to the drawer's.

use actix_web::{HttpResponse, post, web};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::auth::cli_user::CliProjectAuth;
use crate::cache::Cache;
use crate::db::{self, DB};
use crate::signals::service::{self, SignalInput, TriggerInput};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSignalRequest {
    #[serde(flatten)]
    signal: SignalInput,
    /// Omitted → the drawer's default trigger is seeded so the signal fires.
    /// Pass `[]` explicitly to create a signal with no triggers.
    #[serde(default)]
    triggers: Option<Vec<TriggerInput>>,
}

#[post("signals")]
pub async fn create_signal(
    auth: CliProjectAuth,
    body: web::Json<CreateSignalRequest>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
) -> actix_web::Result<HttpResponse> {
    let project_id = auth.project_id;
    let CreateSignalRequest { signal, triggers } = body.into_inner();

    // Validate + normalize triggers BEFORE creating the signal, so a bad trigger
    // returns 400 without leaving an orphan signal behind.
    let triggers = triggers.unwrap_or_else(service::default_triggers);
    let normalized: Vec<_> = match triggers.into_iter().map(service::normalize_trigger).collect() {
        Ok(v) => v,
        Err(e) => return Ok(service::error_response(e)),
    };

    // The JWT carries no email; resolve the creator's email for the alert target.
    let email = db::users::get_user_email(&db.pool, auth.user_id)
        .await
        .map_err(actix_web::error::ErrorInternalServerError)?;

    let signal_resp = match service::create_signal(&db.pool, project_id, email.as_deref(), signal).await
    {
        Ok(resp) => resp,
        Err(e) => return Ok(service::error_response(e)),
    };

    // Signal is committed. Any trigger failure here is DB/infra (filters were
    // pre-validated) — report it with the created signalId so the caller retries
    // triggers, not the signal (which would 409 on the unique name).
    let mut created_triggers = Vec::with_capacity(normalized.len());
    for trigger in normalized {
        match service::insert_trigger(&db.pool, cache.get_ref(), project_id, signal_resp.id, trigger, 1)
            .await
        {
            Ok(t) => created_triggers.push(t),
            Err(e) => {
                log::error!("cli signals: trigger creation failed: {e}");
                return Ok(HttpResponse::InternalServerError().json(json!({
                    "error": "Signal was created but one or more triggers failed to create",
                    "signalId": signal_resp.id,
                    "triggers": created_triggers,
                })));
            }
        }
    }

    Ok(HttpResponse::Ok().json(json!({
        "id": signal_resp.id,
        "projectId": signal_resp.project_id,
        "name": signal_resp.name,
        "prompt": signal_resp.prompt,
        "structuredOutput": signal_resp.structured_output,
        "sampleRate": signal_resp.sample_rate,
        "disabled": signal_resp.disabled,
        "createdAt": signal_resp.created_at,
        "triggers": created_triggers,
    })))
}

/// `POST /v1/cli/signals/{signal_id}/triggers` — CLI twin of the trusted
/// trigger route. This is the recovery path for a partial create (the 500 above
/// returns the `signalId` and says "retry triggers"); without it a CLI caller
/// would be stuck: re-creating the signal 409s and no CLI route could add the
/// missing triggers. CLI default mode is 1 (realtime), same as `create_signal`.
#[post("signals/{signal_id}/triggers")]
pub async fn create_signal_trigger(
    auth: CliProjectAuth,
    path: web::Path<Uuid>,
    body: web::Json<TriggerInput>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
) -> actix_web::Result<HttpResponse> {
    let project_id = auth.project_id;
    let signal_id = path.into_inner();

    // `create_trigger` scope-checks the caller-supplied signal id against the
    // project (404 on miss) — shared with the trusted route. CLI default mode
    // is 1 (realtime).
    let result = service::create_trigger(
        &db.pool,
        cache.get_ref(),
        project_id,
        signal_id,
        body.into_inner(),
        1,
    )
    .await;
    Ok(match result {
        Ok(t) => HttpResponse::Ok().json(t),
        Err(e) => service::error_response(e),
    })
}
