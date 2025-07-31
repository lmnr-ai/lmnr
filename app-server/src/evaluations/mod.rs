use std::sync::Arc;

use anyhow::Result;
use chrono::Utc;
use uuid::Uuid;

use crate::{
    ch::{
        evaluation_datapoints::insert_evaluation_datapoints,
        evaluation_scores::{EvaluationScore, insert_evaluation_scores},
    },
    db::{self, DB},
};
use utils::{EvaluationDatapointResult, get_columns_from_points};

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

    let pool = db.pool.clone();
    let ids_clone = columns.ids.clone();
    let trace_ids_clone = columns.trace_ids.clone();

    let db_task = tokio::spawn(async move {
        db::evaluations::set_evaluation_results(
            &pool,
            evaluation_id,
            &ids_clone,
            &columns.scores,
            &columns.datas,
            &columns.targets,
            &columns.metadatas,
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

    let ch_task_scores = tokio::spawn(insert_evaluation_scores(
        clickhouse.clone(),
        ch_evaluation_scores,
    ));

    let ch_task_datapoints = tokio::spawn(insert_evaluation_datapoints(
        clickhouse.clone(),
        points,
        evaluation_id,
        project_id,
    ));

    // Update trace types synchronously (upsert eliminates race conditions)
    for trace_id in trace_ids_clone {
        crate::db::trace::update_trace_type(
            &db.pool,
            &project_id,
            trace_id,
            crate::db::trace::TraceType::EVALUATION,
        )
        .await?;
    }

    let (db_result, ch_result_scores, ch_result_datapoints) =
        tokio::join!(db_task, ch_task_scores, ch_task_datapoints);

    db_result.map_err(|e| anyhow::anyhow!("Database task failed: {}", e))??;
    ch_result_scores.map_err(|e| anyhow::anyhow!("Clickhouse task failed: {}", e))??;
    ch_result_datapoints.map_err(|e| anyhow::anyhow!("Clickhouse task failed: {}", e))??;

    Ok(())
}
