//! The detection job: every 10 minutes one replica runs [`detector::run`] for
//! every agent with new calls, labels the agent's traces in ClickHouse and
//! commits its versions, timeline and watermarks to Postgres.
//!
//! Labels are written before the Postgres commit, so a crash between the two
//! only repeats the run: version ids are derived from the agent and the
//! version number, so the repeat writes the same labels.

use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
    time::{Duration as StdDuration, Instant},
};

use anyhow::{Context, Result};
use chrono::{DateTime, Duration, Utc};
use rand::seq::SliceRandom;
use tokio::time::{self, MissedTickBehavior};
use uuid::Uuid;

use super::{
    detector::{self, AgentState, ChangeEvent, Config, Segment, Trace, Version},
    document::LineSet,
    naming,
};
use crate::{
    cache::{Cache, CacheTrait, keys::AGENT_VERSIONING_JOB_LOCK_CACHE_KEY},
    ch::agent_versioning::{self as ch, ActiveAgent, CHTraceAgentVersion, TraceRow},
    db::{
        DB,
        agent_versioning::{
            self as db, AgentRow, ChangeDiff, ChangeRow, NewChange, NewVersion, RefinedVersion,
            RunChanges, VersionRow, Watermarks,
        },
        agents,
    },
    llm::LlmClient,
};

const TICK_INTERVAL_SECONDS: u64 = 600;
/// Safety net in case the holder crashes; a run releases the lock when done.
const LOCK_TTL_SECONDS: u64 = 900;
/// A run stops starting agents after this, leaving the lock's TTL to finish
/// the one in flight.
const RUN_BUDGET: StdDuration = StdDuration::from_secs(12 * 60);
/// Fresh traces one run of one agent reads at most; a backlog is worked off
/// over several runs.
const MAX_FRESH_TRACES: usize = 10_000;
/// Agents named per run, bounding the job's LLM spend.
const NAMES_PER_RUN: usize = 20;

/// A trace's lines are its calls in the hour after its first one, so a trace
/// is complete an hour after it starts.
fn trace_window() -> Duration {
    Duration::hours(1)
}

pub async fn run_agent_versioning_job(
    db: Arc<DB>,
    cache: Arc<Cache>,
    clickhouse: clickhouse::Client,
    llm_client: Option<Arc<LlmClient>>,
) {
    let job = Job {
        db,
        clickhouse,
        llm_client,
        config: Config::default(),
    };
    let mut interval = time::interval(StdDuration::from_secs(TICK_INTERVAL_SECONDS));
    interval.set_missed_tick_behavior(MissedTickBehavior::Skip);

    loop {
        interval.tick().await;

        match cache
            .try_acquire_lock(AGENT_VERSIONING_JOB_LOCK_CACHE_KEY, LOCK_TTL_SECONDS)
            .await
        {
            Ok(true) => {
                if let Err(e) = job.run().await {
                    log::error!("[AGENT_VERSIONING] Job run failed: {e:?}");
                }
                if let Err(e) = cache
                    .release_lock(AGENT_VERSIONING_JOB_LOCK_CACHE_KEY)
                    .await
                {
                    log::warn!("[AGENT_VERSIONING] Failed to release job lock: {e:?}");
                }
            }
            Ok(false) => {
                log::debug!("[AGENT_VERSIONING] Another replica holds the job lock, skipping");
            }
            Err(e) => {
                log::warn!("[AGENT_VERSIONING] Failed to acquire job lock: {e:?}");
            }
        }
    }
}

struct Job {
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    llm_client: Option<Arc<LlmClient>>,
    config: Config,
}

impl Job {
    async fn run(&self) -> Result<()> {
        let started = Instant::now();
        let now = Utc::now();
        // A trace waits at most `max_hold`, so an agent idle for longer than
        // that has nothing left to label.
        let since = now - self.config.max_hold - Duration::days(1);
        let mut agents = ch::active_agents(&self.clickhouse, since.timestamp_micros()).await?;
        // A run out of budget leaves a random rest for the next one.
        agents.shuffle(&mut rand::rng());

        let mut names_left = if self.llm_client.is_some() {
            NAMES_PER_RUN
        } else {
            0
        };
        let mut processed = 0;
        for agent in &agents {
            if started.elapsed() >= RUN_BUDGET {
                log::warn!(
                    "[AGENT_VERSIONING] Run budget spent after {processed} of {} agents",
                    agents.len()
                );
                break;
            }
            if let Err(e) = self.process_agent(agent, now, &mut names_left).await {
                log::error!(
                    "[AGENT_VERSIONING] Failed to process agent {} of project {}: {e:?}",
                    agent.agent_hash,
                    agent.project_id
                );
            }
            processed += 1;
        }
        log::info!(
            "[AGENT_VERSIONING] Processed {processed} agents in {:?}",
            started.elapsed()
        );
        Ok(())
    }

