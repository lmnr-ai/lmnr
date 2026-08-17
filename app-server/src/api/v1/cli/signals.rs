//! CLI signal CRUD. Auth via `CliProjectAuth`; writes go through `signals::service`.

use actix_web::{HttpResponse, delete, get, patch, post, web};
use serde::Deserialize;
use uuid::Uuid;

use crate::auth::cli_user::CliProjectAuth;
use crate::cache::Cache;
use crate::db::{self, DB};
use crate::features::{Feature, is_feature_enabled};
use crate::signals::service::{self, SignalInput, UpdateSignalInput};

#[post("signals")]
pub async fn create_signal(
    auth: CliProjectAuth,
    body: web::Json<SignalInput>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
) -> actix_web::Result<HttpResponse> {
    // CLI JWT has no email; subscribe the creator like the drawer does.
    let email = db::users::get_user_email(&db.pool, auth.user_id)
        .await
        .map_err(actix_web::error::ErrorInternalServerError)?;

    let result = service::create_signal(
        &db.pool,
        cache.get_ref(),
        auth.project_id,
        email.as_deref(),
        body.into_inner(),
        is_feature_enabled(Feature::Clustering),
    )
    .await;

    Ok(match result {
        Ok(signal) => HttpResponse::Ok().json(signal),
        Err(e) => service::error_response(e),
    })
}

#[derive(Debug, Deserialize)]
pub struct ListSignalsQuery {
    #[serde(default)]
    name: Option<String>,
}

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
