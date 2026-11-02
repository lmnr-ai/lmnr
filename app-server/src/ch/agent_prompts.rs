//! `agent_prompts`: each production agent LLM span's prompt as masked line
//! hashes, the input of `crate::agent_versioning`. Times are nanoseconds.
//! Every read sees only rows ingested up to the caller's `ingested_until`, so a
//! row ingested later is picked up exactly once, as late.

use anyhow::Result;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Row, Serialize, Debug, Clone)]
pub struct CHAgentPrompt {
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    pub agent_hash: String,
    #[serde(with = "clickhouse::serde::uuid")]
    pub trace_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub span_id: Uuid,
    pub start_time: i64,
    pub model: String,
    pub line_hashes: Vec<u64>,
    /// Empty when the span carried no release.
    pub release: String,
}

pub async fn insert_agent_prompts(
    clickhouse: &clickhouse::Client,
    rows: &[CHAgentPrompt],
) -> Result<()> {
    if rows.is_empty() {
        return Ok(());
    }
    let mut insert = clickhouse
        .insert::<CHAgentPrompt>("agent_prompts")
        .await?
        .with_setting("async_insert", "1")
        .with_setting("wait_for_async_insert", "0");
    for row in rows {
        insert.write(row).await?;
    }
    insert.end().await?;
    Ok(())
}

#[derive(Row, Deserialize, Debug)]
pub struct ActiveAgent {
    #[serde(with = "clickhouse::serde::uuid")]
    pub project_id: Uuid,
    pub agent_hash: String,
}

/// Agents with prompts ingested after `since`.
pub async fn active_agents(
    clickhouse: &clickhouse::Client,
    since: i64,
) -> Result<Vec<ActiveAgent>> {
    let agents = clickhouse
        .query(
            "SELECT DISTINCT project_id, agent_hash
             FROM agent_prompts
             WHERE ingested_at > fromUnixTimestamp64Nano({since:Int64})",
        )
        .param("since", since)
        .fetch_all::<ActiveAgent>()
        .await?;
    Ok(agents)
}

/// One trace's first agent prompt in the queried rows.
#[derive(Row, Deserialize, Debug)]
pub struct TracePrompt {
    #[serde(with = "clickhouse::serde::uuid")]
    pub trace_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub span_id: Uuid,
    pub time: i64,
    pub lines: Vec<u64>,
    /// Non-empty models across the trace's rows.
    pub models: Vec<String>,
    /// Any of the rows' releases; empty when they carried none.
    pub trace_release: String,
}

pub struct Scope<'a> {
    pub project_id: Uuid,
    pub agent_hash: &'a str,
    pub ingested_until: i64,
}

// `time`, `lines` and `trace_release` must not reuse column names: ClickHouse
// substitutes an alias into `WHERE` and the other aggregates.
const TRACE_PROMPT_COLUMNS: &str = "trace_id,
    argMin(span_id, start_time) AS span_id,
    min(start_time) AS time,
    {lines} AS lines,
    groupUniqArrayIf(model, model != '') AS models,
    any(release) AS trace_release";

fn trace_prompts_query(lines: bool, filter: &str, tail: &str) -> String {
    let lines = if lines {
        "argMin(line_hashes, start_time)"
    } else {
        "CAST([], 'Array(UInt64)')"
    };
    format!(
        "SELECT {}
         FROM agent_prompts
         WHERE project_id = {{project_id:UUID}}
           AND agent_hash = {{agent_hash:String}}
           AND ingested_at <= fromUnixTimestamp64Nano({{ingested_until:Int64}})
           AND {filter}
         GROUP BY trace_id
         {tail}",
        TRACE_PROMPT_COLUMNS.replace("{lines}", lines)
    )
}