    async fn process_agent(
        &self,
        active: &ActiveAgent,
        now: DateTime<Utc>,
        names_left: &mut usize,
    ) -> Result<()> {
        let pool = &self.db.pool;
        let (project_id, agent_hash) = (active.project_id, active.agent_hash.as_str());
        let agent = db::upsert_agent(pool, project_id, agent_hash).await?;
        let previous = Watermarks {
            labelled_until: agent.labelled_until,
            held_until: agent.held_until,
        };
        // Every trace up to the later watermark is labelled; new ones need a
        // new call.
        let seen_until = previous.labelled_until.max(previous.held_until);
        if seen_until.is_some_and(|until| active.last_call <= until.timestamp_micros()) {
            return Ok(());
        }

        let versions = db::get_versions(pool, project_id, agent.id).await?;
        let changes = db::get_changes(pool, project_id, agent.id).await?;
        let mut state = restore_state(&versions, &changes, previous)?;

        let Some((traces, horizon)) = self
            .load_traces(project_id, agent_hash, previous.labelled_until, now)
            .await?
        else {
            return Ok(());
        };
        let before = state.clone();
        let output = detector::run(&mut state, &traces, horizon, &self.config);
        let next = Watermarks {
            labelled_until: state.labelled_until,
            held_until: state.held_until,
        };

        if !output.events.is_empty() || !output.labels.is_empty() || next != previous {
            let times: HashMap<Uuid, DateTime<Utc>> =
                traces.iter().map(|t| (t.trace_id, t.time)).collect();
            let labels: Vec<CHTraceAgentVersion> = output
                .labels
                .iter()
                .map(|label| CHTraceAgentVersion {
                    project_id,
                    trace_id: label.trace_id,
                    agent_id: agent.id,
                    agent_version_id: label.version.map(|v| version_id(agent.id, v)),
                    settled: label.settled,
                    start_time: times[&label.trace_id].timestamp_micros(),
                })
                .collect();

            let plan = plan_changes(agent.id, &before, &state, &output.events, &changes);
            let run_changes = self
                .with_contents(
                    project_id, agent_hash, &state, &versions, plan, previous, next,
                )
                .await?;

            ch::insert_labels(&self.clickhouse, &labels).await?;
            if !db::save_run(pool, project_id, agent.id, &run_changes).await? {
                log::warn!(
                    "[AGENT_VERSIONING] Agent {} changed during the run; its labels are rewritten next run",
                    agent.id
                );
                return Ok(());
            }
        }

        self.name_if_unnamed(project_id, &agent, &state, names_left)
            .await;
        Ok(())
    }

    /// The traces one run reads, sorted by time, and its horizon: the context
    /// before the watermark's rollout and every trace from there to the
    /// horizon. `None` when there is nothing to read.
    async fn load_traces(
        &self,
        project_id: Uuid,
        agent_hash: &str,
        labelled_until: Option<DateTime<Utc>>,
        now: DateTime<Utc>,
    ) -> Result<Option<(Vec<Trace>, DateTime<Utc>)>> {
        let mut horizon = now - trace_window();
        let cutoff = labelled_until.map(|until| until - self.config.rollout);
        let from = cutoff.map(|c| c.timestamp_micros()).unwrap_or(0);
        let until = horizon.timestamp_micros();
        if from > until {
            return Ok(None);
        }

        let Some((first, cap)) = ch::trace_bounds(
            &self.clickhouse,
            project_id,
            agent_hash,
            from,
            until,
            MAX_FRESH_TRACES,
        )
        .await?
        else {
            return Ok(None);
        };
        if let Some(cap) = cap {
            // Stop before the trace past the cap, but always cover a window
            // so traces sharing one instant can't stall the agent.
            let capped =
                (micros(cap)? - Duration::microseconds(1)).max(micros(first)? + trace_window());
            horizon = horizon.min(capped);
        }
        let until = horizon.timestamp_micros();

        let mut rows =
            ch::load_traces(&self.clickhouse, project_id, agent_hash, from, until, None).await?;
        if let Some(cutoff) = cutoff {
            let context = ch::load_traces(
                &self.clickhouse,
                project_id,
                agent_hash,
                (cutoff - self.config.lookback).timestamp_micros(),
                cutoff.timestamp_micros() - 1,
                Some(self.config.min_traces),
            )
            .await?;
            rows.extend(context);
        }
        let mut traces = rows
            .into_iter()
            .map(into_trace)
            .collect::<Result<Vec<_>>>()?;
        traces.sort_by_key(|t| (t.time, t.trace_id));
        Ok(Some((traces, horizon)))
    }

