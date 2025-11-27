use std::sync::Arc;

use actix_web::{HttpResponse, get, post, web};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::ch::datapoints::get_datapoint_ids_for_dataset;
use crate::ch::evaluation_scores::{
    EvaluationScoreBucket, get_average_evaluation_score,
    get_evaluation_score_buckets_based_on_bounds, get_evaluation_score_single_bucket,
    get_global_evaluation_scores_bounds,
};
use crate::db::{self, DB};
use crate::evaluations::worker::{
    EvaluationDatapointMessage, EvaluatorRef, Executor, push_to_evaluations_queue,
};
use crate::mq::MessageQueue;
use crate::names::NameGenerator;

use super::ResponseResult;

const DEFAULT_LOWER_BOUND: f64 = 0.0;
const DEFAULT_BUCKET_COUNT: u64 = 10;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetEvaluationScoreStatsQuery {
    evaluation_id: Uuid,
    score_name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetEvaluationScoreStatsResponse {
    average_value: f64,
}

#[get("evaluation-score-stats")]
pub async fn get_evaluation_score_stats(
    path: web::Path<Uuid>,
    clickhouse: web::Data<clickhouse::Client>,
    query: web::Query<GetEvaluationScoreStatsQuery>,
) -> ResponseResult {
    let project_id = path.into_inner();
    let clickhouse = clickhouse.into_inner().as_ref().clone();
    let query = query.into_inner();
    let evaluation_id = query.evaluation_id;
    let score_name = query.score_name;

    let average_value =
        get_average_evaluation_score(clickhouse, project_id, evaluation_id, score_name).await?;

    let response = GetEvaluationScoreStatsResponse { average_value };
    Ok(HttpResponse::Ok().json(response))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetEvaluationScoreDistributionQuery {
    evaluation_ids: String,
    score_name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetEvaluationScoreDistributionResponseBucket {
    lower_bound: f64,
    upper_bound: f64,
    /// Heights in the same order as the evaluation ids provided in the request
    heights: Vec<u64>,
}

/// Get the score distribution where global lower and upper bounds for all requested evaluation ids are calculated
///
/// Currently, distributes into 10 buckets
#[get("evaluation-score-distribution")]
pub async fn get_evaluation_score_distribution(
    path: web::Path<Uuid>,
    clickhouse: web::Data<clickhouse::Client>,
    query: web::Query<GetEvaluationScoreDistributionQuery>,
) -> ResponseResult {
    let project_id = path.into_inner();
    let clickhouse = clickhouse.into_inner().as_ref().clone();
    let query = query.into_inner();
    let score_name = query.score_name;
    let evaluation_ids_str = query.evaluation_ids;

    let evaluation_ids = evaluation_ids_str
        .split(',')
        .map(|id| Uuid::parse_str(id).unwrap())
        .collect::<Vec<Uuid>>();
    if evaluation_ids.is_empty() {
        return Err(anyhow::anyhow!("No evaluation ids provided").into());
    }

    // Get bounds among all evaluations
    let global_bounds = get_global_evaluation_scores_bounds(
        clickhouse.clone(),
        project_id,
        &evaluation_ids,
        score_name.clone(),
    )
    .await?;

    let lower_bound = if global_bounds.lower_bound < DEFAULT_LOWER_BOUND {
        global_bounds.lower_bound
    } else {
        DEFAULT_LOWER_BOUND
    };

    let evaluation_buckets: Vec<Vec<EvaluationScoreBucket>> =
        futures_util::future::try_join_all(evaluation_ids.into_iter().map(|evaluation_id| {
            let clickhouse = clickhouse.clone();
            let score_name = score_name.clone();
            async move {
                if global_bounds.lower_bound == global_bounds.upper_bound {
                    get_evaluation_score_single_bucket(
                        clickhouse,
                        project_id,
                        evaluation_id,
                        score_name,
                        global_bounds.lower_bound,
                        global_bounds.upper_bound,
                        DEFAULT_BUCKET_COUNT,
                    )
                    .await
                } else {
                    get_evaluation_score_buckets_based_on_bounds(
                        clickhouse,
                        project_id,
                        evaluation_id,
                        score_name,
                        lower_bound,
                        global_bounds.upper_bound,
                        DEFAULT_BUCKET_COUNT,
                    )
                    .await
                }
            }
        }))
        .await?;

    let mut res_buckets: Vec<GetEvaluationScoreDistributionResponseBucket> = Vec::new();

    for i in 0..DEFAULT_BUCKET_COUNT as usize {
        // Simply get the lower and upper bounds from the first evaluation, since they are the same for all evaluations
        let lower_bound = evaluation_buckets[0][i].lower_bound;
        let upper_bound = evaluation_buckets[0][i].upper_bound;

        let mut heights: Vec<u64> = Vec::new();
        for buckets in &evaluation_buckets {
            heights.push(buckets[i].height);
        }
        res_buckets.push(GetEvaluationScoreDistributionResponseBucket {
            lower_bound,
            upper_bound,
            heights,
        });
    }

    Ok(HttpResponse::Ok().json(res_buckets))
}

/// Request to start an evaluation
#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StartEvaluationRequest {
    /// Dataset ID to evaluate
    pub dataset_id: Uuid,
    /// Executor configuration - what runs the core logic
    pub executor: Executor,
    /// Evaluator reference - what evaluates the output
    pub evaluator: EvaluatorRef,
    /// Optional evaluation name (auto-generated if not provided)
    pub name: Option<String>,
    /// Optional group name (defaults to "default")
    pub group_name: Option<String>,
    /// Optional evaluation metadata
    #[serde(default)]
    pub metadata: Option<Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartEvaluationResponse {
    pub evaluation_id: Uuid,
    pub datapoints_queued: usize,
}

/// Start an evaluation on a dataset
#[post("evaluations")]
pub async fn start_evaluation(
    path: web::Path<Uuid>,
    request: web::Json<StartEvaluationRequest>,
    db: web::Data<DB>,
    clickhouse: web::Data<clickhouse::Client>,
    queue: web::Data<Arc<MessageQueue>>,
    name_generator: web::Data<Arc<NameGenerator>>,
) -> ResponseResult {
    let project_id = path.into_inner();
    let request = request.into_inner();
    let db = db.into_inner();
    let clickhouse = clickhouse.into_inner().as_ref().clone();
    let queue = queue.as_ref().clone();

    // Verify dataset exists and belongs to the project
    if !db::datasets::dataset_exists(&db.pool, request.dataset_id, project_id).await? {
        return Err(anyhow::anyhow!("Dataset not found or does not belong to this project").into());
    }

    // Verify executor (playground) exists
    match &request.executor {
        Executor::Playground(executor) => {
            if !db::playgrounds::playground_exists(&db.pool, executor.playground_id, project_id)
                .await?
            {
                return Err(anyhow::anyhow!(
                    "Playground not found or does not belong to this project"
                )
                .into());
            }
        }
    }

    // Verify evaluator exists
    match &request.evaluator {
        EvaluatorRef::Evaluator(config) => {
            // Try to get the evaluator to verify it exists
            if db::evaluators::get_evaluator(&db, config.evaluator_id, project_id)
                .await
                .is_err()
            {
                return Err(anyhow::anyhow!(
                    "Evaluator not found or does not belong to this project"
                )
                .into());
            }
        }
    }

    // Fetch only datapoint IDs from the dataset (lightweight query - no data payload)
    let datapoint_infos =
        get_datapoint_ids_for_dataset(clickhouse, request.dataset_id, project_id).await?;

    if datapoint_infos.is_empty() {
        return Err(anyhow::anyhow!("Dataset has no datapoints").into());
    }

    // Create the evaluation record
    let group_name = request.group_name.unwrap_or_else(|| "default".to_string());
    let eval_name = match request.name {
        Some(name) => name,
        None => name_generator.next().await,
    };

    let evaluation = db::evaluations::create_evaluation(
        &db.pool,
        &eval_name,
        project_id,
        &group_name,
        &request.metadata,
    )
    .await?;

    // Push a message to the queue for each datapoint (only IDs, data fetched in worker)
    let mut queued_count = 0;
    for (index, datapoint_info) in datapoint_infos.into_iter().enumerate() {
        let message = EvaluationDatapointMessage {
            project_id,
            evaluation_id: evaluation.id,
            group_id: group_name.clone(),
            dataset_id: request.dataset_id,
            datapoint_id: datapoint_info.id,
            datapoint_index: index as i32,
            executor: request.executor.clone(),
            evaluator: request.evaluator.clone(),
        };

        if let Err(e) = push_to_evaluations_queue(message, queue.clone()).await {
            log::error!(
                "Failed to push datapoint {} to evaluations queue: {:?}",
                datapoint_info.id,
                e
            );
            continue;
        }
        queued_count += 1;
    }

    log::info!(
        "Started evaluation {} with {} datapoints queued",
        evaluation.id,
        queued_count
    );

    let response = StartEvaluationResponse {
        evaluation_id: evaluation.id,
        datapoints_queued: queued_count,
    };

    Ok(HttpResponse::Ok().json(response))
}
