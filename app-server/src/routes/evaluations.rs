use actix_web::{delete, get, web, HttpResponse};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    ch::evaluation_scores::{
        get_average_evaluation_score, get_evaluation_score_buckets_based_on_bounds,
        get_global_evaluation_scores_bounds, EvaluationScoreBucket,
    },
    db::{
        evaluations::{self, Evaluation, EvaluationDatapoint},
        DB,
    },
};

use super::ResponseResult;

const DEFAULT_LOWER_BOUND: f64 = 0.0;
const DEFAULT_BUCKET_COUNT: u64 = 10;

#[delete("evaluations/{evaluation_id}")]
async fn delete_evaluation(path: web::Path<(Uuid, Uuid)>, db: web::Data<DB>) -> ResponseResult {
    let (_project_id, evaluation_id) = path.into_inner();
    evaluations::delete_evaluation(&db.pool, &evaluation_id).await?;

    Ok(HttpResponse::Ok().finish())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetEvaluationsQuery {
    #[serde(default)]
    current_evaluation_id: Option<Uuid>,
}

#[get("evaluations")]
async fn get_evaluations(
    db: web::Data<DB>,
    path: web::Path<Uuid>,
    query: web::Query<GetEvaluationsQuery>,
) -> ResponseResult {
    let project_id = path.into_inner();
    let query = query.into_inner();
    let current_evaluation_id = query.current_evaluation_id;

    let evaluations = match current_evaluation_id {
        Some(current_evaluation_id) => {
            // TODO: Currently, this query takes care of filtering out by group id, need to make it more explicit
            evaluations::get_evaluations_grouped_by_current_evaluation(
                &db.pool,
                project_id,
                current_evaluation_id,
            )
            .await?
        }
        None => evaluations::get_evaluations(&db.pool, project_id).await?,
    };

    Ok(HttpResponse::Ok().json(evaluations))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetEvaluationResponse {
    evaluation: Evaluation,
    results: Vec<EvaluationDatapoint>,
}

#[get("evaluations/{evaluation_id}")]
async fn get_evaluation(path: web::Path<(Uuid, Uuid)>, db: web::Data<DB>) -> ResponseResult {
    let (project_id, evaluation_id) = path.into_inner();
    let db = db.into_inner();

    let db_clone = db.clone();
    let get_evaluation_task = tokio::task::spawn(async move {
        evaluations::get_evaluation(db_clone, project_id, evaluation_id).await
    });

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
async fn get_evaluation_score_stats(
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
async fn get_evaluation_score_distribution(
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
    // TODO: Figure out better way to handle this in both backend and frontend
    if global_bounds.upper_bound < DEFAULT_LOWER_BOUND {
        return Err(anyhow::anyhow!(
            "Upper bound is less than lower bound: {} < {}",
            global_bounds.upper_bound,
            DEFAULT_LOWER_BOUND
        )
        .into());
    }

    let evaluation_buckets: Vec<Vec<EvaluationScoreBucket>> =
        futures::future::try_join_all(evaluation_ids.into_iter().map(|evaluation_id| {
            let clickhouse = clickhouse.clone();
            let score_name = score_name.clone();
            async move {
                get_evaluation_score_buckets_based_on_bounds(
                    clickhouse,
                    project_id,
                    evaluation_id,
                    score_name,
                    DEFAULT_LOWER_BOUND,
                    global_bounds.upper_bound,
                    DEFAULT_BUCKET_COUNT,
                )
                .await
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
