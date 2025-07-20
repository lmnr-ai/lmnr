use anyhow::Result;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

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
        let data = serde_json::from_str(&ch_datapoint.data).unwrap_or(serde_json::Value::Null);
        let target = if ch_datapoint.target == "<null>" || ch_datapoint.target.is_empty() {
            None
        } else {
            serde_json::from_str(&ch_datapoint.target).ok()
        };
        let metadata: HashMap<String, serde_json::Value> =
            serde_json::from_str(&ch_datapoint.metadata).unwrap_or_default();
        println!("metadata: {:?}", metadata);
        println!("data: {:?}", data);
        println!("target: {:?}", target);
        Datapoint {
            id: ch_datapoint.id,
            dataset_id: ch_datapoint.dataset_id,
            data,
            target,
            metadata,
        }
    }
}

/// Get paginated datapoints from ClickHouse
pub async fn get_datapoints_paginated(
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    dataset_id: Uuid,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<CHDatapoint>> {
    let mut query = String::from(
        "SELECT 
            id,
            dataset_id,
            project_id,
            created_at,
            data,
            target,
            metadata
        FROM datapoints
        WHERE project_id = ? AND dataset_id = ?
        ORDER BY created_at DESC",
    );

    if let Some(limit) = limit {
        query.push_str(&format!(" LIMIT {}", limit));
    }
    if let Some(offset) = offset {
        query.push_str(&format!(" OFFSET {}", offset));
    }

    let datapoints = clickhouse
        .query(&query)
        .bind(project_id)
        .bind(dataset_id)
        .fetch_all::<CHDatapoint>()
        .await?;

    Ok(datapoints)
}

#[derive(Row, Deserialize)]
struct CountResult {
    count: u64,
}

/// Count total datapoints in ClickHouse
pub async fn count_datapoints(
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    dataset_id: Uuid,
) -> Result<u64> {
    let result = clickhouse
        .query("SELECT COUNT(*) as count FROM datapoints WHERE project_id = ? AND dataset_id = ?")
        .bind(project_id)
        .bind(dataset_id)
        .fetch_one::<CountResult>()
        .await?;

    Ok(result.count)
}