impl Scope<'_> {
    fn query(&self, clickhouse: &clickhouse::Client, sql: &str) -> clickhouse::query::Query {
        clickhouse
            .query(sql)
            .param("project_id", self.project_id)
            .param("agent_hash", self.agent_hash)
            .param("ingested_until", self.ingested_until)
    }

    /// Up to `limit` traces starting in `(from, to]`, at most `per_minute`
    /// per minute, oldest first; newest first when `newest` is set.
    pub async fn samples(
        &self,
        clickhouse: &clickhouse::Client,
        (from, to): (i64, i64),
        per_minute: u64,
        limit: u64,
        newest: bool,
    ) -> Result<Vec<TracePrompt>> {
        let order = if newest { "DESC" } else { "ASC" };
        let sql = trace_prompts_query(
            true,
            "start_time > fromUnixTimestamp64Nano({from:Int64})
             AND start_time <= fromUnixTimestamp64Nano({to:Int64})",
            &format!(
                "ORDER BY time {order}
                 LIMIT {{per_minute:UInt64}} BY toStartOfMinute(time)
                 LIMIT {{limit:UInt64}}"
            ),
        );
        let rows = self
            .query(clickhouse, &sql)
            .param("from", from)
            .param("to", to)
            .param("per_minute", per_minute)
            .param("limit", limit)
            .fetch_all::<TracePrompt>()
            .await?;
        Ok(rows)
    }

    /// Every trace starting in `(from, to]`; with its prompt when `lines`.
    pub async fn traces(
        &self,
        clickhouse: &clickhouse::Client,
        (from, to): (i64, i64),
        lines: bool,
    ) -> Result<Vec<TracePrompt>> {
        let sql = trace_prompts_query(
            lines,
            "start_time > fromUnixTimestamp64Nano({from:Int64})
             AND start_time <= fromUnixTimestamp64Nano({to:Int64})",
            "",
        );
        let rows = self
            .query(clickhouse, &sql)
            .param("from", from)
            .param("to", to)
            .fetch_all::<TracePrompt>()
            .await?;
        Ok(rows)
    }

    /// Traces first seen after `since` (every row ingested after it) whose
    /// first prompt starts at or before `until`, the already-labelled
    /// stretch. A trace with a row seen earlier was already labelled.
    pub async fn late(
        &self,
        clickhouse: &clickhouse::Client,
        since: i64,
        until: i64,
    ) -> Result<Vec<TracePrompt>> {
        let sql = trace_prompts_query(
            true,
            "start_time <= fromUnixTimestamp64Nano({until:Int64})
             AND trace_id IN (
                 SELECT trace_id FROM agent_prompts
                 WHERE project_id = {project_id:UUID}
                   AND agent_hash = {agent_hash:String}
                   AND ingested_at > fromUnixTimestamp64Nano({since:Int64})
                   AND ingested_at <= fromUnixTimestamp64Nano({ingested_until:Int64})
                   AND start_time <= fromUnixTimestamp64Nano({until:Int64}))",
            "HAVING min(ingested_at) > fromUnixTimestamp64Nano({since:Int64})",
        );
        let rows = self
            .query(clickhouse, &sql)
            .param("since", since)
            .param("until", until)
            .fetch_all::<TracePrompt>()
            .await?;
        Ok(rows)
    }
}

/// One release of the agent: its earliest prompt and how many traces carry it.
#[derive(Row, Deserialize, Debug)]
pub struct ReleaseStats {
    pub release: String,
    pub first_seen: i64,
    pub traces: u64,
}

/// Prompts read to choose an agent's mode, newest first.
const RELEASE_SHARE_ROWS: u64 = 100;

/// Of the agent's latest prompts, how many carry a release.
#[derive(Row, Deserialize, Debug)]
pub struct ReleaseShare {
    pub with_release: u64,
    pub total: u64,
}

