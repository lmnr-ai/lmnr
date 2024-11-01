use actix_web::{post, web, HttpResponse};
use serde::Deserialize;
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    ch::evaluation_scores::{insert_evaluation_scores, EvaluationScore},
    db::{self, project_api_keys::ProjectApiKey, DB},
    evaluations::utils::{
        datapoints_to_labeling_queues, get_columns_from_points, EvaluationDatapointResult,
    },
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

    let columns = get_columns_from_points(&points);
    let ids = points.iter().map(|_| Uuid::new_v4()).collect::<Vec<_>>();
    let labeling_queues =
        datapoints_to_labeling_queues(db.clone(), &points, &ids, &project_id).await?;

    for (queue_id, entries) in labeling_queues.iter() {
        db::labeling_queues::push_to_labeling_queue(&db.pool, queue_id, &entries).await?;
    }

    let ids_clone = ids.clone();
    let db_task = tokio::spawn(async move {
        db::evaluations::set_evaluation_results(
            db.clone(),
            evaluation.id,
            &ids_clone,
            &columns.scores,
            &columns.datas,
            &columns.targets,
            &columns.executor_outputs,
            &columns.trace_ids,
        )
        .await
    });

    // Flattened scores from all evaluators to be recorded to Clickhouse
    // Its length can be longer than the amount of evaluation datapoints
    // since each datapoint can have multiple evaluators
    let ch_evaluation_scores = EvaluationScore::from_evaluation_datapoint_results(
        &points,
        &ids,
        project_id,
        group_id,
        evaluation.id,
    );

    let ch_task = tokio::spawn(insert_evaluation_scores(
        clickhouse.clone(),
        ch_evaluation_scores,
    ));

    let (db_result, ch_result) = tokio::join!(db_task, ch_task);

    db_result.map_err(|e| anyhow::anyhow!("Database task failed: {}", e))??;
    ch_result.map_err(|e| anyhow::anyhow!("Clickhouse task failed: {}", e))??;

    Ok(HttpResponse::Ok().json(evaluation))
}
