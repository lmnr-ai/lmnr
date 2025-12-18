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
        }
    }
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