impl Scope<'_> {
    /// Each release's stats, oldest first.
    pub async fn releases(&self, clickhouse: &clickhouse::Client) -> Result<Vec<ReleaseStats>> {
        let rows = self
            .query(
                clickhouse,
                "SELECT release, min(start_time) AS first_seen, uniqExact(trace_id) AS traces
                 FROM agent_prompts
                 WHERE project_id = {project_id:UUID}
                   AND agent_hash = {agent_hash:String}
                   AND ingested_at <= fromUnixTimestamp64Nano({ingested_until:Int64})
                   AND release != ''
                 GROUP BY release
                 ORDER BY first_seen, release",
            )
            .fetch_all::<ReleaseStats>()
            .await?;
        Ok(rows)
    }

    pub async fn release_share(&self, clickhouse: &clickhouse::Client) -> Result<ReleaseShare> {
        let share = self
            .query(
                clickhouse,
                "SELECT countIf(release != '') AS with_release, count() AS total
                 FROM (
                     SELECT release FROM agent_prompts
                     WHERE project_id = {project_id:UUID}
                       AND agent_hash = {agent_hash:String}
                       AND ingested_at <= fromUnixTimestamp64Nano({ingested_until:Int64})
                     ORDER BY start_time DESC
                     LIMIT {limit:UInt64})",
            )
            .param("limit", RELEASE_SHARE_ROWS)
            .fetch_one::<ReleaseShare>()
            .await?;
        Ok(share)
    }

    /// Up to `limit` of the release's traces, newest first; with an empty
    /// `release`, traces without one starting before `before`.
    pub async fn release_samples(
        &self,
        clickhouse: &clickhouse::Client,
        release: &str,
        before: i64,
        limit: u64,
    ) -> Result<Vec<TracePrompt>> {
        let sql = trace_prompts_query(
            true,
            "release = {release:String}
             AND start_time < fromUnixTimestamp64Nano({before:Int64})",
            "ORDER BY time DESC LIMIT {limit:UInt64}",
        );
        let rows = self
            .query(clickhouse, &sql)
            .param("release", release)
            .param("before", before)
            .param("limit", limit)
            .fetch_all::<TracePrompt>()
            .await?;
        Ok(rows)
    }

    /// The traces of `releases` starting after `after`, with a prompt ingested
    /// after `since`, without their prompts.
    pub async fn release_traces(
        &self,
        clickhouse: &clickhouse::Client,
        releases: &[&str],
        since: i64,
        after: i64,
    ) -> Result<Vec<TracePrompt>> {
        // A trace's start is its first prompt, so the traces with a new
        // prompt are picked first and then read whole.
        let filter = match since {
            0 => "release IN {releases:Array(String)}",
            _ => {
                "release IN {releases:Array(String)}
                  AND trace_id IN (
                      SELECT trace_id FROM agent_prompts
                      WHERE project_id = {project_id:UUID}
                        AND agent_hash = {agent_hash:String}
                        AND ingested_at > fromUnixTimestamp64Nano({since:Int64})
                        AND ingested_at <= fromUnixTimestamp64Nano({ingested_until:Int64})
                        AND release IN {releases:Array(String)})"
            }
        };
        let sql = trace_prompts_query(
            false,
            filter,
            "HAVING time > fromUnixTimestamp64Nano({after:Int64})",
        );
        let rows = self
            .query(clickhouse, &sql)
            .param("releases", releases)
            .param("since", since)
            .param("after", after)
            .fetch_all::<TracePrompt>()
            .await?;
        Ok(rows)
    }
}

#[derive(Row, Deserialize)]
struct SpanDoc {
    input: String,
    tool_definitions: String,
}

/// A span's system prompt and tool definitions, PII redacted as stored.
pub async fn fetch_agent_doc(
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    trace_id: Uuid,
    span_id: Uuid,
) -> Result<Option<(String, String)>> {
    let doc = clickhouse
        .query(
            "SELECT input, tool_definitions
             FROM spans_v1(project_id={project_id:UUID}, policy='{}')
             WHERE trace_id = {trace_id:UUID} AND span_id = {span_id:UUID}
             LIMIT 1",
        )
        .param("project_id", project_id)
        .param("trace_id", trace_id)
        .param("span_id", span_id)
        .fetch_optional::<SpanDoc>()
        .await?;
    Ok(doc.map(|d| (d.input, d.tool_definitions)))
}
