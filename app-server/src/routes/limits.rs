use actix_web::{get, web, HttpResponse};

use crate::db::{self, user::User, DB};

use super::ResponseResult;

#[get("user")]
pub async fn get_user_stats(user: User, db: web::Data<DB>) -> ResponseResult {
    let stats = db::limits::get_user_stats(&db.pool, &user.id).await?;
    Ok(HttpResponse::Ok().json(stats))
}

#[get("user/storage")]
pub async fn get_user_storage_stats(user: User, db: web::Data<DB>) -> ResponseResult {
    let stats = db::limits::get_user_storage_stats(&db.pool, &user.id).await?;
    Ok(HttpResponse::Ok().json(stats))
}

#[get("workspace/{workspace_id}")]
pub async fn get_workspace_stats(
    workspace_id: web::Path<uuid::Uuid>,
    db: web::Data<DB>,
) -> ResponseResult {
    let workspace_id = workspace_id.into_inner();
    let stats = db::limits::get_workspace_stats(&db.pool, &workspace_id).await?;
    Ok(HttpResponse::Ok().json(stats))
}
