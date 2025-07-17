use actix_web::{get, web, HttpResponse};
use uuid::Uuid;

use crate::{db::{trace, project_api_keys::ProjectApiKey, DB}, routes::types::ResponseResult};



#[get("/traces/{trace_id}")]
pub async fn get_trace(
    path: web::Path<Uuid>,
    db: web::Data<DB>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let trace_id = path.into_inner();
    let project_id = project_api_key.project_id;
    let db = db.into_inner();

    let trace = trace::get_trace(&db.pool, &project_id, &trace_id).await?;
    match trace {
        Some(trace) => Ok(HttpResponse::Ok().json(trace)),
        None => Ok(HttpResponse::NotFound().json("Trace not found")),
    }
}
