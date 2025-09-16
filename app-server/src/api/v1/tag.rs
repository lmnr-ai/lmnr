use crate::{
    db::{self, DB, project_api_keys::ProjectApiKey, tags::TagSource},
    routes::types::ResponseResult,
    tags::insert_or_update_tag,
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
    db: web::Data<DB>,
    clickhouse: web::Data<clickhouse::Client>,
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
    let span_id = match &req {
        TagRequest::WithTraceId(req) => {
            db::spans::get_root_span_id(&db.pool, &req.trace_id, &project_api_key.project_id)
                .await?
        }
        TagRequest::WithSpanId(req) => {
            let exists =
                db::spans::is_span_in_project(&db.pool, &req.span_id, &project_api_key.project_id)
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

    let clickhouse = clickhouse.as_ref().clone();

    let futures = names
        .iter()
        .map(|name| {
            insert_or_update_tag(
                &db.pool,
                clickhouse.clone(),
                project_api_key.project_id,
                Uuid::new_v4(),
                span_id,
                None,
                None,
                name.clone(),
                TagSource::CODE,
            )
        })
        .collect::<Vec<_>>();

    let tags = futures_util::future::try_join_all(futures).await?;

    let response = tags
        .iter()
        .map(|tag| {
            serde_json::json!({
                "id": tag.id,
                "spanId": tag.span_id,
                "createdAt": tag.created_at,
                "updatedAt": tag.updated_at,
            })
        })
        .collect::<Vec<_>>();

    Ok(HttpResponse::Ok().json(response))
}
