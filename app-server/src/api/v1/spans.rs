use actix_web::{get, post, web, HttpResponse};
use serde::Serialize;
use uuid::Uuid;

use crate::{db::{project_api_keys::ProjectApiKey, span, spans, DB}, routes::types::ResponseResult};

#[derive(Serialize)]
struct SearchSpansResponse {
    data: Vec<spans::SpanInfo>,
    count: i64,
}

#[post("/spans/query")]
pub async fn get_spans(
    body: web::Json<spans::GetSpansParams>,
    db: web::Data<DB>,
    clickhouse: web::Data<clickhouse::Client>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let db = db.into_inner();
    let clickhouse = clickhouse.into_inner();
    let query = body.into_inner();

    let (data, count) = spans::get_spans(&db.pool, &clickhouse, project_id, query).await?;

    let response = SearchSpansResponse {
        data,
        count,
    };

    Ok(HttpResponse::Ok().json(response))
}

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