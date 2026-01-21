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

#[instrument(skip(clickhouse))]
pub async fn get_trace_analysis_messages_for_task(
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    job_id: Uuid,
    task_id: Uuid,
) -> Result<Vec<CHTraceAnalysisMessage>> {
    let messages = clickhouse
        .query("SELECT project_id, job_id, task_id, time, message FROM trace_analysis_messages WHERE project_id = ? AND job_id = ? AND task_id = ? ORDER BY time ASC")
        .bind(project_id)
        .bind(job_id)
        .bind(task_id)
        .fetch_all::<CHTraceAnalysisMessage>()
        .await?;

    Ok(messages)
}

#[instrument(skip(clickhouse, task_ids))]
pub async fn delete_trace_analysis_messages_by_task_ids(
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    job_id: Uuid,
    task_ids: &[Uuid],
) -> Result<()> {
    if task_ids.is_empty() {
        return Ok(());
    }

    // Build comma-separated list of quoted UUIDs
    let task_ids_str = task_ids
        .iter()
        .map(|id| format!("'{}'", id))
        .collect::<Vec<_>>()
        .join(", ");

    let query = format!(
        "DELETE FROM trace_analysis_messages WHERE project_id = ? AND job_id = ? AND task_id IN ({})",
        task_ids_str
    );

    clickhouse
        .query(&query)
        .bind(project_id)
        .bind(job_id)
        .execute()
        .await?;

    Ok(())
}
