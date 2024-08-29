use actix_web::{get, post, web, HttpResponse};
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    db::{self, DB},
    routes::error::Error,
};

use super::ResponseResult;

/// Parses a string into a JSON value
///
/// serde_json::from_str won't work, because it would require wrapping every string in quotes,
/// when sent from the frontend. E.g. '"hello world"' instead of 'hello world'.
pub fn parse_string_to_json_value(input: String) -> Value {
    // Try to parse as number (either integer or float)
    if let Ok(num_val) = input.parse::<serde_json::Number>() {
        return Value::Number(num_val);
    }

    Value::String(input)
}

#[get("tag-types")]
pub async fn get_tag_types(path: web::Path<Uuid>, db: web::Data<DB>) -> ResponseResult {
    let project_id = path.into_inner();
    let tag_types = db::tags::get_tag_types_by_project_id(&db.pool, project_id).await?;

    Ok(HttpResponse::Ok().json(tag_types))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateTagTypeRequest {
    name: String,
}

#[post("tag-types")]
pub async fn create_tag_type(
    path: web::Path<Uuid>,
    req: web::Json<CreateTagTypeRequest>,
    db: web::Data<DB>,
) -> ResponseResult {
    let project_id = path.into_inner();
    let req = req.into_inner();
    let name = req.name;

    let id = Uuid::new_v4();
    let tag_type = db::tags::create_tag_type(&db.pool, id, name, project_id).await?;

    Ok(HttpResponse::Ok().json(tag_type))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateTraceTagRequest {
    run_id: Uuid,
    value: String,
    type_id: Uuid,
}

#[post("trace-tags/update")]
pub async fn update_trace_tag(
    req: web::Json<UpdateTraceTagRequest>,
    db: web::Data<DB>,
) -> ResponseResult {
    // TODO: Validate that run id and type id belong to project_id
    let req = req.into_inner();
    let run_id = req.run_id;
    let type_id = req.type_id;

    if req.value.is_empty() {
        return Err(Error::invalid_request(Some("Value cannot be empty")));
    }
    let value = parse_string_to_json_value(req.value);

    let trace_tag = db::tags::update_trace_tag(&db.pool, run_id, value, type_id).await?;

    Ok(HttpResponse::Ok().json(trace_tag))
}

#[get("traces/trace/{run_id}/tags")]
pub async fn get_trace_tags(db: web::Data<DB>, path: web::Path<(Uuid, Uuid)>) -> ResponseResult {
    let (_project_id, run_id) = path.into_inner();

    let tags = db::tags::get_trace_tags(&db.pool, run_id).await?;

    Ok(HttpResponse::Ok().json(tags))
}
