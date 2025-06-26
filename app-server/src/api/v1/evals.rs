use std::{collections::HashMap, sync::Arc};

use crate::{
    db::{self, DB, project_api_keys::ProjectApiKey},
    evaluations::{save_evaluation_scores, utils::EvaluationDatapointResult},
    names::NameGenerator,
    routes::types::ResponseResult,
};
use actix_web::{
    HttpResponse, post,
    web::{self, Json},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

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

    Ok(HttpResponse::Ok().json(evaluation))
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
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let eval_id = eval_id.into_inner();
    let req = req.into_inner();
    let project_id = project_api_key.project_id;
    let points = req.points;
    let db = db.into_inner();
    let group_name = req.group_name.unwrap_or("default".to_string());
    let clickhouse = clickhouse.into_inner().as_ref().clone();

    save_evaluation_scores(
        db.clone(),
        clickhouse,
        points,
        eval_id,
        project_id,
        &group_name,
    )
    .await?;

    Ok(HttpResponse::Ok().json(eval_id))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEvalDatapointRequest {
    pub executor_output: Option<Value>,
    pub scores: HashMap<String, Option<f64>>,
}

#[post("/evals/{eval_id}/datapoints/{datapoint_id}")]
pub async fn update_eval_datapoint(
    path: web::Path<(Uuid, Uuid)>,
    req: Json<UpdateEvalDatapointRequest>,
    db: web::Data<DB>,
    clickhouse: web::Data<clickhouse::Client>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let (eval_id, datapoint_id) = path.into_inner();
    let req = req.into_inner();
    let scores_clone = req.scores.clone();

    // Get evaluation info for ClickHouse
    let group_id =
        db::evaluations::get_evaluation_group_id(&db.pool, eval_id, project_api_key.project_id)
            .await?;

    // Update database (PostgreSQL)
    db::evaluations::update_evaluation_datapoint(
        &db.pool,
        eval_id,
        datapoint_id,
        req.executor_output,
        req.scores,
    )
    .await?;

    // Update ClickHouse analytics
    crate::ch::evaluation_scores::insert_updated_evaluation_scores(
        clickhouse.into_inner().as_ref().clone(),
        project_api_key.project_id,
        group_id,
        eval_id,
        datapoint_id,
        scores_clone,
    )
    .await?;

    Ok(HttpResponse::Ok().json(datapoint_id))
}
