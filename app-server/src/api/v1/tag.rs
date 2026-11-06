use crate::{
    ch::{spans::get_trace_id_by_span_id, trace_tags::add_trace_tags},
    db::project_api_keys::ProjectApiKey,
    routes::types::ResponseResult,
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
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    handle_tag_trace(project_api_key.project_id, req, clickhouse).await
}

/// Shared body of `/v1/tag` and its CLI twin `/v1/cli/tag`, which differ only
/// in auth (project API key vs `CliProjectAuth`).
pub async fn handle_tag_trace(
    project_id: Uuid,
    req: Json<TagRequest>,
    clickhouse: web::Data<clickhouse::Client>,
) -> ResponseResult {
    let req = req.into_inner();
    let clickhouse = clickhouse.as_ref().clone();

    let (trace_id, names) = match req {
        TagRequest::WithTraceId(req) => (Some(req.trace_id), req.names),
        TagRequest::WithSpanId(req) => (
            get_trace_id_by_span_id(clickhouse.clone(), req.span_id, project_id).await?,
            req.names,
        ),
    };
    if names.is_empty() {
        return Ok(HttpResponse::BadRequest().body("No names provided"));
    }

    let Some(trace_id) = trace_id else {
        return Ok(HttpResponse::NotFound().body("No matching spans found"));
    };

    add_trace_tags(clickhouse, project_id, trace_id, names).await?;

    Ok(HttpResponse::Ok().finish())
}
