use actix_web::{HttpResponse, delete, web};
use uuid::Uuid;

use crate::{
    ch,
    db::{self, DB},
    routes::ResponseResult,
};

#[delete("")]
pub async fn delete_project(
    project_id: web::Path<Uuid>,
    db: web::Data<DB>,
    clickhouse: web::Data<clickhouse::Client>,
) -> ResponseResult {
    let project_id = project_id.into_inner();

    if let Err(e) = db::projects::delete_project(&db.pool, &project_id).await {
        log::error!("Failed to delete project {}: {}", project_id, e);
        return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "Internal server error",
            "message": "Failed to delete the project"
        })));
    }

    if let Err(e) = ch::projects::delete_project_data(&clickhouse, project_id).await {
        log::error!(
            "Failed to delete clickhouse data for project {}: {}",
            project_id,
            e
        );
        return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "Internal server error",
            "message": "Failed to delete the project"
        })));
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true
    })))
}
