use actix_web::{post, web, HttpResponse};
use serde::Deserialize;
use serde_json::Value;
use std::{collections::HashMap, sync::Arc};
use uuid::Uuid;

use crate::{
    db::{self, api_keys::ProjectApiKey, DB},
    evaluations::stats::calculate_average_scores,
    names::NameGenerator,
    routes::types::ResponseResult,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateEvaluationRequest {
    name: Option<String>,
}

#[post("evaluations")]
async fn create_evaluation(
    req: web::Json<CreateEvaluationRequest>,
    db: web::Data<DB>,
    project_api_key: ProjectApiKey,
    name_generator: web::Data<Arc<NameGenerator>>,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let req = req.into_inner();

    let name = if let Some(name) = req.name {
        name
    } else {
        name_generator.next().await
    };

    let evaluation = db::evaluations::create_evaluation(
        &db.pool,
        &name,
        db::evaluations::EvaluationStatus::Started,
        project_id,
    )
    .await?;
    Ok(HttpResponse::Ok().json(evaluation))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateEvaluationRequest {
    status: db::evaluations::EvaluationStatus,
}

#[post("evaluations/{evaluation_id}")]
async fn update_evaluation(
    path: web::Path<Uuid>,
    req: web::Json<UpdateEvaluationRequest>,
    db: web::Data<DB>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let evaluation_id = path.into_inner();
    let req = req.into_inner();

    let mut average_scores = None;
    if req.status == db::evaluations::EvaluationStatus::Finished {
        // Calculate average scores only once when the evaluation is finished to avoid recalculating them on each update and query
        let datapoint_scores =
            db::evaluations::get_evaluation_datapoint_scores(&db.pool, evaluation_id).await?;
        let average_scores_json = serde_json::to_value(calculate_average_scores(datapoint_scores))
            .map_err(|e| anyhow::anyhow!("Failed to serialize average scores: {}", e))?;
        average_scores = Some(average_scores_json);
    }

    let evaluation = db::evaluations::update_evaluation_status(
        &db.pool,
        project_id,
        evaluation_id,
        req.status,
        average_scores,
    )
    .await?;
    Ok(HttpResponse::Ok().json(evaluation))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RequestEvaluationDatapoint {
    data: Value,
    target: Value,
    executor_output: Option<Value>,
    #[serde(default)]
    trace_id: Uuid,
    error: Option<Value>,
    scores: HashMap<String, f64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UploadEvaluationDatapointsRequest {
    evaluation_id: Uuid,
    points: Vec<RequestEvaluationDatapoint>,
}

#[post("evaluation-datapoints")]
async fn upload_evaluation_datapoints(
    req: web::Json<UploadEvaluationDatapointsRequest>,
    db: web::Data<DB>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let db = db.into_inner();
    let evaluation =
        db::evaluations::get_evaluation(db.clone(), project_id, req.evaluation_id).await?;

    let evaluation_id = evaluation.id;
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
    let trace_ids = req
        .points
        .iter()
        .map(|point| point.trace_id)
        .collect::<Vec<_>>();

    let evaluation_datapoint = db::evaluations::set_evaluation_results(
        &db.pool,
        evaluation_id,
        &statuses,
        &scores,
        &data,
        &target,
        &executor_output,
        &trace_ids,
        &error,
    )
    .await?;
    Ok(HttpResponse::Ok().json(evaluation_datapoint))
}
