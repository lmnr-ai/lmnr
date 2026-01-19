use anyhow::Result;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::instrument;
use uuid::Uuid;

use super::utils::chrono_to_nanoseconds;

#[derive(Row, Serialize, Deserialize, Debug)]
pub struct CHTraceAnalysisMessage {
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub job_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub task_id: Uuid,
    /// Time in nanoseconds since Unix epoch
    pub time: i64,
    pub message: String,
}

impl CHTraceAnalysisMessage {
    pub fn new(
        project_id: Uuid,
        job_id: Uuid,
        task_id: Uuid,
        time: chrono::DateTime<chrono::Utc>,
        message: String,
    ) -> Self {
        Self {
            project_id,
            job_id,
            task_id,
            time: chrono_to_nanoseconds(time),
            message,
        }
    }
}

#[instrument(skip(clickhouse, messages))]
pub async fn insert_trace_analysis_messages(
    clickhouse: clickhouse::Client,
    messages: &[CHTraceAnalysisMessage],
) -> Result<()> {
    if messages.is_empty() {
        return Ok(());
    }

    let ch_insert = clickhouse
        .insert::<CHTraceAnalysisMessage>("trace_analysis_messages")
        .await;

    match ch_insert {
        Ok(mut ch_insert) => {
            for message in messages {
                ch_insert.write(message).await?;
            }

            let ch_insert_end_res = ch_insert.end().await;
            match ch_insert_end_res {
                Ok(_) => Ok(()),
                Err(e) => Err(anyhow::anyhow!(
                    "Clickhouse trace_analysis_messages batch insertion failed: {:?}",
                    e
                )),
            }
        }
        Err(e) => Err(anyhow::anyhow!(
            "Failed to insert trace_analysis_messages batch into Clickhouse: {:?}",
            e
        )),
    }
}
