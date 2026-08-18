use std::{collections::HashMap, sync::Arc};

use super::debugger;
use crate::{
    cache::Cache,
    db::{self, DB, project_api_keys::ProjectApiKey},
    evaluations::{
        EvaluationDatapointResult, UpdatedDatapointStrings, insert_evaluation_datapoints,
        realtime::{
            RealtimeDatapoint, cache_inserted_datapoint_trace_ids, send_datapoint_updates,
            send_evaluation_created,
        },
        update_evaluation_datapoint,
    },
    names::NameGenerator,
    pubsub::PubSub,
    routes::types::ResponseResult,
};
use actix_web::{
    HttpResponse, delete, get, post,
    web::{self, Json},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

const DEFAULT_EVALS_PAGE_SIZE: i64 = 50;
const MAX_EVALS_PAGE_SIZE: i64 = 500;
const MAX_TAG_NAME_LENGTH: usize = 256;

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct InitEvalRequest {
    pub name: Option<String>,
    pub group_name: Option<String>,
    #[serde(default)]
    pub metadata: Option<Value>,
}

#[post("/evals")]
pub async fn init_eval(
    req: Json<InitEvalRequest>,
    db: web::Data<DB>,
    name_generator: web::Data<Arc<NameGenerator>>,
    pubsub: web::Data<Arc<PubSub>>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let req = req.into_inner();
    let group_name = req.group_name.unwrap_or("default".to_string());
    let project_id = project_api_key.project_id;
    let metadata = req.metadata;
    let name = if let Some(name) = req.name {
        name
    } else {
        name_generator.next().await
    };

    let evaluation =
        db::evaluations::create_evaluation(&db.pool, &name, project_id, &group_name, &metadata)
            .await?;

    db::debugger_session_blocks::upsert_block_for_evaluation(
        &db.pool,
        &project_id,
        &evaluation.id,
        metadata.as_ref(),
        &evaluation.created_at,
    )
    .await;

    // Push the eval block to the session live (scores fill in on next load).
    if let Some(session_id) = debugger::session_id_from_metadata(metadata.as_ref()) {
        debugger::push_evaluation_block(
            pubsub.get_ref().as_ref(),
            &project_id,
            &session_id,
            &evaluation,
        )
        .await;
    }

    send_evaluation_created(pubsub.get_ref().as_ref(), &project_id, &evaluation).await;

    Ok(HttpResponse::Ok().json(evaluation))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEvalRequest {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub metadata: Option<Value>,
}

/// Update an evaluation's name and/or metadata. `group_id` is immutable.
/// Fields omitted from the request are left unchanged. Postgres-only:
/// evaluation-level name/metadata are not duplicated into ClickHouse
/// (`evaluation_datapoints.metadata` is per-datapoint).
#[post("/evals/{eval_id}")]
pub async fn update_eval(
    eval_id: web::Path<Uuid>,
    req: Json<UpdateEvalRequest>,
    db: web::Data<DB>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let eval_id = eval_id.into_inner();
    let req = req.into_inner();
    let project_id = project_api_key.project_id;

    let evaluation =
        db::evaluations::update_evaluation(&db.pool, eval_id, project_id, &req.name, &req.metadata)
            .await?;

    match evaluation {
        Some(evaluation) => Ok(HttpResponse::Ok().json(evaluation)),
        None => Ok(HttpResponse::NotFound().json("Evaluation not found")),
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListEvalsQuery {
    #[serde(default)]
    pub group_id: Option<String>,
    /// Case-insensitive substring match on the evaluation name.
    #[serde(default)]
    pub name: Option<String>,
    /// Comma-separated tag names. An evaluation must carry ALL of them to match.
    #[serde(default)]
    pub tags: Option<String>,
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvalTagsRequest {
    pub tags: Vec<String>,
}

fn normalize_tags<'a>(names: impl Iterator<Item = &'a str>) -> Vec<String> {
    let mut normalized: Vec<String> = Vec::new();
    for name in names.map(str::trim).filter(|name| !name.is_empty()) {
        let name = name.to_string();
        if !normalized.contains(&name) {
            normalized.push(name);
        }
    }
    normalized
}

fn bad_request(message: &str) -> HttpResponse {
    HttpResponse::BadRequest().json(serde_json::json!({ "error": message }))
}

/// Shared body of `GET /v1/evals` and its `/v1/cli` twin.
pub async fn list_evals_response(
    pool: &PgPool,
    project_id: Uuid,
    query: ListEvalsQuery,
) -> ResponseResult {
    let tags = normalize_tags(query.tags.as_deref().unwrap_or_default().split(','));
    let limit = query
        .limit
        .unwrap_or(DEFAULT_EVALS_PAGE_SIZE)
        .clamp(1, MAX_EVALS_PAGE_SIZE);
    let offset = query.offset.unwrap_or(0).max(0);

    let evaluations = db::evaluations::list_evaluations(
        pool,
        project_id,
        query.group_id.as_deref(),
        query.name.as_deref(),
        &tags,
        limit,
        offset,
    )
    .await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "evaluations": evaluations })))
}

