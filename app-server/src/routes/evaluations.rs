use std::{collections::HashMap, sync::Arc};

use actix_web::{delete, get, post, web, HttpResponse};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    db::{
        self, datapoints,
        evaluations::{self, Evaluation, EvaluationDatapointPreview},
        limits, DB,
    },
    evaluations::run_evaluation,
    pipeline::runner::PipelineRunner,
};

use super::ResponseResult;

#[delete("evaluations/{evaluation_id}")]
async fn delete_evaluation(path: web::Path<(Uuid, Uuid)>, db: web::Data<DB>) -> ResponseResult {
    let (_project_id, evaluation_id) = path.into_inner();
    evaluations::delete_evaluation(&db.pool, &evaluation_id).await?;

    Ok(HttpResponse::Ok().finish())
}

#[derive(Deserialize, Debug)]
#[serde(rename_all(deserialize = "camelCase"))]
struct RunEvaluationRequest {
    name: String,
    dataset_id: Uuid,
    evaluator_pipeline_version_id: Uuid,
    executor_pipeline_version_id: Option<Uuid>,
    // Env will be applied to both evaluator and executor pipelines
    env: HashMap<String, String>,
}

#[post("evaluations")]
async fn create_evaluation(
    path: web::Path<Uuid>,
    db: web::Data<DB>,
    req: web::Json<RunEvaluationRequest>,
    pipeline_runner: web::Data<Arc<PipelineRunner>>
) -> ResponseResult {
    let project_id = path.into_inner();
    let req = req.into_inner();

    let name = req.name;
    let dataset_id = req.dataset_id;
    let evaluator_pipeline_version_id = req.evaluator_pipeline_version_id;
    let executor_pipeline_version_id = req.executor_pipeline_version_id;
    let mut env = req.env;

    env.insert("collection_name".to_string(), project_id.to_string());

    let datapoints_count = datapoints::count_datapoints(&db.pool, dataset_id).await?;
    let requested_runs = if executor_pipeline_version_id.is_some() {
        (datapoints_count * 2) as u32
    } else {
        datapoints_count as u32
    };

    let limits = limits::get_limits_by_project_id(&db.pool, &project_id).await?;
    let max_runs = limits.pipeline_runs_per_month;
    let current_runs = limits::get_run_count_by_project_id(&db.pool, &project_id)
        .await?
        .count_since_reset as u32;
    if max_runs > 0 && (current_runs + requested_runs) > max_runs as u32 {
        let base_msg = format!(
            "Cannot run evaluation due to not enough remaining runs, max_runs: {}, current_runs: {}, requested_runs: {}",
            max_runs,
            current_runs,
            requested_runs,
        );
        log::error!("{}. Project ID: {}", base_msg, project_id,);
        return Err(anyhow::anyhow!(base_msg).into());
    }

    let evaluation = evaluations::create_evaluation(
        &db.pool,
        &name,
        "Started",
        project_id,
        evaluator_pipeline_version_id,
        executor_pipeline_version_id,
    )
    .await?;

    tokio::spawn(run_evaluation(
        db.clone().into_inner(),
        pipeline_runner.as_ref().clone(),
        evaluation.id,
        dataset_id,
        evaluator_pipeline_version_id,
        executor_pipeline_version_id,
        env,
    ));

    Ok(HttpResponse::Ok().json(evaluation))
}

