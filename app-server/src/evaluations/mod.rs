use std::sync::Arc;

use anyhow::Result;
use chrono::Utc;
use uuid::Uuid;

use crate::{
    ch::evaluation_scores::{EvaluationScore, insert_evaluation_scores},
    db::{self, DB},
};
use utils::{EvaluationDatapointResult, datapoints_to_labeling_queues, get_columns_from_points};

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

    let ch_task = tokio::spawn(insert_evaluation_scores(
        clickhouse.clone(),
        ch_evaluation_scores,
    ));

    let (db_result, ch_result) = tokio::join!(db_task, ch_task);

    db_result.map_err(|e| anyhow::anyhow!("Database task failed: {}", e))??;
    ch_result.map_err(|e| anyhow::anyhow!("Clickhouse task failed: {}", e))??;

    Ok(())
}
