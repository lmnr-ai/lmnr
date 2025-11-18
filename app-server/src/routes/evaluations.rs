use actix_web::{HttpResponse, get, web};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::ch::evaluation_scores::{
    EvaluationScoreBucket, get_average_evaluation_score,
    get_evaluation_score_buckets_based_on_bounds, get_evaluation_score_single_bucket,
    get_global_evaluation_scores_bounds,
};

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
