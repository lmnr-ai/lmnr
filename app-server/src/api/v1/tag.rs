use std::sync::Arc;

use crate::{
    cache::Cache,
    ch::spans::append_tags_to_span,
    db::{DB, project_api_keys::ProjectApiKey},
    query_engine::QueryEngine,
    routes::types::ResponseResult,
    sql::{self, ClickhouseReadonlyClient},
};
use actix_web::{
    HttpResponse, post,
    web::{self, Json},
};
use serde::Deserialize;

use uuid::Uuid;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagRequestWithTraceId {
    pub names: Vec<String>,
    pub trace_id: Uuid,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagRequestWithSpanId {
    pub names: Vec<String>,
    pub span_id: Uuid,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(untagged)]
pub enum TagRequest {
    WithTraceId(TagRequestWithTraceId),
    WithSpanId(TagRequestWithSpanId),
}

// /v1/tag
#[post("")]
pub async fn tag_trace(
    req: Json<TagRequest>,
    clickhouse: web::Data<clickhouse::Client>,
    clickhouse_ro: web::Data<Option<Arc<ClickhouseReadonlyClient>>>,
    query_engine: web::Data<Arc<QueryEngine>>,
    project_api_key: ProjectApiKey,
    http_client: web::Data<reqwest::Client>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
) -> ResponseResult {
    let req = req.into_inner();
    let names = match &req {
        TagRequest::WithTraceId(req) => &req.names,
        TagRequest::WithSpanId(req) => &req.names,
    };
    if names.is_empty() {
        return Ok(HttpResponse::BadRequest().body("No names provided"));
    }
    let clickhouse_ro = clickhouse_ro.as_ref().clone().unwrap();
    let query_engine = query_engine.as_ref().clone();
    let clickhouse = clickhouse.as_ref().clone();
    let http_client = http_client.into_inner();
    let cache = cache.into_inner();

    let span_id = match &req {
        TagRequest::WithTraceId(req) => {
            sql::queries::get_top_span_id(
                clickhouse_ro,
                query_engine,
                req.trace_id,
                project_api_key.project_id,
                http_client,
                db.into_inner(),
                cache,
            )
            .await?
        }
        TagRequest::WithSpanId(req) => {
            let exists = crate::ch::spans::is_span_in_project(
                clickhouse.clone(),
                req.span_id,
                project_api_key.project_id,
            )
            .await?;
            if !exists {
                return Ok(HttpResponse::NotFound().body("No matching spans found"));
            }
            Some(req.span_id)
        }
    };

    let Some(span_id) = span_id else {
        return Ok(HttpResponse::NotFound().body("No matching spans found"));
    };

    append_tags_to_span(
        clickhouse.clone(),
        span_id,
        project_api_key.project_id,
        names.clone(),
    )
    .await?;

    Ok(HttpResponse::Ok().finish())
}
