use std::sync::Arc;

use anyhow::Result;
use chrono::Utc;
use uuid::Uuid;

use crate::{
    ch::evaluation_scores::{insert_evaluation_scores, EvaluationScore},
    db::{self, DB},
};
use utils::{datapoints_to_labeling_queues, get_columns_from_points, EvaluationDatapointResult};

pub mod utils;

pub async fn save_evaluation_scores(
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    points: Vec<EvaluationDatapointResult>,
    evaluation_id: Uuid,
    project_id: Uuid,
    group_name: &String,
) -> Result<()> {
    let columns = get_columns_from_points(&points);
    let labeling_queues =
        datapoints_to_labeling_queues(db.clone(), &points, &columns.ids, &project_id).await?;

    for (queue_id, entries) in labeling_queues.iter() {
        db::labeling_queues::push_to_labeling_queue(&db.pool, queue_id, &entries).await?;
    }

    let pool = db.pool.clone();
    let ids_clone = columns.ids.clone();
    let db_task = tokio::spawn(async move {
        db::evaluations::set_evaluation_results(
            &pool,
            evaluation_id,
            &ids_clone,
            &columns.scores,
            &columns.datas,
            &columns.targets,
            &columns.executor_outputs,
            &columns.trace_ids,
            &columns.indices,
        )
        .await
    });

    // Flattened scores from all evaluators to be recorded to Clickhouse
    // Its length can be longer than the amount of evaluation datapoints
    // since each datapoint can have multiple evaluators
    let ch_evaluation_scores = EvaluationScore::from_evaluation_datapoint_results(
        &points,
        &columns.ids,
        project_id,
        group_name.clone(),
        evaluation_id,
        Utc::now(),
    );

    let ch_task = tokio::spawn(insert_evaluation_scores(
        clickhouse.clone(),
        ch_evaluation_scores,
    ));

    let (db_result, ch_result) = tokio::join!(db_task, ch_task);

    db_result.map_err(|e| anyhow::anyhow!("Database task failed: {}", e))??;
    ch_result.map_err(|e| anyhow::anyhow!("Clickhouse task failed: {}", e))??;

    Ok(())
}

pub async fn add_evaluation_score_from_label(
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    label_id: Uuid,
    result_id: Uuid,
    score: f64,
    name: String,
) -> Result<()> {
    let evaluation =
        db::evaluations::get_evaluation_by_result_id(&db.pool, project_id, result_id).await?;

    let pool = db.pool.clone();
    let name_clone = name.clone();
    let db_task = tokio::spawn(async move {
        db::evaluations::add_evaluation_score(&pool, result_id, &name_clone, score, Some(label_id))
            .await
    });

    let ch_score = crate::ch::evaluation_scores::EvaluationScore {
        project_id,
        group_id: evaluation.group_id,
        evaluation_id: evaluation.id,
        result_id,
        name,
        value: score,
        timestamp: Utc::now(),
    };

    let ch_task = tokio::spawn(insert_evaluation_scores(clickhouse, vec![ch_score]));

    let (db_result, ch_result) = tokio::join!(db_task, ch_task);

    db_result.map_err(|e| anyhow::anyhow!("Database task failed: {}", e))??;
    ch_result.map_err(|e| anyhow::anyhow!("Clickhouse task failed: {}", e))??;

    Ok(())
}
