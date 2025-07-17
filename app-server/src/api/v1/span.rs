use actix_web::{get, web, HttpResponse};
use uuid::Uuid;

use crate::{db::{span, project_api_keys::ProjectApiKey, DB}, routes::types::ResponseResult};

#[get("/spans/{span_id}")]
pub async fn get_span(
    path: web::Path<Uuid>,
    db: web::Data<DB>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let span_id = path.into_inner();
    let project_id = project_api_key.project_id;
    let db = db.into_inner();

    let span = span::get_span(&db.pool, &project_id, &span_id).await?;
    match span {
        Some(span) => Ok(HttpResponse::Ok().json(span)),
        None => Ok(HttpResponse::NotFound().json("Span not found")),
    }
} 