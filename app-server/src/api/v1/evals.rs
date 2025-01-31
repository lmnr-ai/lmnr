use std::sync::Arc;

use crate::{
    db::{self, project_api_keys::ProjectApiKey, DB},
    evaluations::{save_evaluation_scores, utils::EvaluationDatapointResult},
    names::NameGenerator,
    routes::types::ResponseResult,
};
use actix_web::{
    post,
    web::{self, Json},
    HttpResponse,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitEvalRequest {
    pub name: Option<String>,
    pub group_name: Option<String>,
}

#[post("/evals")]
pub async fn init_eval(
    req: Json<InitEvalRequest>,
    db: web::Data<DB>,
    name_generator: web::Data<Arc<NameGenerator>>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let req = req.into_inner();
    let group_name = req.group_name.unwrap_or_else(|| "default".to_string());
    let project_id = project_api_key.project_id;

    let name = if let Some(name) = req.name {
        name
    } else {
        name_generator.next().await
    };

    let evaluation =
        db::evaluations::create_evaluation(&db.pool, &name, project_id, &group_name).await?;

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
