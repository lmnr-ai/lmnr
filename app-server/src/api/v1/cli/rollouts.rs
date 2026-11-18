use std::sync::Arc;

use actix_web::{HttpRequest, HttpResponse, get, patch, post, web};
use uuid::Uuid;

use crate::{
    api::v1::debugger::{AddBlockRequest, handle_add_block, handle_list_blocks, rename_session},
    api::v1::rollouts::RegisterSessionRequest,
    audit,
    auth::cli_user::CliProjectAuth,
    db::{DB, debugger_sessions::create_or_update_debugger_session},
    pubsub::PubSub,
    routes::types::ResponseResult,
};

/// `POST /v1/cli/rollouts/{session_id}` — CLI twin of `/v1/rollouts/{session_id}`
/// (which stays project-API-key for SDKs/customers). Same idempotent upsert and
/// JSON response; differs only in auth (`CliProjectAuth` user token).
#[post("rollouts/{session_id}")]
pub async fn register_session(
    req: HttpRequest,
    path: web::Path<Uuid>,
    body: web::Json<RegisterSessionRequest>,
    auth: CliProjectAuth,
    db: web::Data<DB>,
) -> ResponseResult {
    let db = db.into_inner();
    let session_id = path.into_inner();
    let project_id = auth.project_id;
    let name = body.into_inner().name;

    let session =
        create_or_update_debugger_session(&db.pool, &session_id, &project_id, name).await?;
    audit::target_named(&req, session.id, session.name.clone());

    Ok(HttpResponse::Ok().json(session))
}

/// `GET /v1/cli/rollouts/{session_id}/blocks` — CLI twin of
/// `/v1/rollouts/{session_id}/blocks`; differs only in auth.
#[get("rollouts/{session_id}/blocks")]
pub async fn list_blocks(
    path: web::Path<Uuid>,
    auth: CliProjectAuth,
    db: web::Data<DB>,
) -> ResponseResult {
    handle_list_blocks(auth.project_id, path.into_inner(), &db).await
}

/// `POST /v1/cli/rollouts/{session_id}/blocks` — CLI twin of
/// `/v1/rollouts/{session_id}/blocks`; differs only in auth. Backs
/// `lmnr-cli debug session add-note`.
#[post("rollouts/{session_id}/blocks")]
pub async fn add_block(
    path: web::Path<Uuid>,
    body: web::Json<AddBlockRequest>,
    auth: CliProjectAuth,
    db: web::Data<DB>,
    pubsub: web::Data<Arc<PubSub>>,
) -> ResponseResult {
    handle_add_block(
        auth.project_id,
        path.into_inner(),
        body.into_inner(),
        &db,
        pubsub.get_ref().as_ref(),
    )
    .await
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateNameRequest {
    name: String,
}

/// `PATCH /v1/cli/rollouts/{session_id}/name` — rename a debug session (CLI-only;
/// the SDK names at register time). Update-only: unknown session id → 404.
#[patch("rollouts/{session_id}/name")]
pub async fn update_name(
    req: HttpRequest,
    path: web::Path<Uuid>,
    body: web::Json<UpdateNameRequest>,
    auth: CliProjectAuth,
    db: web::Data<DB>,
    pubsub: web::Data<Arc<PubSub>>,
) -> ResponseResult {
    let session_id = path.into_inner();
    let name = body.into_inner().name;

    if !rename_session(
        auth.project_id,
        session_id,
        &name,
        &db,
        pubsub.get_ref().as_ref(),
    )
    .await?
    {
        return Ok(HttpResponse::NotFound().json("Session not found"));
    }
    audit::target_named(&req, session_id, name);

    Ok(HttpResponse::Ok().finish())
}