    /// The Postgres writes of a plan, with each new or refined version's
    /// content rendered from its example trace.
    #[allow(clippy::too_many_arguments)]
    async fn with_contents(
        &self,
        project_id: Uuid,
        agent_hash: &str,
        state: &AgentState,
        stored: &[VersionRow],
        plan: Plan,
        previous: Watermarks,
        next: Watermarks,
    ) -> Result<RunChanges> {
        let mut new_versions = Vec::new();
        for (index, example_trace_id) in plan.new_versions {
            let version = &state.versions[index];
            let content = self
                .content(project_id, agent_hash, example_trace_id, version)
                .await?;
            new_versions.push(NewVersion {
                id: version_id(plan.agent_id, index),
                version_number: version_number(index),
                core: to_db(&version.core),
                content,
                since: version.since,
                example_trace_id,
            });
        }
        let mut refined_versions = Vec::new();
        for index in plan.refined_versions {
            let version = &state.versions[index];
            let content = self
                .content(
                    project_id,
                    agent_hash,
                    stored[index].example_trace_id,
                    version,
                )
                .await?;
            refined_versions.push(RefinedVersion {
                id: stored[index].id,
                core: to_db(&version.core),
                content,
            });
        }
        Ok(RunChanges {
            new_versions,
            refined_versions,
            new_changes: plan.new_changes,
            change_diffs: plan.change_diffs,
            previous,
            next,
        })
    }

    /// The version's lines as text, in the order its example trace's calls
    /// carry them.
    async fn content(
        &self,
        project_id: Uuid,
        agent_hash: &str,
        example_trace_id: Uuid,
        version: &Version,
    ) -> Result<String> {
        let hashes = ch::trace_line_hashes(
            &self.clickhouse,
            project_id,
            agent_hash,
            example_trace_id,
            version.since.timestamp_micros(),
        )
        .await?;
        let lines = core_in_order(&hashes, &version.core);
        let texts = ch::line_texts(&self.clickhouse, project_id, agent_hash, &lines).await?;
        if texts.len() < lines.len() {
            log::warn!(
                "[AGENT_VERSIONING] {} of {} lines of agent {agent_hash} have no text",
                lines.len() - texts.len(),
                lines.len()
            );
        }
        Ok(lines
            .iter()
            .filter_map(|hash| texts.get(hash).map(String::as_str))
            .collect::<Vec<_>>()
            .join("\n"))
    }

    /// Names an unnamed agent after its current version. Failures are logged;
    /// the agent's next run retries.
    async fn name_if_unnamed(
        &self,
        project_id: Uuid,
        agent: &AgentRow,
        state: &AgentState,
        names_left: &mut usize,
    ) {
        let (Some(llm_client), None, Some(current)) =
            (&self.llm_client, &agent.name, state.timeline.last())
        else {
            return;
        };
        if *names_left == 0 {
            return;
        }
        *names_left -= 1;

        let pool = &self.db.pool;
        let result: Result<()> = async {
            let content =
                db::get_version_content(pool, project_id, version_id(agent.id, current.version))
                    .await?
                    .context("current version not stored")?;
            let name =
                naming::generate_agent_name(llm_client, project_id, agent.id, &content).await?;
            agents::set_agent_name(pool, project_id, agent.id, &name).await
        }
        .await;
        if let Err(e) = result {
            log::warn!(
                "[AGENT_VERSIONING] Failed to name agent {}: {e:?}",
                agent.id
            );
        }
    }
}

/// The detector state stored for an agent.
fn restore_state(
    versions: &[VersionRow],
    changes: &[ChangeRow],
    watermarks: Watermarks,
) -> Result<AgentState> {
    let mut state = AgentState {
        labelled_until: watermarks.labelled_until,
        held_until: watermarks.held_until,
        ..Default::default()
    };
    for (index, version) in versions.iter().enumerate() {
        anyhow::ensure!(
            version.version_number == version_number(index),
            "version numbers are not contiguous at {}",
            version.version_number
        );
        state.versions.push(Version {
            core: from_db(&version.core),
            since: version.since,
        });
    }
    for (index, change) in changes.iter().enumerate() {
        anyhow::ensure!(
            change.change_number == index as i32 + 1,
            "change numbers are not contiguous at {}",
            change.change_number
        );
        let version = version_index(change.to_version);
        anyhow::ensure!(version < state.versions.len(), "change to unknown version");
        state.timeline.push(Segment {
            version,
            overlap_from: change.overlap_from,
            since: change.since,
        });
    }
    Ok(state)
}

