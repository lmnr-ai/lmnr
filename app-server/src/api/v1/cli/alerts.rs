//! CLI alert CRUD. Auth via `CliProjectAuth`; reads and writes go through `crate::alerts`.

use actix_web::{HttpResponse, delete, get, patch, post, web};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::alerts::{self, AlertWriteContext, CreateAlertInput, UpdateAlertInput};
use crate::auth::cli_user::CliProjectAuth;
use crate::cache::Cache;
use crate::db::{self, DB};
use crate::features::{Feature, is_feature_enabled};
use crate::routes::types::ResponseResult;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListAlertsQuery {
    #[serde(default)]
    signal_id: Option<Uuid>,
}

async fn user_email(db: &DB, auth: &CliProjectAuth) -> anyhow::Result<Option<String>> {
    db::users::get_user_email(&db.pool, auth.user_id).await
}

#[get("alerts")]
pub async fn list_alerts(
    auth: CliProjectAuth,
    query: web::Query<ListAlertsQuery>,
    db: web::Data<DB>,
) -> ResponseResult {
    let email = user_email(&db, &auth).await?;
    let result =
        alerts::list_alerts(&db.pool, auth.project_id, query.signal_id, email.as_deref()).await;
    Ok(match result {
        Ok(alerts) => HttpResponse::Ok().json(json!({ "alerts": alerts })),
        Err(e) => alerts::error_response(e),
    })
}

#[get("alerts/{alert_id}")]
pub async fn get_alert(
    auth: CliProjectAuth,
    path: web::Path<Uuid>,
    db: web::Data<DB>,
) -> ResponseResult {
    let email = user_email(&db, &auth).await?;
    let result = alerts::get_alert(
        &db.pool,
        auth.project_id,
        path.into_inner(),
        email.as_deref(),
    )
    .await;
    Ok(match result {
        Ok(alert) => HttpResponse::Ok().json(alert),
        Err(e) => alerts::error_response(e),
    })
}

#[post("alerts")]
pub async fn create_alert(
    auth: CliProjectAuth,
    body: web::Json<CreateAlertInput>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
    http_client: web::Data<reqwest::Client>,
) -> ResponseResult {
    let email = user_email(&db, &auth).await?;
    let ctx = AlertWriteContext {
        pool: &db.pool,
        cache: &cache,
        http_client: &http_client,
        project_id: auth.project_id,
        user_email: email.as_deref(),
        clustering_enabled: is_feature_enabled(Feature::Clustering),
    };
    Ok(match alerts::create_alert(&ctx, body.into_inner()).await {
        Ok(alert) => HttpResponse::Ok().json(alert),
        Err(e) => alerts::error_response(e),
    })
}

#[patch("alerts/{alert_id}")]
pub async fn update_alert(
    auth: CliProjectAuth,
    path: web::Path<Uuid>,
    body: web::Json<UpdateAlertInput>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
    http_client: web::Data<reqwest::Client>,
) -> ResponseResult {
    let email = user_email(&db, &auth).await?;
    let ctx = AlertWriteContext {
        pool: &db.pool,
        cache: &cache,
        http_client: &http_client,
        project_id: auth.project_id,
        user_email: email.as_deref(),
        clustering_enabled: is_feature_enabled(Feature::Clustering),
    };
    Ok(
        match alerts::update_alert(&ctx, path.into_inner(), body.into_inner()).await {
            Ok(alert) => HttpResponse::Ok().json(alert),
            Err(e) => alerts::error_response(e),
        },
    )
}

#[delete("alerts/{alert_id}")]
pub async fn delete_alert(
    auth: CliProjectAuth,
    path: web::Path<Uuid>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
) -> ResponseResult {
    let alert_id = path.into_inner();
    Ok(
        match alerts::delete_alert(&db.pool, &cache, auth.project_id, alert_id).await {
            Ok(()) => HttpResponse::Ok().json(json!({ "id": alert_id, "deleted": true })),
            Err(e) => alerts::error_response(e),
        },
    )
}