/// Shared body of `GET /v1/evals/{eval_id}` and its `/v1/cli` twin.
pub async fn get_eval_response(pool: &PgPool, project_id: Uuid, eval_id: Uuid) -> ResponseResult {
    match db::evaluations::get_evaluation(pool, project_id, eval_id).await? {
        Some(evaluation) => Ok(HttpResponse::Ok().json(evaluation)),
        None => Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "Evaluation not found"
        }))),
    }
}

/// Shared body of `POST /v1/evals/{eval_id}/tags` and its `/v1/cli` twin.
pub async fn add_eval_tags_response(
    pool: &PgPool,
    project_id: Uuid,
    eval_id: Uuid,
    req: EvalTagsRequest,
) -> ResponseResult {
    let tags = normalize_tags(req.tags.iter().map(String::as_str));
    if tags.is_empty() {
        return Ok(bad_request("At least one non-empty tag is required"));
    }
    if let Some(tag) = tags.iter().find(|tag| tag.len() > MAX_TAG_NAME_LENGTH) {
        return Ok(bad_request(&format!(
            "Tag \"{}\" exceeds {MAX_TAG_NAME_LENGTH} characters",
            &tag[..MAX_TAG_NAME_LENGTH.min(tag.len())]
        )));
    }

    // Guarded here rather than by the FK: `evaluation_tags.project_id` is not
    // part of the evaluation FK, so an unchecked insert would let one project
    // tag another project's evaluation.
    if db::evaluations::get_evaluation(pool, project_id, eval_id)
        .await?
        .is_none()
    {
        return Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "Evaluation not found"
        })));
    }

    let tags = db::evaluation_tags::add_evaluation_tags(pool, project_id, eval_id, &tags).await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "tags": tags })))
}

/// Shared body of `DELETE /v1/evals/{eval_id}/tags/{tag}` and its `/v1/cli` twin.
pub async fn remove_eval_tag_response(
    pool: &PgPool,
    project_id: Uuid,
    eval_id: Uuid,
    tag: &str,
) -> ResponseResult {
    let tags = db::evaluation_tags::remove_evaluation_tag(pool, project_id, eval_id, tag).await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "tags": tags })))
}

/// `GET /v1/evals` — list evaluations with their tags.
#[get("/evals")]
pub async fn list_evals(
    query: web::Query<ListEvalsQuery>,
    db: web::Data<DB>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    list_evals_response(&db.pool, project_api_key.project_id, query.into_inner()).await
}

/// `GET /v1/evals/{eval_id}` — a single evaluation with its tags.
#[get("/evals/{eval_id}")]
pub async fn get_eval(
    eval_id: web::Path<Uuid>,
    db: web::Data<DB>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    get_eval_response(&db.pool, project_api_key.project_id, eval_id.into_inner()).await
}

