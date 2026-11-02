use std::collections::HashMap;

use anyhow::Result;
use chrono::{DateTime, Utc};
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::utils::chrono_to_nanoseconds;
use crate::datasets::datapoints::Datapoint;

#[derive(Row, Serialize, Deserialize, Debug)]
pub struct CHDatapoint {
    #[serde(with = "clickhouse::serde::uuid")]
    pub id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub dataset_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    /// Created at time in nanoseconds
    pub created_at: i64,
    pub data: String,
    pub target: String,
    pub metadata: String,
    pub task_id: String,
}

/// Convert CHDatapoint to Datapoint for API response
impl From<CHDatapoint> for Datapoint {
    fn from(ch_datapoint: CHDatapoint) -> Self {
        // Parse JSON strings back to Values
        let (data, target, metadata) = Datapoint::parse_string_payloads(
            ch_datapoint.data,
            ch_datapoint.target,
            ch_datapoint.metadata,
        )
        .unwrap();

        Datapoint {
            id: ch_datapoint.id,
            dataset_id: ch_datapoint.dataset_id,
            created_at: DateTime::from_timestamp_nanos(ch_datapoint.created_at),
            data,
            target,
            metadata,
            task_id: ch_datapoint.task_id,
        }
    }
}

/// Convert Datapoint to CHDatapoint for ClickHouse insertion
impl CHDatapoint {
    pub fn from_datapoint(datapoint: &Datapoint, project_id: Uuid) -> Self {
        let data = serde_json::to_string(&datapoint.data).unwrap_or_default();
        let target = if let Some(target) = &datapoint.target {
            serde_json::to_string(target).unwrap_or_default()
        } else {
            "".to_string()
        };
        let metadata = serde_json::to_string(&datapoint.metadata).unwrap_or_default();

        CHDatapoint {
            id: datapoint.id,
            dataset_id: datapoint.dataset_id,
            project_id,
            created_at: chrono_to_nanoseconds(Utc::now()),
            data,
            target,
            metadata,
            task_id: datapoint.task_id.clone(),
        }
    }
}

#[derive(Row, Deserialize)]
struct DatapointTaskId {
    #[serde(with = "clickhouse::serde::uuid")]
    id: Uuid,
    task_id: String,
}

/// Latest task id of each datapoint in the dataset that either is one of `ids`
/// or could collide with `task_ids` — an exact match or a `<task_id>#<n>` rename.
pub async fn get_datapoint_task_ids(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    dataset_id: Uuid,
    ids: &[Uuid],
    task_ids: &[String],
) -> Result<HashMap<Uuid, String>> {
    let rows = clickhouse
        .query(
            // The inner filter narrows the aggregation to candidate datapoints, so a push
            // doesn't aggregate every version of a large dataset.
            "SELECT id, argMax(task_id, created_at) AS task_id
             FROM dataset_datapoints
             WHERE project_id = {project_id:UUID} AND dataset_id = {dataset_id:UUID}
                AND id IN (
                    SELECT id FROM dataset_datapoints
                    WHERE project_id = {project_id:UUID} AND dataset_id = {dataset_id:UUID}
                        AND (id IN {ids:Array(UUID)}
                            OR task_id IN {task_ids:Array(String)}
                            OR replaceRegexpOne(task_id, '#[0-9]+$', '') IN {task_ids:Array(String)})
                )
             GROUP BY id
             HAVING id IN {ids:Array(UUID)}
                OR task_id IN {task_ids:Array(String)}
                OR replaceRegexpOne(task_id, '#[0-9]+$', '') IN {task_ids:Array(String)}",
        )
        .param("project_id", project_id)
        .param("dataset_id", dataset_id)
        .param("ids", ids)
        .param("task_ids", task_ids)
        .fetch_all::<DatapointTaskId>()
        .await?;
    Ok(rows.into_iter().map(|row| (row.id, row.task_id)).collect())
}

/// Insert datapoints into ClickHouse
pub async fn insert_datapoints(
    clickhouse: clickhouse::Client,
    datapoints: Vec<CHDatapoint>,
) -> Result<()> {
    if datapoints.is_empty() {
        return Ok(());
    }

    let ch_insert = clickhouse.insert::<CHDatapoint>("dataset_datapoints").await;
    match ch_insert {
        Ok(mut ch_insert) => {
            for datapoint in datapoints {
                ch_insert.write(&datapoint).await?;
            }
            let ch_insert_end_res = ch_insert.end().await;
            match ch_insert_end_res {
                Ok(_) => Ok(()),
                Err(e) => Err(anyhow::anyhow!(
                    "ClickHouse datapoints insertion failed: {:?}",
                    e
                )),
            }
        }
        Err(e) => Err(anyhow::anyhow!(
            "Failed to insert datapoints into ClickHouse: {:?}",
            e
        )),
    }
}
