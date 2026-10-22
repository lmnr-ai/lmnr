//! Replays a project's real LLM spans through the detector, read-only, and
//! prints each agent's versions, changes and labels next to the
//! `sp_versioning` versions in `traces_agg.agent_versions`.
//!
//!   cargo test --bin app-server agent_versioning::replay -- --ignored --nocapture
//!
//! Reads `CLICKHOUSE_URL` / `CLICKHOUSE_USER` / `CLICKHOUSE_PASSWORD` from the
//! environment or `app-server/.env`. Optional: `REPLAY_PROJECT` (defaults to
//! the staging project with real traffic), `REPLAY_DAYS` (0 = all, the
//! default) and `REPLAY_MIN_TRACES` (comma-separated, one pass each).

use std::collections::{BTreeMap, HashMap, HashSet};

use chrono::DateTime;
use clickhouse::Row;
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use super::{
    detector::{AgentState, Config, RunOutput, Trace},
    document::{self, LineSet},
    simulation,
};
use crate::traces::prompt_hash::{extract_system_message, prompt_hashes};

const DEFAULT_PROJECT: &str = "0cce3ee3-d6bb-437d-a2fa-bbfd72a935e2";

/// Agents with fewer traces are listed but not replayed.
const MIN_AGENT_TRACES: usize = 10;

const LABEL_STRIP_TRACES: usize = 300;

#[derive(Row, Deserialize)]
struct SpanRow {
    trace_id: String,
    start_ns: i64,
    input: String,
    tools: String,
}

#[derive(Row, Deserialize)]
struct AgentVersionRow {
    trace_id: String,
    agent_hash: String,
    version_hash: String,
}

/// One agent's traces as the detector sees them, plus display data.
#[derive(Default)]
struct Agent {
    /// The first rendered line of its first call.
    title: String,
    calls: usize,
    traces: HashMap<Uuid, Trace>,
}

#[derive(Default)]
struct Corpus {
    agents: HashMap<String, Agent>,
    /// Line hash to the first text seen for it, for printing diffs.
    text: HashMap<u64, String>,
    spans: usize,
    without_system_prompt: usize,
}

fn env_or(name: &str, default: &str) -> String {
    std::env::var(name).unwrap_or(default.to_string())
}

fn client() -> clickhouse::Client {
    clickhouse::Client::default()
        .with_url(env_or("CLICKHOUSE_URL", "http://localhost:8123"))
        .with_user(env_or("CLICKHOUSE_USER", "ch_user"))
        .with_password(env_or("CLICKHOUSE_PASSWORD", "ch_passwd"))
}

async fn load(client: &clickhouse::Client, project: Uuid, days: u32) -> Corpus {
    let since = match days {
        0 => String::new(),
        days => format!("AND start_time >= now() - INTERVAL {days} DAY"),
    };
    let sql = format!(
        "SELECT toString(trace_id) AS trace_id, toUnixTimestamp64Nano(start_time) AS start_ns, \
         input, toString(tool_definitions) AS tools \
         FROM spans_v1(project_id = '{project}', policy = '{{}}') \
         WHERE span_type = 'LLM' {since} ORDER BY start_time"
    );
    let mut corpus = Corpus::default();
    let mut cursor = client.query(&sql).fetch::<SpanRow>().unwrap();
    while let Some(row) = cursor.next().await.unwrap() {
        corpus.spans += 1;
        let system_prompt = serde_json::from_str::<Value>(&row.input)
            .ok()
            .and_then(|input| extract_system_message(&input))
            .map(|(system_prompt, _)| system_prompt);
        let Some(system_prompt) = system_prompt else {
            corpus.without_system_prompt += 1;
            continue;
        };
        let tools = serde_json::from_str::<Vec<Value>>(&row.tools).unwrap_or_default();
        let lines = document::render(&system_prompt, &tools);
        for line in &lines {
            corpus
                .text
                .entry(document::line_hash(line))
                .or_insert(line.clone());
        }
        let time = DateTime::from_timestamp_nanos(row.start_ns);
        let trace_id: Uuid = row.trace_id.parse().unwrap();
        let agent = corpus
            .agents
            .entry(prompt_hashes(&system_prompt).first_sentence)
            .or_default();
        if agent.title.is_empty() {
            agent.title = lines.first().cloned().unwrap_or_default();
        }
        agent.calls += 1;
        let trace = agent.traces.entry(trace_id).or_insert(Trace {
            trace_id,
            time,
            lines: LineSet::new(),
        });
        trace.time = trace.time.min(time);
        trace.lines.extend(document::line_set(&lines));
        trace.lines.sort_unstable();
        trace.lines.dedup();
    }
    corpus
}

/// `sp_versioning` version hashes per (agent, trace).
async fn load_sp_versions(
    client: &clickhouse::Client,
    project: Uuid,
) -> HashMap<(String, Uuid), String> {
    let sql = format!(
        "SELECT DISTINCT toString(id) AS trace_id, tupleElement(v, 'agent_hash') AS agent_hash, \
         tupleElement(v, 'version_hash') AS version_hash \
         FROM traces_agg ARRAY JOIN agent_versions AS v WHERE project_id = '{project}'"
    );
    client
        .query(&sql)
        .fetch_all::<AgentVersionRow>()
        .await
        .unwrap()
        .into_iter()
        .map(|row| {
            (
                (row.agent_hash, row.trace_id.parse().unwrap()),
                row.version_hash,
            )
        })
        .collect()
}

