use actix_web::{get, web, HttpResponse};
use serde::Serialize;

use crate::{db::{project_api_keys::ProjectApiKey, spans, DB}, routes::types::ResponseResult};


#[derive(Serialize)]
struct SearchSpansResponse {
    data: Vec<spans::SpanSearchItem>,
    count: i64
}

#[get("/spans")]
pub async fn search_spans(
    params: web::Query<spans::SearchSpansParams>,
    db: web::Data<DB>,
    clickhouse: web::Data<clickhouse::Client>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let db = db.into_inner();
    let clickhouse = clickhouse.into_inner();
    let query = params.into_inner();

    let (data, count) = spans::search_spans(&db.pool, &clickhouse, project_id, query).await?;

    let response = SearchSpansResponse {
        data,
        count
    };

    Ok(HttpResponse::Ok().json(response))
}