/// `POST /v1/evals/{eval_id}/tags` — attach tags, creating unknown tag classes.
#[post("/evals/{eval_id}/tags")]
pub async fn add_eval_tags(
    eval_id: web::Path<Uuid>,
    req: Json<EvalTagsRequest>,
    db: web::Data<DB>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    add_eval_tags_response(
        &db.pool,
        project_api_key.project_id,
        eval_id.into_inner(),
        req.into_inner(),
    )
    .await
}

/// `DELETE /v1/evals/{eval_id}/tags/{tag}` — detach a single tag.
#[delete("/evals/{eval_id}/tags/{tag}")]
pub async fn remove_eval_tag(
    path: web::Path<(Uuid, String)>,
    db: web::Data<DB>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let (eval_id, tag) = path.into_inner();
    remove_eval_tag_response(&db.pool, project_api_key.project_id, eval_id, &tag).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveEvalDatapointsRequest {
    pub group_name: Option<String>,
    pub points: Vec<EvaluationDatapointResult>,
}

#[post("/evals/{eval_id}/datapoints")]
pub async fn save_eval_datapoints(
    eval_id: web::Path<Uuid>,
    req: Json<SaveEvalDatapointsRequest>,
    db: web::Data<DB>,
    clickhouse: web::Data<clickhouse::Client>,
    cache: web::Data<Cache>,
    pubsub: web::Data<Arc<PubSub>>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let eval_id = eval_id.into_inner();
    let req = req.into_inner();
    let project_id = project_api_key.project_id;
    let points = req.points;
    let group_name = req.group_name.unwrap_or("default".to_string());
    let clickhouse = clickhouse.into_inner().as_ref().clone();

    let ch_rows = insert_evaluation_datapoints(
        &db.pool,
        clickhouse,
        points,
        eval_id,
        project_id,
        &group_name,
    )
    .await?;

    cache_inserted_datapoint_trace_ids(cache.into_inner(), &project_id, &eval_id, &ch_rows).await;

    let realtime_points: Vec<RealtimeDatapoint<'_>> = ch_rows
        .iter()
        .map(RealtimeDatapoint::from_ch_insert)
        .collect();

    send_datapoint_updates(
        pubsub.get_ref().as_ref(),
        &project_id,
        &eval_id,
        &group_name,
        &realtime_points,
    )
    .await;

    Ok(HttpResponse::Ok().json(eval_id))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEvalDatapointRequest {
    pub executor_output: Option<Value>,
    pub scores: HashMap<String, Option<f64>>,
    #[serde(default)]
    pub trace_id: Option<Uuid>,
}

#[post("/evals/{eval_id}/datapoints/{datapoint_id}")]
pub async fn update_eval_datapoint(
    path: web::Path<(Uuid, Uuid)>,
    req: Json<UpdateEvalDatapointRequest>,
    db: web::Data<DB>,
    clickhouse: web::Data<clickhouse::Client>,
    pubsub: web::Data<Arc<PubSub>>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let (eval_id, datapoint_id) = path.into_inner();
    let req = req.into_inner();
    let clickhouse = clickhouse.into_inner().as_ref().clone();
    let project_id = project_api_key.project_id;

    let group_id = db::evaluations::get_evaluation_group_id(&db.pool, eval_id, project_id).await?;

    let UpdatedDatapointStrings {
        executor_output: ch_executor_output,
        scores: ch_scores,
    } = update_evaluation_datapoint(
        &db.pool,
        clickhouse,
        eval_id,
        project_id,
        datapoint_id,
        &group_id,
        req.executor_output,
        req.scores,
        req.trace_id,
    )
    .await?;

    let realtime_point = RealtimeDatapoint::from_update_strings(
        datapoint_id,
        req.trace_id,
        &ch_executor_output,
        &ch_scores,
    );
    send_datapoint_updates(
        pubsub.get_ref().as_ref(),
        &project_id,
        &eval_id,
        &group_id,
        std::slice::from_ref(&realtime_point),
    )
    .await;

    Ok(HttpResponse::Ok().json(datapoint_id))
}
