use std::sync::Arc;

use crate::{
    ch::{spans::append_tags_to_span, tags::insert_tag},
    db::{project_api_keys::ProjectApiKey, tags::TagSource},
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

#[post("tag")]
pub async fn tag_trace(
    req: Json<TagRequest>,
    clickhouse: web::Data<clickhouse::Client>,
    clickhouse_ro: web::Data<Option<Arc<ClickhouseReadonlyClient>>>,
    query_engine: web::Data<Arc<QueryEngine>>,
    project_api_key: ProjectApiKey,
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

    let span_id = match &req {
        TagRequest::WithTraceId(req) => {
            sql::queries::get_top_span_id(
                clickhouse_ro,
                query_engine,
                req.trace_id,
                project_api_key.project_id,
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

    let futures = names
        .iter()
        .map(|name| {
            insert_tag(
                clickhouse.clone(),
                project_api_key.project_id,
                name.clone(),
                TagSource::CODE,
                span_id,
            )
        })
        .collect::<Vec<_>>();

    let tag_ids = futures_util::future::try_join_all(futures).await?;

    append_tags_to_span(
        clickhouse.clone(),
        span_id,
        project_api_key.project_id,
        names.clone(),
    )
    .await?;

    let response = tag_ids
        .iter()
        .map(|id| {
            serde_json::json!({
                "id": id,
                "spanId": span_id,
            })
        })
        .collect::<Vec<_>>();

    Ok(HttpResponse::Ok().json(response))
}