fn label_map(output: &RunOutput) -> HashMap<Uuid, Option<usize>> {
    output
        .labels
        .iter()
        .map(|label| (label.trace_id, label.version))
        .collect()
}

fn version_name(version: Option<usize>) -> String {
    version.map_or("none".to_string(), |v| format!("v{v}"))
}

/// Prints one pass and returns how many labels differ between a batch run
/// and 10-minute incremental runs.
fn report(
    agent_hash: &str,
    traces: &[Trace],
    config: &Config,
    text: &HashMap<u64, String>,
    sp_versions: &HashMap<(String, Uuid), String>,
) -> usize {
    let (state, batch): (AgentState, RunOutput) = simulation::batch(traces, config);
    let (incremental_state, incremental) = simulation::incremental(traces, config);
    let labels = label_map(&batch);
    let incremental_labels = label_map(&incremental);
    let mismatches = traces
        .iter()
        .filter(|t| labels.get(&t.trace_id) != incremental_labels.get(&t.trace_id))
        .count();

    let mut per_version: BTreeMap<Option<usize>, usize> = BTreeMap::new();
    for version in labels.values() {
        *per_version.entry(*version).or_default() += 1;
    }
    println!(
        "  min_traces={}: {} version(s) ({} incremental), {} change(s); labels {}; \
         {mismatches} batch/incremental label mismatch(es)",
        config.min_traces,
        state.versions.len(),
        incremental_state.versions.len(),
        batch.events.len(),
        per_version
            .iter()
            .map(|(version, count)| format!("{}={count}", version_name(*version)))
            .collect::<Vec<_>>()
            .join(" "),
    );
    // One character per trace in time order: the version's last digit, or
    // `.` for none.
    let strip: String = traces
        .iter()
        .take(LABEL_STRIP_TRACES)
        .map(|t| match labels.get(&t.trace_id).copied().flatten() {
            Some(version) => char::from_digit((version % 10) as u32, 10).unwrap(),
            None => '.',
        })
        .collect();
    println!("    labels: {strip}");
    for (i, version) in state.versions.iter().enumerate() {
        println!(
            "    v{i}: core {} lines, first since {}",
            version.core.len(),
            version.since.format("%m-%d %a %H:%M:%S"),
        );
    }
    for event in &batch.events {
        print!("  {}", simulation::describe(event, text));
    }

    let mut cross: BTreeMap<(String, Option<usize>), usize> = BTreeMap::new();
    for trace in traces {
        let Some(sp_version) = sp_versions.get(&(agent_hash.to_string(), trace.trace_id)) else {
            continue;
        };
        let label = labels.get(&trace.trace_id).copied().flatten();
        *cross.entry((sp_version.clone(), label)).or_default() += 1;
    }
    if !cross.is_empty() {
        println!("    sp_versioning version -> label (traces):");
        for ((sp_version, label), count) in cross {
            println!("      {sp_version} -> {}: {count}", version_name(label));
        }
    }
    mismatches
}

#[tokio::test]
#[ignore = "needs ClickHouse with real spans (staging)"]
async fn replay_project() {
    dotenv::dotenv().ok();
    let project: Uuid = env_or("REPLAY_PROJECT", DEFAULT_PROJECT).parse().unwrap();
    let days: u32 = env_or("REPLAY_DAYS", "0").parse().unwrap();
    let passes: Vec<usize> = env_or("REPLAY_MIN_TRACES", "100,25")
        .split(',')
        .map(|n| n.trim().parse().unwrap())
        .collect();
    let client = client();
    let corpus = load(&client, project, days).await;
    let sp_versions = load_sp_versions(&client, project).await;
    println!(
        "project {project}: {} LLM spans, {} without a system prompt, {} agent(s), {} distinct lines",
        corpus.spans,
        corpus.without_system_prompt,
        corpus.agents.len(),
        corpus.text.len(),
    );

    let mut agents: Vec<(&String, &Agent)> = corpus.agents.iter().collect();
    agents.sort_by_key(|(_, agent)| std::cmp::Reverse(agent.traces.len()));
    let mut mismatched_agents = Vec::new();
    for (agent_hash, agent) in agents {
        let mut traces: Vec<Trace> = agent.traces.values().cloned().collect();
        traces.sort_by_key(|t| (t.time, t.trace_id));
        let title: String = agent.title.chars().take(70).collect();
        println!(
            "\nagent {agent_hash} {title:?}: {} traces, {} calls, {} .. {}",
            traces.len(),
            agent.calls,
            traces[0].time.format("%Y-%m-%d %H:%M"),
            traces.last().unwrap().time.format("%Y-%m-%d %H:%M"),
        );
        if traces.len() < MIN_AGENT_TRACES {
            continue;
        }
        let distinct: HashSet<&LineSet> = traces.iter().map(|t| &t.lines).collect();
        println!("  {} distinct line sets", distinct.len());
        for &min_traces in &passes {
            let config = Config {
                min_traces,
                ..Config::default()
            };
            if report(agent_hash, &traces, &config, &corpus.text, &sp_versions) > 0 {
                mismatched_agents.push((agent_hash.clone(), min_traces));
            }
        }
    }
    assert!(
        mismatched_agents.is_empty(),
        "batch and incremental labels differ for {mismatched_agents:?}"
    );
}