/// What one run changed, short of version contents.
#[derive(Debug)]
struct Plan {
    agent_id: Uuid,
    /// Index and example trace of each version minted in the run.
    new_versions: Vec<(usize, Uuid)>,
    /// Stored versions whose core the run grew.
    refined_versions: Vec<usize>,
    new_changes: Vec<NewChange>,
    /// Stored changes from or to a refined version.
    change_diffs: Vec<ChangeDiff>,
}

fn plan_changes(
    agent_id: Uuid,
    before: &AgentState,
    after: &AgentState,
    events: &[ChangeEvent],
    stored_changes: &[ChangeRow],
) -> Plan {
    // A version is minted by the change to it, at that change's first trace.
    let new_versions = (before.versions.len()..after.versions.len())
        .map(|index| {
            let event = events
                .iter()
                .find(|e| e.to == index)
                .expect("every minted version has a change to it");
            (index, event.example_after)
        })
        .collect();
    let refined: HashSet<usize> = (0..before.versions.len())
        .filter(|&i| before.versions[i].core != after.versions[i].core)
        .collect();

    let new_changes = events
        .iter()
        .enumerate()
        .map(|(i, event)| NewChange {
            change_number: (before.timeline.len() + i + 1) as i32,
            from_version_id: event.from.map(|v| version_id(agent_id, v)),
            to_version_id: version_id(agent_id, event.to),
            overlap_from: event.overlap_from,
            since: event.since,
            added: to_db(&event.added),
            removed: to_db(&event.removed),
            example_trace_before: event.example_before,
            example_trace_after: event.example_after,
        })
        .collect();

    let empty = LineSet::new();
    let change_diffs = stored_changes
        .iter()
        .filter_map(|change| {
            let from = change.from_version.map(version_index);
            let to = version_index(change.to_version);
            if !from.is_some_and(|v| refined.contains(&v)) && !refined.contains(&to) {
                return None;
            }
            let from = from.map_or(&empty, |v| &after.versions[v].core);
            let to = &after.versions[to].core;
            Some(ChangeDiff {
                change_number: change.change_number,
                added: to_db(&difference(to, from)),
                removed: to_db(&difference(from, to)),
            })
        })
        .collect();

    let mut refined_versions: Vec<usize> = refined.into_iter().collect();
    refined_versions.sort_unstable();
    Plan {
        agent_id,
        new_versions,
        refined_versions,
        new_changes,
        change_diffs,
    }
}

/// Stable across runs, so a repeated run writes the same labels.
fn version_id(agent_id: Uuid, index: usize) -> Uuid {
    Uuid::new_v5(&agent_id, &version_number(index).to_be_bytes())
}

fn version_number(index: usize) -> i32 {
    index as i32 + 1
}

fn version_index(version_number: i32) -> usize {
    (version_number - 1) as usize
}

/// The core's lines in the order `hashes` first carries them.
fn core_in_order(hashes: &[u64], core: &LineSet) -> Vec<u64> {
    let mut seen = HashSet::new();
    hashes
        .iter()
        .copied()
        .filter(|hash| core.binary_search(hash).is_ok() && seen.insert(*hash))
        .collect()
}

fn difference(a: &LineSet, b: &LineSet) -> LineSet {
    a.iter()
        .copied()
        .filter(|line| b.binary_search(line).is_err())
        .collect()
}

fn to_db(lines: &LineSet) -> Vec<i64> {
    lines.iter().map(|&line| line as i64).collect()
}

fn from_db(lines: &[i64]) -> LineSet {
    let mut set: LineSet = lines.iter().map(|&line| line as u64).collect();
    set.sort_unstable();
    set
}

fn micros(value: i64) -> Result<DateTime<Utc>> {
    DateTime::from_timestamp_micros(value).context("trace time out of range")
}

