use std::collections::HashMap;

use actix_web::{post, put, web, HttpResponse};
use serde::Deserialize;
use serde_json::Value;

use crate::{
    db::{self, api_keys::ProjectApiKey, DB},
    routes::types::ResponseResult,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateEvaluationRequest {
    name: String,
    #[serde(default)]
    metadata: Option<Value>,
}

#[post("evaluations")]
async fn create_evaluation(
    req: web::Json<CreateEvaluationRequest>,
    db: web::Data<DB>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let evaluation = db::evaluations::create_evaluation(
        &db.pool,
        &req.name,
        db::evaluations::EvaluationStatus::Started,
        project_id,
        req.metadata.clone(),
    )
    .await?;
    Ok(HttpResponse::Ok().json(evaluation))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateEvaluationRequest {
    name: String,
    status: db::evaluations::EvaluationStatus,
}

#[put("evaluations")]
async fn update_evaluation(
    req: web::Json<UpdateEvaluationRequest>,
    db: web::Data<DB>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let req = req.into_inner();
    db::evaluations::update_evaluation_status_by_name(&db.pool, req.name, project_id, req.status)
        .await?;
    Ok(HttpResponse::Ok().json(()))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RequestEvaluationDatapoint {
    data: Value,
    target: Value,
    executor_output: Option<Value>,
    #[serde(default)]
    error: Option<Value>,
    scores: HashMap<String, f64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UploadEvaluationDatapointsRequest {
    name: String, // evaluation name
    points: Vec<RequestEvaluationDatapoint>,
}

#[post("evaluation-datapoints")]
async fn upload_evaluation_datapoints(
    req: web::Json<UploadEvaluationDatapointsRequest>,
    db: web::Data<DB>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let evaluation_id = db::evaluations::get_evaluation_by_name(&db.pool, project_id, &req.name)
        .await?
        .id;
    let statuses = req
        .points
        .iter()
        .map(|point| {
            if point.error.is_some() {
                db::evaluations::EvaluationDatapointStatus::Error
            } else {
                db::evaluations::EvaluationDatapointStatus::Success
            }
        })
        .collect::<Vec<_>>();

    let data = req
        .points
        .iter()
        .map(|point| point.data.clone())
        .collect::<Vec<_>>();

    let target = req
        .points
        .iter()
        .map(|point| point.target.clone())
        .collect::<Vec<_>>();

    let executor_output = req
        .points
        .iter()
        .map(|point| point.executor_output.clone())
        .collect::<Vec<_>>();

    let error = req
        .points
        .iter()
        .map(|point| point.error.clone())
        .collect::<Vec<_>>();
    let scores = req
        .points
        .iter()
        .map(|point| point.scores.clone())
        .collect::<Vec<_>>();
    let executor_trace_ids = vec![None; req.points.len()];
    let evaluator_trace_ids = vec![None; req.points.len()];

    let evaluation_datapoint = db::evaluations::set_evaluation_results(
        &db.pool,
        evaluation_id,
        &statuses,
        &scores,
        &data,
        &target,
        &executor_trace_ids,
        &evaluator_trace_ids,
        &executor_output,
        &error,
    )
    .await?;
    Ok(HttpResponse::Ok().json(evaluation_datapoint))
}
