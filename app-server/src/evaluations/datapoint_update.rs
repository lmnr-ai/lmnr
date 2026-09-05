use anyhow::Result;
use clickhouse::Client;
use serde::Serialize;
use uuid::Uuid;

#[derive(Serialize)]
pub(super) struct Update<'a> {
    pub trace_id: Uuid,
    pub updated_at: i64,
    pub executor_output: &'a str,
    pub group_id: &'a str,
    pub scores: &'a str,
}

pub(super) async fn write(
    clickhouse: &Client,
    evaluation_id: Uuid,
    project_id: Uuid,
    datapoint_id: Uuid,
    update: &Update<'_>,
) -> Result<()> {
    // Stream variable-size values as data, not repeated SQL literals subject to max_query_size.
    let query = clickhouse
        .query(
            "INSERT INTO evaluation_datapoints (
                id, evaluation_id, project_id, trace_id, updated_at,
                data, target, metadata, executor_output, `index`,
                dataset_id, dataset_datapoint_id, dataset_datapoint_created_at,
                group_id, scores
            )
            SELECT
                existing.id,
                existing.evaluation_id,
                existing.project_id,
                if(empty(incoming.trace_id), existing.trace_id, incoming.trace_id),
                fromUnixTimestamp64Nano(incoming.updated_at, 'UTC'),
                existing.data,
                existing.target,
                existing.metadata,
                if(empty(incoming.executor_output), existing.executor_output, incoming.executor_output),
                existing.`index`,
                existing.dataset_id,
                existing.dataset_datapoint_id,
                existing.dataset_datapoint_created_at,
                incoming.group_id,
                if(empty(incoming.scores),
                    existing.scores,
                    if(notEmpty(existing.scores),
                        jsonMergePatch(existing.scores, incoming.scores),
                        incoming.scores))
            FROM input('trace_id UUID, updated_at Int64, executor_output String, group_id String, scores String') AS incoming
            CROSS JOIN (
                SELECT
                    id, evaluation_id, project_id, trace_id,
                    data, target, metadata, executor_output, `index`, scores,
                    dataset_id, dataset_datapoint_id, dataset_datapoint_created_at
                FROM evaluation_datapoints FINAL
                PREWHERE id = ?
                WHERE project_id = ? AND evaluation_id = ?
            ) AS existing
            FORMAT JSONEachRow",
        )
        .bind(datapoint_id)
        .bind(project_id)
        .bind(evaluation_id);

    let mut insert = clickhouse.insert_formatted_with(query.sql_display().to_string());
    let payload = serde_json::to_vec(update)?;
    async {
        insert.send(payload.into()).await?;
        insert.end().await
    }
    .await
    .map_err(|e| anyhow::anyhow!("Clickhouse evaluation datapoint update failed: {:?}", e))
}

#[cfg(test)]
#[path = "datapoint_update_tests.rs"]
mod tests;
