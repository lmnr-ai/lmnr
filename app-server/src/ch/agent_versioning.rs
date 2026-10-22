//! Agent versioning tables (`agent_versioning`): `agent_calls` and
//! `agent_lines`, written by the agent-call consumer, and
//! `trace_agent_versions`, written by the detection job.
//!
//! Times cross this module as unix microseconds, the tables' precision.

use std::collections::HashMap;

use anyhow::Result;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A trace's lines are its calls within this long of its first call, so a
/// trace's lines are known an hour after it starts.
const TRACE_WINDOW: &str = "INTERVAL 1 HOUR";

/// How far before a load's start a trace's first call is looked for. A trace
/// longer than this is timed by its first call within it.
const TRACE_LOOKBEHIND_MICROS: i64 = 24 * 60 * 60 * 1_000_000;

#[derive(Row, Serialize, Debug, Clone)]
pub struct CHAgentCall {
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    pub agent_hash: String,
    #[serde(with = "clickhouse::serde::uuid")]
    pub trace_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub span_id: Uuid,
    pub start_time: i64,
    pub line_hashes: Vec<u64>,
}

#[derive(Row, Serialize, Debug, Clone)]
pub struct CHAgentLine {
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    pub agent_hash: String,
    pub line_hash: u64,
    pub text: String,
}

#[derive(Row, Serialize, Debug, Clone)]
pub struct CHTraceAgentVersion {
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub trace_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub agent_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid::option")]
    pub agent_version_id: Option<Uuid>,
    pub settled: bool,
    pub start_time: i64,
}

/// Lossy by design: losing a few calls only thins an agent's traces, so the
/// consumer does not wait for the async insert to flush.
pub async fn insert_calls(clickhouse: &clickhouse::Client, calls: &[CHAgentCall]) -> Result<()> {
    if calls.is_empty() {
        return Ok(());
    }
    let mut insert = clickhouse
        .insert::<CHAgentCall>("agent_calls")
        .await?
        .with_setting("wait_for_async_insert", "0");
    for call in calls {
        insert.write(call).await?;
    }
    insert.end().await?;
    Ok(())
}

/// Waits for the flush: a line's text is shipped once per document, so a lost
/// insert would leave the line without text.
pub async fn insert_lines(clickhouse: &clickhouse::Client, lines: &[CHAgentLine]) -> Result<()> {
    if lines.is_empty() {
        return Ok(());
    }
    let mut insert = clickhouse.insert::<CHAgentLine>("agent_lines").await?;
    for line in lines {
        insert.write(line).await?;
    }
    insert.end().await?;
    Ok(())
}

/// Waits for the flush, so labels are stored before the run that produced
/// them commits its watermark.
pub async fn insert_labels(
    clickhouse: &clickhouse::Client,
    labels: &[CHTraceAgentVersion],
) -> Result<()> {
    if labels.is_empty() {
        return Ok(());
    }
    let mut insert = clickhouse
        .insert::<CHTraceAgentVersion>("trace_agent_versions")
        .await?;
    for label in labels {
        insert.write(label).await?;
    }
    insert.end().await?;
    Ok(())
}

#[derive(Row, Deserialize, Debug, Clone)]
pub struct ActiveAgent {
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    pub agent_hash: String,
    /// Latest call, in microseconds.
    pub last_call: i64,
}

/// Every agent with a call since `since`.
pub async fn active_agents(
    clickhouse: &clickhouse::Client,
    since: i64,
) -> Result<Vec<ActiveAgent>> {
    let agents = clickhouse
        .query(
            "SELECT project_id, agent_hash, toUnixTimestamp64Micro(max(start_time)) AS last_call
             FROM agent_calls
             WHERE start_time >= fromUnixTimestamp64Micro(?, 'UTC')
             GROUP BY project_id, agent_hash",
        )
        .bind(since)
        .fetch_all::<ActiveAgent>()
        .await?;
    Ok(agents)
}

/// The agent's traces starting in `[from, until]` as a CTE, `{trace_query}`
/// standing for any ordering or limit on it. A trace starts at its first call.
fn traces_cte(trace_query: &str) -> String {
    format!(
        "traces AS (
            SELECT trace_id, min(start_time) AS t
            FROM agent_calls
            WHERE project_id = ? AND agent_hash = ?
              AND start_time >= fromUnixTimestamp64Micro(?, 'UTC')
              AND start_time <= fromUnixTimestamp64Micro(?, 'UTC')
            GROUP BY trace_id
            HAVING t >= fromUnixTimestamp64Micro(?, 'UTC') AND t <= fromUnixTimestamp64Micro(?, 'UTC')
            {trace_query}
        )"
    )
}

fn lookbehind(from: i64) -> i64 {
    from.saturating_sub(TRACE_LOOKBEHIND_MICROS).max(0)
}

