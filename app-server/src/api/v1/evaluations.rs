use actix_web::{post, web, HttpResponse};
use serde::Deserialize;
use std::sync::Arc;

use crate::{
    db::{self, project_api_keys::ProjectApiKey, DB},
    evaluations::{save_evaluation_scores, utils::EvaluationDatapointResult},
    names::NameGenerator,
    routes::types::ResponseResult,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateEvaluationRequest {
    name: Option<String>,
    group_id: Option<String>,
    points: Vec<EvaluationDatapointResult>,
}

#[post("evaluations")]
async fn create_evaluation(
    req: web::Json<CreateEvaluationRequest>,
    db: web::Data<DB>,
    clickhouse: web::Data<clickhouse::Client>,
    project_api_key: ProjectApiKey,
    name_generator: web::Data<Arc<NameGenerator>>,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let req = req.into_inner();
    let clickhouse = clickhouse.into_inner().as_ref().clone();
    let db = db.into_inner();

    let name = if let Some(name) = req.name {
        name
    } else {
        name_generator.next().await
    };
    let group_id = req.group_id.unwrap_or("default".to_string());
    let points = req.points;

    if points.is_empty() {
        return Ok(
            HttpResponse::BadRequest().json("Evaluation must have at least one datapoint result")
        );
    }

    let evaluation =
        db::evaluations::create_evaluation(&db.pool, &name, project_id, &group_id).await?;

    save_evaluation_scores(
        db.clone(),
        clickhouse,
        points,
        evaluation.id,
        project_id,
        &group_id,
    )
    .await?;

    Ok(HttpResponse::Ok().json(evaluation))
}
