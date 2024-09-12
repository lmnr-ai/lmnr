use std::collections::HashMap;

use actix_web::{delete, get, web, HttpResponse};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::{
    evaluations::{self, Evaluation, EvaluationDatapointPreview},
    DB,
};

use super::ResponseResult;

#[delete("evaluations/{evaluation_id}")]
async fn delete_evaluation(path: web::Path<(Uuid, Uuid)>, db: web::Data<DB>) -> ResponseResult {
    let (_project_id, evaluation_id) = path.into_inner();
    evaluations::delete_evaluation(&db.pool, &evaluation_id).await?;

    Ok(HttpResponse::Ok().finish())
}

#[get("evaluations")]
async fn get_evaluations(db: web::Data<DB>, path: web::Path<Uuid>) -> ResponseResult {
    let project_id = path.into_inner();
    let evaluations = evaluations::get_evaluations(&db.pool, project_id).await?;
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

#[get("evaluations/{evaluation_id}/datapoints/{datapoint_id}")]
async fn get_evaluation_datapoint(
    path: web::Path<(Uuid, Uuid, Uuid)>,
    db: web::Data<DB>,
) -> ResponseResult {
    let (_project_id, _evaluation_id, datapoint_id) = path.into_inner();

    let result = evaluations::get_evaluation_datapoint(&db.pool, datapoint_id).await?;

    Ok(HttpResponse::Ok().json(result))
}

#[get("evaluations/{evaluation_id}/stats")]
async fn get_evaluation_stats(path: web::Path<(Uuid, Uuid)>, db: web::Data<DB>) -> ResponseResult {
    // This query should eventually migrate to OLAP, so for now it is a pretty rudimentary
    // query-time in-memory aggregation. A slightly better - but still not perfect -
    // solution would be to use a GROUP BY query in SQL with `->` operator to extract
    // each score value, but that would also require to store and manage the keys (score names)
    // in the database. In addition, since the keys are different across
    // evaluations, GIN index optimization is not possible.
    let (_project_id, evaluation_id) = path.into_inner();
    let datapoint_scores =
        evaluations::get_evaluation_datapoint_scores(&db.pool, evaluation_id).await?;

    let mut values_per_score = HashMap::<String, Vec<f64>>::new();
    for score in datapoint_scores {
        let score: HashMap<String, f64> = serde_json::from_value(score.scores).unwrap_or_default();
        for (name, value) in score {
            values_per_score
                .entry(name)
                .and_modify(|values| {
                    values.push(value);
                })
                .or_insert(vec![value]);
        }
    }

    // Map from score name to average value
    let averages = values_per_score
        .into_iter()
        .map(|(name, values)| {
            let mean = values.iter().sum::<f64>() / values.len() as f64;
            (name, mean)
        })
        .collect::<HashMap<_, _>>();

    Ok(HttpResponse::Ok().json(averages))
}