fn into_trace(row: TraceRow) -> Result<Trace> {
    let mut lines = row.lines;
    lines.sort_unstable();
    lines.dedup();
    Ok(Trace {
        trace_id: row.trace_id,
        time: micros(row.time)?,
        lines,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(minute: i64) -> DateTime<Utc> {
        DateTime::from_timestamp(1_790_000_000, 0).unwrap() + Duration::minutes(minute)
    }

    /// An hour apart, so the rollout never blurs a change.
    fn trace(i: u128, lines: &[u64]) -> Trace {
        Trace {
            trace_id: Uuid::from_u128(i),
            time: at(i as i64 * 60),
            lines: lines.to_vec(),
        }
    }

    /// The rows a saved plan leaves in Postgres.
    fn stored(
        agent_id: Uuid,
        state: &AgentState,
        events: &[ChangeEvent],
    ) -> (Vec<VersionRow>, Vec<ChangeRow>) {
        let versions = state
            .versions
            .iter()
            .enumerate()
            .map(|(i, v)| VersionRow {
                id: version_id(agent_id, i),
                version_number: version_number(i),
                core: to_db(&v.core),
                since: v.since,
                example_trace_id: Uuid::nil(),
            })
            .collect();
        let changes = events
            .iter()
            .enumerate()
            .map(|(i, e)| ChangeRow {
                change_number: i as i32 + 1,
                from_version: e.from.map(version_number),
                to_version: version_number(e.to),
                overlap_from: e.overlap_from,
                since: e.since,
            })
            .collect();
        (versions, changes)
    }

    #[test]
    fn state_round_trips_through_rows() {
        let agent_id = Uuid::from_u128(7);
        let config = Config {
            min_traces: 3,
            ..Default::default()
        };
        let mut traces: Vec<Trace> = (0..10).map(|i| trace(i, &[1, 2, 3])).collect();
        traces.extend((10..20).map(|i| trace(i, &[1, 2, u64::MAX])));
        let mut state = AgentState::default();
        let output = detector::run(
            &mut state,
            &traces,
            at(20 * 60) + Duration::days(2),
            &config,
        );
        assert_eq!(output.events.len(), 2);

        let plan = plan_changes(
            agent_id,
            &AgentState::default(),
            &state,
            &output.events,
            &[],
        );
        assert_eq!(
            plan.new_versions,
            vec![(0, Uuid::from_u128(0)), (1, Uuid::from_u128(10))]
        );
        assert_eq!(
            plan.new_changes[1].from_version_id,
            Some(version_id(agent_id, 0))
        );
        assert_eq!(plan.new_changes[1].added, vec![u64::MAX as i64]);

        let (versions, changes) = stored(agent_id, &state, &output.events);
        let watermarks = Watermarks {
            labelled_until: state.labelled_until,
            held_until: state.held_until,
        };
        let restored = restore_state(&versions, &changes, watermarks).unwrap();
        assert_eq!(cores(&restored), cores(&state));
        assert_eq!(restored.versions[1].core, vec![1, 2, u64::MAX]);
        assert_eq!(restored.timeline.len(), state.timeline.len());
        assert_eq!(restored.timeline[1].version, 1);
        assert_eq!(restored.labelled_until, state.labelled_until);
    }

    #[test]
    fn refined_version_updates_stored_diffs() {
        let agent_id = Uuid::from_u128(7);
        let mut before = AgentState::default();
        before.versions = vec![
            Version {
                core: vec![1],
                since: at(0),
            },
            Version {
                core: vec![1, 2],
                since: at(5),
            },
        ];
        let mut after = before.clone();
        after.versions[1].core = vec![1, 2, 3];
        let changes = vec![
            ChangeRow {
                change_number: 1,
                from_version: None,
                to_version: 1,
                overlap_from: at(0),
                since: at(0),
            },
            ChangeRow {
                change_number: 2,
                from_version: Some(1),
                to_version: 2,
                overlap_from: at(5),
                since: at(5),
            },
        ];
        let plan = plan_changes(agent_id, &before, &after, &[], &changes);
        assert_eq!(plan.refined_versions, vec![1]);
        assert_eq!(plan.change_diffs.len(), 1);
        assert_eq!(plan.change_diffs[0].change_number, 2);
        assert_eq!(plan.change_diffs[0].added, vec![2, 3]);
        assert!(plan.change_diffs[0].removed.is_empty());
    }

    #[test]
    fn content_follows_document_order() {
        assert_eq!(
            core_in_order(&[5, 9, 1, 5, 7, 3], &vec![1, 3, 5]),
            vec![5, 1, 3]
        );
    }

    #[test]
    fn version_ids_are_stable_and_distinct() {
        let agent = Uuid::from_u128(1);
        assert_eq!(version_id(agent, 0), version_id(agent, 0));
        assert_ne!(version_id(agent, 0), version_id(agent, 1));
        assert_ne!(version_id(agent, 0), version_id(Uuid::from_u128(2), 0));
    }

    fn cores(state: &AgentState) -> Vec<LineSet> {
        state.versions.iter().map(|v| v.core.clone()).collect()
    }
}
