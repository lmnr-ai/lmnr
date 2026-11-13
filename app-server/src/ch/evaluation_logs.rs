//! Output of remote eval runs' orchestrators (`evaluation_logs`, migration 85),
//! keyed by the run's upload id and read back in `seq` order.

use anyhow::Result;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Field order must match the `evaluation_logs` columns: the clickhouse crate
/// writes `RowBinary` by position.
#[derive(Debug, Clone, Row, Serialize, Deserialize)]
pub struct CHEvaluationLog {
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub upload_id: Uuid,
    pub seq: u64,
    /// Nanoseconds since the epoch.
    pub time: i64,
    pub text: String,
    /// Set on the run's last row only: the orchestrator's exit code.
    pub exit_code: Option<i32>,
}

/// Returns once the rows are visible (the client waits for async inserts), so a
/// run's next batch never becomes readable before this one.
pub async fn insert_evaluation_logs(
    clickhouse: &clickhouse::Client,
    rows: &[CHEvaluationLog],
) -> Result<()> {
    if rows.is_empty() {
        return Ok(());
    }
    let mut insert = clickhouse
        .insert::<CHEvaluationLog>("evaluation_logs")
        .await?;
    for row in rows {
        insert.write(row).await?;
    }
    insert.end().await?;
    Ok(())
}

/// Where a run's log stands, for appending its last rows.
pub enum LogState {
    /// Still open; `next_seq` is the first free `seq` (0 for a run with no rows).
    Open { next_seq: u64 },
    /// The exit-code row is already there.
    Ended,
}

pub async fn log_state(
    clickhouse: &clickhouse::Client,
    project_id: &Uuid,
    upload_id: &Uuid,
) -> Result<LogState> {
    let (next, ended) = clickhouse
        .query(
            "SELECT if(count() = 0, 0, max(seq) + 1), toUInt8(countIf(exit_code IS NOT NULL) > 0)
             FROM evaluation_logs
             WHERE project_id = {project_id:UUID} AND upload_id = {upload_id:UUID}",
        )
        .param("project_id", project_id)
        .param("upload_id", upload_id)
        .fetch_one::<(u64, u8)>()
        .await?;
    Ok(if ended == 0 {
        LogState::Open { next_seq: next }
    } else {
        LogState::Ended
    })
}

/// Up to `limit` rows from `from` on, in `seq` order. A retried batch can leave
/// duplicates until the table merges, hence `LIMIT 1 BY seq`.
pub async fn get_evaluation_logs(
    clickhouse: &clickhouse::Client,
    project_id: &Uuid,
    upload_id: &Uuid,
    from: u64,
    limit: u64,
) -> Result<Vec<CHEvaluationLog>> {
    let rows = clickhouse
        .query(
            "SELECT ?fields
             FROM evaluation_logs
             WHERE project_id = {project_id:UUID}
               AND upload_id = {upload_id:UUID}
               AND seq >= {from:UInt64}
             ORDER BY seq
             LIMIT 1 BY seq
             LIMIT {limit:UInt64}",
        )
        .param("project_id", project_id)
        .param("upload_id", upload_id)
        .param("from", from)
        .param("limit", limit)
        .fetch_all::<CHEvaluationLog>()
        .await?;
    Ok(rows)
}
