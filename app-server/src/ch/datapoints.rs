use anyhow::Result;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{db::datapoints::DBDatapoint, utils::json_value_to_string};

use super::utils::chrono_to_nanoseconds;

#[derive(Row, Serialize, Deserialize, Debug)]
pub struct CHDatapoint {
    #[serde(with = "clickhouse::serde::uuid")]
    pub id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub dataset_id: Uuid,
    pub dataset_name: String,
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    /// Created at time in nanoseconds
    pub created_at: i64,
    pub data: String,
    pub target: String,
    pub metadata: String,
}

impl CHDatapoint {
    pub fn from_db_datapoint(
        datapoint: &DBDatapoint,
        dataset_name: String,
        project_id: Uuid,
    ) -> Self {
        let data_string = json_value_to_string(&datapoint.data);
        let target_string =
            json_value_to_string(&datapoint.target.clone().unwrap_or(serde_json::Value::Null));
        let metadata_string = json_value_to_string(&datapoint.metadata);

        CHDatapoint {
            id: datapoint.id,
            dataset_id: datapoint.dataset_id,
            dataset_name,
            project_id,
            created_at: chrono_to_nanoseconds(datapoint.created_at),
            data: data_string,
            target: target_string,
            metadata: metadata_string,
        }
    }
}

pub async fn insert_datapoints_batch(
    clickhouse: clickhouse::Client,
    datapoints: &[CHDatapoint],
) -> Result<()> {
    if datapoints.is_empty() {
        return Ok(());
    }

    let ch_insert = clickhouse.insert("datapoints");
    match ch_insert {
        Ok(mut ch_insert) => {
            // Write all datapoints to the batch
            for datapoint in datapoints {
                ch_insert.write(datapoint).await?;
            }

            // End the batch insertion
            let ch_insert_end_res = ch_insert.end().await;
            match ch_insert_end_res {
                Ok(_) => Ok(()),
                Err(e) => {
                    return Err(anyhow::anyhow!(
                        "ClickHouse batch datapoint insertion failed: {:?}",
                        e
                    ));
                }
            }
        }
        Err(e) => {
            return Err(anyhow::anyhow!(
                "Failed to insert datapoints batch into ClickHouse: {:?}",
                e
            ));
        }
    }
}