#[derive(Row, Deserialize, Debug)]
struct TraceBoundsRow {
    traces: u64,
    first: i64,
    last: i64,
}

/// The first and the `(limit + 1)`-th trace starting in `[from, until]`, in
/// microseconds. The second is `None` when there are at most `limit`.
pub async fn trace_bounds(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    agent_hash: &str,
    from: i64,
    until: i64,
    limit: usize,
) -> Result<Option<(i64, Option<i64>)>> {
    let sql = format!(
        "WITH {}
         SELECT count() AS traces,
                toUnixTimestamp64Micro(min(t)) AS first,
                toUnixTimestamp64Micro(arrayElement(groupArraySorted({})(t), -1)) AS last
         FROM traces",
        traces_cte(""),
        limit + 1,
    );
    let row = clickhouse
        .query(&sql)
        .bind(project_id)
        .bind(agent_hash)
        .bind(lookbehind(from))
        .bind(until)
        .bind(from)
        .bind(until)
        .fetch_one::<TraceBoundsRow>()
        .await?;
    if row.traces == 0 {
        return Ok(None);
    }
    Ok(Some((
        row.first,
        (row.traces > limit as u64).then_some(row.last),
    )))
}

#[derive(Row, Deserialize, Debug)]
pub struct TraceRow {
    #[serde(with = "clickhouse::serde::uuid")]
    pub trace_id: Uuid,
    /// First call, in microseconds.
    pub time: i64,
    /// Sorted, distinct line hashes of the calls within [`TRACE_WINDOW`] of
    /// the first.
    pub lines: Vec<u64>,
}

/// The agent's traces starting in `[from, until]`; with `latest`, only that
/// many of the latest. Unordered.
pub async fn load_traces(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    agent_hash: &str,
    from: i64,
    until: i64,
    latest: Option<usize>,
) -> Result<Vec<TraceRow>> {
    let limit = latest
        .map(|n| format!("ORDER BY t DESC, trace_id DESC LIMIT {n}"))
        .unwrap_or_default();
    let sql = format!(
        "WITH {}
         SELECT trace_id,
                toUnixTimestamp64Micro(any(traces.t)) AS time,
                arraySort(arrayDistinct(arrayFlatten(groupArray(line_hashes)))) AS lines
         FROM agent_calls
         INNER JOIN traces USING (trace_id)
         WHERE project_id = ? AND agent_hash = ?
           AND start_time >= fromUnixTimestamp64Micro(?, 'UTC')
           AND start_time <= fromUnixTimestamp64Micro(?, 'UTC') + {TRACE_WINDOW}
           AND start_time <= traces.t + {TRACE_WINDOW}
         GROUP BY trace_id",
        traces_cte(&limit),
    );
    let floor = lookbehind(from);
    let traces = clickhouse
        .query(&sql)
        .bind(project_id)
        .bind(agent_hash)
        .bind(floor)
        .bind(until)
        .bind(from)
        .bind(until)
        .bind(project_id)
        .bind(agent_hash)
        .bind(floor)
        .bind(until)
        .fetch_all::<TraceRow>()
        .await?;
    Ok(traces)
}

/// The line hashes of one trace's calls within [`TRACE_WINDOW`] of its start
/// `time`, in call and document order.
pub async fn trace_line_hashes(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    agent_hash: &str,
    trace_id: Uuid,
    time: i64,
) -> Result<Vec<u64>> {
    let calls = clickhouse
        .query(&format!(
            "SELECT line_hashes
             FROM agent_calls
             WHERE project_id = ? AND agent_hash = ? AND trace_id = ?
               AND start_time >= fromUnixTimestamp64Micro(?, 'UTC')
               AND start_time <= fromUnixTimestamp64Micro(?, 'UTC') + {TRACE_WINDOW}
             ORDER BY start_time"
        ))
        .bind(project_id)
        .bind(agent_hash)
        .bind(trace_id)
        .bind(time)
        .bind(time)
        .fetch_all::<Vec<u64>>()
        .await?;
    Ok(calls.into_iter().flatten().collect())
}

#[derive(Row, Deserialize, Debug)]
struct LineTextRow {
    line_hash: u64,
    text: String,
}

/// Display text of each of `hashes` that has one.
pub async fn line_texts(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    agent_hash: &str,
    hashes: &[u64],
) -> Result<HashMap<u64, String>> {
    if hashes.is_empty() {
        return Ok(HashMap::new());
    }
    let rows = clickhouse
        .query(
            "SELECT line_hash, any(text) AS text
             FROM agent_lines
             WHERE project_id = ? AND agent_hash = ? AND has(?, line_hash)
             GROUP BY line_hash",
        )
        .bind(project_id)
        .bind(agent_hash)
        .bind(hashes)
        .fetch_all::<LineTextRow>()
        .await?;
    Ok(rows
        .into_iter()
        .map(|row| (row.line_hash, row.text))
        .collect())
}