#[get("evaluations")]
async fn get_evaluations(project_id: web::Path<Uuid>, db: web::Data<DB>) -> ResponseResult {
    let project_id = project_id.into_inner();

    let evaluations = evaluations::get_evaluations_with_pipeline_info(&db.pool, project_id).await?;

    Ok(HttpResponse::Ok().json(evaluations))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetEvaluationInfos {
    pub only_finished: bool,
    pub exclude_id: Uuid,
}

#[get("evaluation-infos")]
async fn get_finished_evaluation_infos(
    project_id: web::Path<Uuid>,
    db: web::Data<DB>,
    req: web::Query<GetEvaluationInfos>,
) -> ResponseResult {
    let project_id = project_id.into_inner();
    let req = req.into_inner();
    let only_finished = req.only_finished;
    let exclude_id = req.exclude_id;

    if !only_finished {
        return Err(anyhow::anyhow!("Only finished evaluations are supported").into());
    }

    let evaluation_infos =
        evaluations::get_finished_evaluation_infos(&db.pool, project_id, exclude_id).await?;

    Ok(HttpResponse::Ok().json(evaluation_infos))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetEvaluationResponse {
    evaluation: Evaluation,
    results: Vec<EvaluationDatapointPreview>,
}

#[get("evaluations/{evaluation_id}")]
async fn get_evaluation(path: web::Path<(Uuid, Uuid)>, db: web::Data<DB>) -> ResponseResult {
    let (_project_id, evaluation_id) = path.into_inner();
    let db = db.into_inner();

    let db_clone = db.clone();
    let get_evaluation_task =
        tokio::task::spawn(
            async move { evaluations::get_evaluation(db_clone, evaluation_id).await },
        );

    let get_evaluation_results = tokio::task::spawn(async move {
        evaluations::get_evaluation_results(&db.pool, evaluation_id).await
    });

    let join_res = tokio::try_join!(get_evaluation_task, get_evaluation_results);
    if let Err(e) = join_res {
        return Err(anyhow::anyhow!("Error getting evaluation: {}", e).into());
    }
    let (evaluation, results) = join_res.unwrap();
    let evaluation = evaluation?;
    let results = results?;

    let response = GetEvaluationResponse {
        evaluation,
        results,
    };

    Ok(HttpResponse::Ok().json(response))
}

#[get("evaluations/{evaluation_id}/stats")]
async fn get_evaluation_stats(path: web::Path<(Uuid, Uuid)>, db: web::Data<DB>) -> ResponseResult {
    let (_project_id, evaluation_id) = path.into_inner();

    let stats = evaluations::get_evaluation_stats(db.into_inner(), evaluation_id).await?;

    Ok(HttpResponse::Ok().json(stats))
}

#[get("evaluations/{evaluation_id}/datapoints/{datapoint_id}")]
async fn get_evaluation_datapoint(
    path: web::Path<(Uuid, Uuid, Uuid)>,
    db: web::Data<DB>,
) -> ResponseResult {
    let (_project_id, _evaluation_id, datapoint_id) = path.into_inner();

    let result = evaluations::get_evaluation_datapoint(&db.pool, datapoint_id).await?;

    Ok(HttpResponse::Ok().json(result))
}

// TODO: generalize, add export to CSV/JSON, add to main
#[get("evaluations/{evaluation_id}/export")]
async fn export_evaluation(path: web::Path<(Uuid, Uuid)>, db: web::Data<DB>) -> ResponseResult {
    let (_project_id, evaluation_id) = path.into_inner();

    let previews = evaluations::get_evaluation_results(&db.pool, evaluation_id).await?;

    let mut run_ids_to_datapoints = HashMap::new();
    let mut run_ids = Vec::new(); // to keep order
    let mut res = Vec::new();
    // TODO: query all datapoints at once
    for preview in previews {
        let id = preview.id;
        let datapoint = evaluations::get_evaluation_datapoint(&db.pool, id).await?;
        if let Some(run_id) = datapoint.executor_trace.as_ref().map(|t| t.run_id) {
            run_ids.push(run_id.clone());
            run_ids_to_datapoints.insert(run_id, datapoint);
        }
    }

    let outputs = db::trace::get_all_node_outputs(&db.pool, &run_ids, &None).await?;
    for run_id in run_ids {
        let datapoint = run_ids_to_datapoints.get(&run_id).unwrap();
        let mut node_outputs = outputs.get(&run_id).unwrap().clone();
        if let Some(score) = datapoint.score {
            node_outputs.insert("score".to_string(), serde_json::to_value(score).unwrap());
        }
        res.push(node_outputs);
    }

    Ok(HttpResponse::Ok().json(res))
}
