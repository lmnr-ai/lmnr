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
    pub run_id: Uuid,
    /// Time in nanoseconds since Unix epoch
    pub time: i64,
    pub status: String,
    #[serde(with = "clickhouse::serde::uuid")]
    pub event_id: Uuid,
}

impl CHSignalRun {
    pub fn new(
        project_id: Uuid,
        signal_id: Uuid,
        job_id: Uuid,
        run_id: Uuid,
        time: chrono::DateTime<chrono::Utc>,
        status: String,
        event_id: Uuid,
    ) -> Self {
        Self {
            project_id,
            signal_id,
            job_id,
            run_id,
            time: chrono_to_nanoseconds(time),
            status,
            event_id,
        }
    }
}

impl From<&SignalRun> for CHSignalRun {
    fn from(run: &SignalRun) -> Self {
        Self {
            project_id: run.project_id,
            signal_id: run.signal_id,
            job_id: run.job_id,
            run_id: run.run_id,
            time: chrono_to_nanoseconds(run.time),
            status: run.status.to_string(),
            event_id: run.event_id.unwrap_or(Uuid::nil()),
        }
    }
}

#[allow(dead_code)]
#[instrument(skip(clickhouse))]
pub async fn get_signal_runs_for_job(
    clickhouse: clickhouse::Client,
    project_id: Uuid,
    signal_id: Uuid,
    job_id: Uuid,
) -> Result<Vec<CHSignalRun>> {
    let runs = clickhouse
        .query(
            "SELECT project_id, signal_id, job_id, run_id, time, status, event_id
             FROM signal_runs FINAL
             WHERE project_id = ? AND signal_id = ? AND job_id = ?
             ORDER BY time ASC",
        )
        .bind(project_id)
        .bind(signal_id)
        .bind(job_id)
        .fetch_all::<CHSignalRun>()
        .await?;

    Ok(runs)
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
