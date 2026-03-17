use anyhow::Result;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::instrument;
use uuid::Uuid;

use super::utils::chrono_to_nanoseconds;
use crate::signals::SignalRun;

#[derive(Row, Serialize, Deserialize, Debug)]
pub struct CHSignalRun {
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub signal_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub job_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub trigger_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub run_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub trace_id: Uuid,
    /// Status: 0 = Pending, 1 = Completed, 2 = Failed
    pub status: u8,
    #[serde(with = "clickhouse::serde::uuid")]
    pub event_id: Uuid,
    pub error_message: String,
    /// Time in nanoseconds since Unix epoch
    pub updated_at: i64,
}

impl From<&SignalRun> for CHSignalRun {
    fn from(run: &SignalRun) -> Self {
        Self {
            project_id: run.project_id,
            signal_id: run.signal_id,
            job_id: run.job_id.unwrap_or_default(),
            trigger_id: run.trigger_id.unwrap_or_default(),
            run_id: run.run_id,
            trace_id: run.trace_id,
            status: run.status.as_u8(),
            event_id: run.event_id.unwrap_or(Uuid::nil()),
            error_message: run.error_message.clone().unwrap_or_default(),
            updated_at: chrono_to_nanoseconds(run.updated_at),
        }
    }
}

#[instrument(skip(clickhouse, runs))]
pub async fn insert_signal_runs(
    clickhouse: clickhouse::Client,
    runs: &[CHSignalRun],
) -> Result<()> {
    if runs.is_empty() {
        return Ok(());
    }

    let ch_insert = clickhouse.insert::<CHSignalRun>("signal_runs").await;

    match ch_insert {
        Ok(mut ch_insert) => {
            for run in runs {
                ch_insert.write(run).await?;
            }

            let ch_insert_end_res = ch_insert.end().await;
            match ch_insert_end_res {
                Ok(_) => Ok(()),
                Err(e) => Err(anyhow::anyhow!(
                    "Clickhouse signal_runs batch insertion failed: {:?}",
                    e
                )),
            }
        }
        Err(e) => Err(anyhow::anyhow!(
            "Failed to insert signal_runs batch into Clickhouse: {:?}",
            e
        )),
    }
}

#[derive(Row, Deserialize, Debug)]
pub struct CHHasMoreRow {
    has_more: bool,
}

pub async fn project_has_num_signal_runs(
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    number: usize,
) -> Result<bool> {
    let row = clickhouse
        .query(
            "SELECT count (*) >= ? AS has_more
             FROM (
                SELECT 1
                FROM signal_runs FINAL
                WHERE project_id = ?
                -- small optimization to not iterate over many rows
                LIMIT ?
            )",
        )
        .bind(number)
        .bind(project_id)
        .bind(number + 1)
        .fetch_one::<CHHasMoreRow>()
        .await?;

    Ok(row.has_more)
}
