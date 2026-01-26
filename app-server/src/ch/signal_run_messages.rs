use anyhow::Result;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::instrument;
use uuid::Uuid;

use super::utils::chrono_to_nanoseconds;

#[derive(Row, Serialize, Deserialize, Debug)]
pub struct CHSignalRunMessage {
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub run_id: Uuid,
    /// Time in nanoseconds since Unix epoch
    pub time: i64,
    pub message: String,
}

impl CHSignalRunMessage {
    pub fn new(
        project_id: Uuid,
        run_id: Uuid,
        time: chrono::DateTime<chrono::Utc>,
        message: String,
    ) -> Self {
        Self {
            project_id,
            run_id: run_id,
            time: chrono_to_nanoseconds(time),
            message,
        }
    }
}

#[instrument(skip(clickhouse, messages))]
pub async fn insert_signal_run_messages(
    clickhouse: clickhouse::Client,
    messages: &[CHSignalRunMessage],
) -> Result<()> {
    let ch_insert = clickhouse
        .insert::<CHSignalRunMessage>("signal_run_messages")
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
                    "Clickhouse signal_run_messages batch insertion failed: {:?}",
                    e
                )),
            }
        }
        Err(e) => Err(anyhow::anyhow!(
            "Failed to insert signal_run_messages batch into Clickhouse: {:?}",
            e
        )),
    }
}

#[instrument(skip(clickhouse))]
pub async fn get_signal_run_messages(
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    run_id: Uuid,
) -> Result<Vec<CHSignalRunMessage>> {
    let messages = clickhouse
        .query("SELECT project_id, run_id, time, message FROM signal_run_messages WHERE project_id = ? AND run_id = ? ORDER BY time ASC")
        .bind(project_id)
        .bind(run_id)
        .fetch_all::<CHSignalRunMessage>()
        .await?;

    Ok(messages)
}

#[instrument(skip(clickhouse, run_ids))]
pub async fn delete_signal_run_messages(
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    run_ids: &[Uuid],
) -> Result<()> {
    if run_ids.is_empty() {
        return Ok(());
    }

    // Build comma-separated list of quoted UUIDs
    let run_ids_str = run_ids
        .iter()
        .map(|id| format!("'{}'", id))
        .collect::<Vec<_>>()
        .join(", ");

    let query = format!(
        "DELETE FROM signal_run_messages WHERE project_id = ? AND run_id IN ({})",
        run_ids_str
    );

    clickhouse.query(&query).bind(project_id).execute().await?;

    Ok(())
}
