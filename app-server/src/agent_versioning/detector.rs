//! Version detection for one agent: a pure function over its traces.
//!
//! A version is the set of lines present in every trace of a stable stretch
//! (its core). A version changes only when a line flips:
//!
//! - removed: a core line is absent from `min_traces` consecutive traces;
//! - added: a line is present in `min_traces` consecutive traces and absent
//!   from every trace in the lookback before them.
//!
//! Dynamic values and optional parts (a skill loaded for some users, an A/B
//! arm) show up on both sides of any point in time, so they never flip and
//! never mint a version. Flips that start within `rollout` of each other are
//! one deploy. The new core is the intersection of the traces after the
//! deploy only, so no version is ever a mix of two real ones, and a core
//! equal to an older version's reuses it (a rollback).
//!
//! Traces are labelled by time: before a change the old version, after it
//! the new one. In the `rollout` before a change both versions run side by
//! side, so a trace there gets the version whose core it contains (the
//! larger one if both). A trace is settled once `min_traces` traces exist
//! after it, so any change that could cover it has been seen; its label is
//! final. A trace that waited `max_hold` without settling gets a provisional
//! label, only if it contains its version's core, and is relabelled whenever
//! the versions change until it settles.
//!
//! [`run`] is incremental: the state carries the versions, the timeline of
//! changes and the settled watermark, and each run reads the traces after the
//! watermark plus `min_traces` of context before it. A run never relabels a
//! trace before the watermark, and the latest label of every trace equals
//! that of one run over the same traces.

use std::collections::HashMap;

use chrono::{DateTime, Duration, Utc};
use uuid::Uuid;

use super::document::LineSet;

#[derive(Debug, Clone)]
pub struct Config {
    /// Consecutive traces a flip needs, and the context kept before the
    /// watermark.
    pub min_traces: usize,
    /// How far back the context and the "absent before" check reach.
    pub lookback: Duration,
    /// Longest a trace waits for `min_traces` traces after it.
    pub max_hold: Duration,
    /// Longest a deploy runs old and new versions side by side.
    pub rollout: Duration,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            min_traces: 100,
            lookback: Duration::hours(24),
            max_hold: Duration::hours(24),
            rollout: Duration::minutes(15),
        }
    }
}

/// One trace of the agent: the union of its calls' lines, at its first call.
#[derive(Debug, Clone)]
pub struct Trace {
    pub trace_id: Uuid,
    pub time: DateTime<Utc>,
    pub lines: LineSet,
}

#[derive(Debug, Clone)]
pub struct Version {
    pub core: LineSet,
    /// Start of the version's first segment.
    pub since: DateTime<Utc>,
}

/// A stretch of time running one version. Traces in
/// `[overlap_from, since)` may run either this or the previous version.
#[derive(Debug, Clone)]
pub struct Segment {
    pub version: usize,
    pub overlap_from: DateTime<Utc>,
    pub since: DateTime<Utc>,
}

#[derive(Debug, Clone, Default)]
pub struct AgentState {
    pub versions: Vec<Version>,
    pub timeline: Vec<Segment>,
    /// Every trace at or before this has its final label. Only settled
    /// traces move it: a flip before it was seen in full by an earlier run.
    pub labelled_until: Option<DateTime<Utc>>,
    /// Every unsettled trace at or before this has a provisional label.
    pub held_until: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone)]
pub struct ChangeEvent {
    /// `None` for the agent's first version.
    pub from: Option<usize>,
    pub to: usize,
    pub overlap_from: DateTime<Utc>,
    pub since: DateTime<Utc>,
    pub added: LineSet,
    pub removed: LineSet,
    /// Last trace before the overlap and first trace of the new version,
    /// for showing the change as text.
    pub example_before: Option<Uuid>,
    pub example_after: Uuid,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Label {
    pub trace_id: Uuid,
    /// `None` when a held trace doesn't contain its version's core.
    pub version: Option<usize>,
    /// Final; otherwise a later run may relabel the trace.
    pub settled: bool,
}

#[derive(Debug, Default)]
pub struct RunOutput {
    pub events: Vec<ChangeEvent>,
    pub labels: Vec<Label>,
}

/// `traces` sorted by time, covering at least `[labelled_until - lookback,
/// horizon]`; traces after `horizon` are ignored.
pub fn run(
    state: &mut AgentState,
    traces: &[Trace],
    horizon: DateTime<Utc>,
    config: &Config,
) -> RunOutput {
    let n = config.min_traces.max(1);
    let end = traces.partition_point(|t| t.time <= horizon);
    let fresh_start = match state.labelled_until {
        Some(watermark) => traces.partition_point(|t| t.time <= watermark),
        None => 0,
    };
    let mut output = RunOutput::default();
    if fresh_start >= end {
        return output;
    }
    // A flip starting after the watermark looks back `n` traces from
    // `rollout` before its start.
    let context_start = match state.labelled_until {
        Some(watermark) => {
            let cutoff = watermark - config.rollout;
            traces
                .partition_point(|t| t.time < cutoff)
                .saturating_sub(n)
                .max(traces.partition_point(|t| t.time < cutoff - config.lookback))
        }
        None => fresh_start,
    };
    let traces = &traces[context_start..end];
    let fresh = fresh_start - context_start;

    let before = (state.timeline.len(), cores(state));
    if state.timeline.is_empty()
        && !cold_start(state, &traces[fresh..], horizon, n, config, &mut output)
    {
        return output;
    }
    let window = Window {
        traces,
        index: LineIndex::new(traces),
        from_history: state.labelled_until.is_none(),
    };
    detect(state, &window, n, config, &mut output);
    fill_diffs(state, &mut output.events);
    // A held label depends only on the timeline and the cores.
    let changed = (state.timeline.len(), cores(state)) != before;
    label(
        state,
        traces,
        fresh,
        horizon,
        changed,
        n,
        config,
        &mut output,
    );
    output
}

fn cores(state: &AgentState) -> Vec<LineSet> {
    state.versions.iter().map(|v| v.core.clone()).collect()
}

/// The traces one run reads: context before the watermark, then fresh ones.
struct Window<'a> {
    traces: &'a [Trace],
    index: LineIndex,
    /// The window starts at the agent's first trace.
    from_history: bool,
}

/// The first version is the intersection of the first `n` traces within
/// `max_hold` of the oldest, made once there are `n` of them or the oldest
/// has waited `max_hold`. Bounding the seed by time as well as count keeps it
/// independent of when the run happens.
fn cold_start(
    state: &mut AgentState,
    fresh: &[Trace],
    horizon: DateTime<Utc>,
    n: usize,
    config: &Config,
    output: &mut RunOutput,
) -> bool {
    let held = fresh[0].time <= horizon - config.max_hold;
    if fresh.len() < n && !held {
        return false;
    }
    let since = fresh[0].time;
    let seed = fresh
        .partition_point(|t| t.time <= since + config.max_hold)
        .min(n);
    state.versions.push(Version {
        core: intersect(&fresh[..seed]),
        since,
    });
    let version = state.versions.len() - 1;
    state.timeline.push(Segment {
        version,
        overlap_from: since,
        since,
    });
    output.events.push(ChangeEvent {
        from: None,
        to: version,
        overlap_from: since,
        since,
        added: LineSet::new(),
        removed: LineSet::new(),
        example_before: None,
        example_after: fresh[0].trace_id,
    });
    true
}

fn detect(
    state: &mut AgentState,
    window: &Window,
    n: usize,
    config: &Config,
    output: &mut RunOutput,
) {
    let traces = window.traces;
    // Strictly increases every iteration, so the loop ends.
    let mut scan_from = 0;
    loop {
        let current = state.timeline.last().unwrap().clone();
        scan_from = scan_from.max(traces.partition_point(|t| t.time < current.since));
        let core = &state.versions[current.version].core;
        let starts = flip_starts(window, core, scan_from, n, config);
        let Some(first) = starts.iter().map(|&i| traces[i].time).min() else {
            break;
        };
        // The deploy is done once its last flip has started; every flip has
        // `n` traces after its start, so this one does too.
        let clean = starts
            .iter()
            .copied()
            .filter(|&i| traces[i].time <= first + config.rollout)
            .max()
            .unwrap();
        let new_core = intersect(&traces[clean..clean + n]);
        scan_from = clean + 1;
        if new_core == *core {
            continue;
        }
        let overlap_from = (first - config.rollout).max(current.since);
        refine(state, traces, &current, overlap_from, n);
        let version = find_or_mint(state, new_core, traces[clean].time);
        if version == current.version {
            continue;
        }
        let since = traces[clean].time;
        state.timeline.push(Segment {
            version,
            overlap_from,
            since,
        });
        let before = traces.partition_point(|t| t.time < overlap_from);
        output.events.push(ChangeEvent {
            from: Some(current.version),
            to: version,
            overlap_from,
            since,
            added: LineSet::new(),
            removed: LineSet::new(),
            example_before: before.checked_sub(1).map(|i| traces[i].trace_id),
            example_after: traces[clean].trace_id,
        });
    }
}

/// Start index of every flip against `core` at or after `scan_from`.
fn flip_starts(
    window: &Window,
    core: &LineSet,
    scan_from: usize,
    n: usize,
    config: &Config,
) -> Vec<usize> {
    let mut starts = Vec::new();
    for line in core {
        let positions = window.index.positions(*line);
        if let Some(start) = first_absent_run(positions, scan_from, window.traces.len(), n) {
            starts.push(start);
        }
    }
    for (line, positions) in &window.index.positions {
        if positions.len() < n || core.binary_search(line).is_ok() {
            continue;
        }
        if let Some(start) = first_added_run(window, positions, scan_from, n, config) {
            starts.push(start);
        }
    }
    starts
}

/// First run of `n` traces at or after `from` that all lack the line.
fn first_absent_run(positions: &[usize], from: usize, len: usize, n: usize) -> Option<usize> {
    let mut run_start = from;
    for &p in &positions[positions.partition_point(|&p| p < from)..] {
        if p - run_start >= n {
            return Some(run_start);
        }
        run_start = p + 1;
    }
    (len.saturating_sub(run_start) >= n).then_some(run_start)
}

/// First run of `n` traces at or after `from` that all carry the line, with
/// the line absent from every trace in the lookback before the rollout.
fn first_added_run(
    window: &Window,
    positions: &[usize],
    from: usize,
    n: usize,
    config: &Config,
) -> Option<usize> {
    let after = &positions[positions.partition_point(|&p| p < from)..];
    // Positions are strictly increasing, so `n` of them spanning `n - 1`
    // indices are consecutive traces.
    (0..after.len().saturating_sub(n - 1))
        .map(|i| (after[i], after[i + n - 1]))
        .filter(|(start, last)| last - start == n - 1)
        .map(|(start, _)| start)
        .find(|&start| absent_before(window, positions, start, n, config))
}

fn absent_before(
    window: &Window,
    positions: &[usize],
    start: usize,
    n: usize,
    config: &Config,
) -> bool {
    let traces = window.traces;
    let cutoff = traces[start].time - config.rollout;
    let to = traces.partition_point(|t| t.time < cutoff);
    let from = to
        .saturating_sub(n)
        .max(traces.partition_point(|t| t.time < cutoff - config.lookback));
    // A lookback cut short by the window start is judged in the run that
    // has all of it; no traces before at all is no evidence the line is new.
    let complete = to >= n || from > 0 || window.from_history;
    if !complete || from == to {
        return false;
    }
    let first = positions.partition_point(|&p| p < from);
    positions.get(first).is_none_or(|&p| p >= to)
}

/// A version minted from fewer than `n` traces of its own took its core from
/// traces of the next version too; recompute it from its own segment.
fn refine(
    state: &mut AgentState,
    window: &[Trace],
    segment: &Segment,
    until: DateTime<Utc>,
    n: usize,
) {
    let version = &mut state.versions[segment.version];
    if version.since != segment.since || window.first().is_none_or(|t| t.time > segment.since) {
        return;
    }
    let from = window.partition_point(|t| t.time < segment.since);
    let to = window.partition_point(|t| t.time < until);
    if to > from && to - from < n {
        version.core = intersect(&window[from..to]);
    }
}

fn find_or_mint(state: &mut AgentState, core: LineSet, since: DateTime<Utc>) -> usize {
    if let Some(existing) = state.versions.iter().position(|v| v.core == core) {
        return existing;
    }
    state.versions.push(Version { core, since });
    state.versions.len() - 1
}

/// Diffs are taken at the end of the run, after any core was refined.
fn fill_diffs(state: &AgentState, events: &mut [ChangeEvent]) {
    let empty = LineSet::new();
    for event in events {
        let from = event.from.map_or(&empty, |v| &state.versions[v].core);
        let to = &state.versions[event.to].core;
        event.added = difference(to, from);
        event.removed = difference(from, to);
    }
}

fn label(
    state: &mut AgentState,
    window: &[Trace],
    fresh: usize,
    horizon: DateTime<Utc>,
    changed: bool,
    n: usize,
    config: &Config,
    output: &mut RunOutput,
) {
    // A trace with `n` traces after it is past any undetected change, up to
    // that change's rollout.
    let settled_until = window
        .len()
        .checked_sub(n + 1)
        .map(|i| window[i].time - config.rollout);
    let held_until = horizon - config.max_hold;
    // Held traces at one instant cross `held_until` in the same run, so the
    // previous run's watermark is the one that says what was already sent.
    let sent_until = state.held_until;
    for trace in &window[fresh..] {
        let version = timeline_version(state, trace);
        if settled_until.is_some_and(|until| trace.time <= until) {
            output.labels.push(Label {
                trace_id: trace.trace_id,
                version: Some(version),
                settled: true,
            });
            state.labelled_until = Some(trace.time);
            continue;
        }
        if trace.time > held_until {
            break;
        }
        if changed || sent_until.is_none_or(|until| trace.time > until) {
            output.labels.push(Label {
                trace_id: trace.trace_id,
                version: contains(&trace.lines, &state.versions[version].core).then_some(version),
                settled: false,
            });
        }
        state.held_until = state.held_until.max(Some(trace.time));
    }
}

fn timeline_version(state: &AgentState, trace: &Trace) -> usize {
    let timeline = &state.timeline;
    let i = timeline
        .partition_point(|s| s.since <= trace.time)
        .saturating_sub(1);
    let current = timeline[i].version;
    match timeline.get(i + 1) {
        Some(next) if trace.time >= next.overlap_from => {
            let old = &state.versions[current].core;
            let new = &state.versions[next.version].core;
            match (contains(&trace.lines, old), contains(&trace.lines, new)) {
                (true, true) if new.len() > old.len() => next.version,
                (false, true) => next.version,
                _ => current,
            }
        }
        _ => current,
    }
}

/// Positions (window indices) of the traces carrying each line.
struct LineIndex {
    positions: HashMap<u64, Vec<usize>>,
}

impl LineIndex {
    fn new(window: &[Trace]) -> Self {
        let mut positions: HashMap<u64, Vec<usize>> = HashMap::new();
        for (i, trace) in window.iter().enumerate() {
            for line in &trace.lines {
                positions.entry(*line).or_default().push(i);
            }
        }
        Self { positions }
    }

    fn positions(&self, line: u64) -> &[usize] {
        self.positions.get(&line).map_or(&[], Vec::as_slice)
    }
}

fn intersect(traces: &[Trace]) -> LineSet {
    let Some((first, rest)) = traces.split_first() else {
        return LineSet::new();
    };
    let mut core = first.lines.clone();
    for trace in rest {
        core.retain(|line| trace.lines.binary_search(line).is_ok());
    }
    core
}

fn contains(lines: &LineSet, core: &LineSet) -> bool {
    core.iter().all(|line| lines.binary_search(line).is_ok())
}

fn difference(a: &LineSet, b: &LineSet) -> LineSet {
    a.iter()
        .copied()
        .filter(|line| b.binary_search(line).is_err())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const DYNAMIC: u64 = 1_000_000;

    fn t0() -> DateTime<Utc> {
        DateTime::parse_from_rfc3339("2026-10-01T00:00:00Z")
            .unwrap()
            .to_utc()
    }

    /// One trace a minute; `lines(i)` gives trace `i` its static lines, and
    /// every trace also carries a line of its own (a date, a user name).
    fn stream(count: usize, lines: impl Fn(usize) -> Vec<u64>) -> Vec<Trace> {
        (0..count)
            .map(|i| {
                let mut set = lines(i);
                set.push(DYNAMIC + i as u64);
                set.sort_unstable();
                set.dedup();
                Trace {
                    trace_id: Uuid::from_u128(i as u128),
                    time: t0() + Duration::minutes(i as i64),
                    lines: set,
                }
            })
            .collect()
    }

    fn base() -> Vec<u64> {
        (1..=20).collect()
    }

    fn with(mut lines: Vec<u64>, add: &[u64], remove: &[u64]) -> Vec<u64> {
        lines.retain(|line| !remove.contains(line));
        lines.extend_from_slice(add);
        lines
    }

    fn batch(traces: &[Trace], config: &Config) -> (AgentState, RunOutput) {
        let mut state = AgentState::default();
        let horizon = traces.last().unwrap().time + config.max_hold + Duration::minutes(1);
        let output = run(&mut state, traces, horizon, config);
        (state, output)
    }

    /// A run every 10 minutes until every trace is labelled; the latest
    /// label of each trace.
    fn incremental(
        traces: &[Trace],
        config: &Config,
    ) -> (AgentState, HashMap<Uuid, Option<usize>>) {
        let mut state = AgentState::default();
        let mut labels: HashMap<Uuid, Label> = HashMap::new();
        let mut horizon = traces[0].time;
        let last = traces.last().unwrap().time + config.max_hold + Duration::minutes(10);
        while horizon <= last {
            for label in run(&mut state, traces, horizon, config).labels {
                if let Some(previous) = labels.insert(label.trace_id, label) {
                    assert!(!previous.settled, "settled label relabelled");
                }
            }
            horizon += Duration::minutes(10);
        }
        let labels = labels
            .into_iter()
            .map(|(trace_id, label)| (trace_id, label.version))
            .collect();
        (state, labels)
    }

    fn labels(output: &RunOutput) -> Vec<Option<usize>> {
        output.labels.iter().map(|l| l.version).collect()
    }

    #[test]
    fn stable_stream_with_dynamic_lines_is_one_version() {
        let traces = stream(1000, |_| base());
        let (state, output) = batch(&traces, &Config::default());
        assert_eq!(state.versions.len(), 1);
        assert_eq!(state.versions[0].core, base());
        assert_eq!(labels(&output), vec![Some(0); 1000]);
    }

    #[test]
    fn modified_line_after_a_long_stream_mints_no_mixed_version() {
        let b = with(base(), &[105], &[5]);
        let traces = stream(1300, |i| if i < 1000 { base() } else { b.clone() });
        let (state, output) = batch(&traces, &Config::default());
        assert_eq!(state.versions.len(), 2);
        assert_eq!(state.versions[1].core, {
            let mut core = b.clone();
            core.sort_unstable();
            core
        });
        let event = &output.events[1];
        assert_eq!(
            (event.added.clone(), event.removed.clone()),
            (vec![105], vec![5])
        );
        assert_eq!(event.since, traces[1000].time);
        let expected: Vec<_> = (0..1300).map(|i| Some(usize::from(i >= 1000))).collect();
        assert_eq!(labels(&output), expected);
    }

    #[test]
    fn added_line_labels_new_traces_with_the_new_version() {
        let traces = stream(600, |i| {
            if i < 300 {
                base()
            } else {
                with(base(), &[21], &[])
            }
        });
        let (state, output) = batch(&traces, &Config::default());
        assert_eq!(state.versions.len(), 2);
        assert_eq!(output.events[1].added, vec![21]);
        assert!(output.labels[300..].iter().all(|l| l.version == Some(1)));
        assert!(output.labels[..300].iter().all(|l| l.version == Some(0)));
    }

    #[test]
    fn removed_line_is_a_new_version() {
        let traces = stream(600, |i| {
            if i < 300 {
                base()
            } else {
                with(base(), &[], &[7])
            }
        });
        let (state, output) = batch(&traces, &Config::default());
        assert_eq!(state.versions.len(), 2);
        assert_eq!(output.events[1].removed, vec![7]);
        assert!(output.labels[300..].iter().all(|l| l.version == Some(1)));
    }

    #[test]
    fn rollback_reuses_the_old_version() {
        let traces = stream(900, |i| match i {
            300..600 => with(base(), &[21], &[3]),
            _ => base(),
        });
        let (state, output) = batch(&traces, &Config::default());
        assert_eq!(state.versions.len(), 2);
        let timeline: Vec<_> = state.timeline.iter().map(|s| s.version).collect();
        assert_eq!(timeline, vec![0, 1, 0]);
        assert!(output.labels[600..].iter().all(|l| l.version == Some(0)));
    }

    #[test]
    fn rolling_deploy_is_one_change_labelled_by_content_in_the_overlap() {
        // Old and new pods alternate for 10 minutes.
        let b = with(base(), &[21, 105], &[5]);
        let traces = stream(600, |i| match i {
            0..300 => base(),
            300..310 if i % 2 == 0 => base(),
            _ => b.clone(),
        });
        let (state, output) = batch(&traces, &Config::default());
        assert_eq!(state.versions.len(), 2);
        assert_eq!(output.events.len(), 2);
        // The first trace after which every trace is new; the old pods'
        // traces before it are told apart by content.
        assert_eq!(output.events[1].since, traces[309].time);
        for (i, label) in output.labels.iter().enumerate() {
            let old = i < 300 || (i < 310 && i % 2 == 0);
            assert_eq!(label.version, Some(usize::from(!old)), "trace {i}");
        }
    }

    #[test]
    fn optional_lines_never_flip() {
        // A skill in half the traces, an A/B arm in 5%, a footer in 95%.
        let traces = stream(3000, |i| {
            let mut lines = base();
            if i % 2 == 0 {
                lines.push(50);
            }
            if i % 20 == 0 {
                lines.push(51);
            }
            if i % 20 != 7 {
                lines.push(52);
            }
            lines
        });
        let (state, _) = batch(&traces, &Config::default());
        assert_eq!(state.versions.len(), 1);
        assert_eq!(state.versions[0].core, base());
    }

    #[test]
    fn change_inside_the_cold_start_window_refines_the_first_version() {
        let b = with(base(), &[105], &[5]);
        let traces = stream(400, |i| if i < 40 { base() } else { b.clone() });
        let (state, output) = batch(&traces, &Config::default());
        assert_eq!(state.versions.len(), 2);
        assert_eq!(state.versions[0].core, base());
        assert_eq!(output.events[1].removed, vec![5]);
    }

    #[test]
    fn incremental_runs_match_one_batch_run() {
        let traces = stream(2000, |i| match i {
            0..500 => base(),
            500..900 => with(base(), &[21], &[]),
            900..1400 => with(base(), &[21, 105], &[5]),
            _ => with(base(), &[21], &[]),
        });
        let config = Config::default();
        let (batch_state, batch_output) = batch(&traces, &config);
        let (state, labels) = incremental(&traces, &config);
        assert_eq!(state.versions.len(), batch_state.versions.len());
        assert_eq!(state.versions.len(), 3);
        for label in &batch_output.labels {
            assert_eq!(labels.get(&label.trace_id), Some(&label.version));
        }
    }

    #[test]
    fn traces_wait_for_enough_traces_after_them() {
        let traces = stream(250, |i| {
            if i < 200 {
                base()
            } else {
                with(base(), &[], &[5])
            }
        });
        let mut state = AgentState::default();
        let horizon = traces.last().unwrap().time;
        let output = run(&mut state, &traces, horizon, &Config::default());
        // The removal has 50 traces so far: undetected, so nothing near it
        // is labelled yet.
        assert_eq!(state.versions.len(), 1);
        let labelled_until = state.labelled_until.unwrap();
        assert!(labelled_until < traces[200].time - Config::default().rollout);
        assert!(output.labels.len() < 150);
    }

    #[test]
    fn low_traffic_agent_is_labelled_after_max_hold() {
        // 30 traces, one an hour.
        let traces: Vec<Trace> = stream(30, |_| base())
            .into_iter()
            .enumerate()
            .map(|(i, mut t)| {
                t.time = t0() + Duration::hours(i as i64);
                t
            })
            .collect();
        let config = Config::default();
        let mut state = AgentState::default();
        let early = run(&mut state, &traces, t0() + Duration::hours(12), &config);
        assert!(early.labels.is_empty() && state.versions.is_empty());
        let output = run(&mut state, &traces, t0() + Duration::hours(30), &config);
        assert_eq!(state.versions.len(), 1);
        assert_eq!(labels(&output), vec![Some(0); 7]);
    }

    #[test]
    fn sparse_agent_seeds_its_first_version_from_its_first_day_only() {
        // Three traces, then a changed prompt a month later: the change has
        // too few traces to confirm, so those traces stay unversioned in a
        // batch run exactly as in incremental runs.
        let traces: Vec<Trace> = stream(13, |i| match i {
            0..3 => base(),
            _ => with(base(), &[], &[5]),
        })
        .into_iter()
        .enumerate()
        .map(|(i, mut t)| {
            if i >= 3 {
                t.time += Duration::days(30);
            }
            t
        })
        .collect();
        let config = Config::default();
        let (batch_state, batch_output) = batch(&traces, &config);
        assert_eq!(batch_state.versions[0].core, base());
        let mut expected = vec![Some(0); 3];
        expected.extend([None; 10]);
        assert_eq!(labels(&batch_output), expected);
        let (_, incremental_labels) = incremental(&traces, &config);
        for label in &batch_output.labels {
            assert_eq!(
                incremental_labels.get(&label.trace_id),
                Some(&label.version)
            );
        }
    }

    #[test]
    fn held_traces_sharing_a_timestamp_are_all_labelled() {
        // Two traces an hour, each pair at the same instant.
        let traces: Vec<Trace> = stream(80, |_| base())
            .into_iter()
            .enumerate()
            .map(|(i, mut t)| {
                t.time = t0() + Duration::hours(i as i64 / 2);
                t
            })
            .collect();
        let config = Config::default();
        let (_, batch_output) = batch(&traces, &config);
        assert_eq!(labels(&batch_output), vec![Some(0); 80]);
        let (_, incremental_labels) = incremental(&traces, &config);
        for label in &batch_output.labels {
            assert_eq!(
                incremental_labels.get(&label.trace_id),
                Some(&label.version)
            );
        }
    }

    #[test]
    fn change_confirmed_after_max_hold_relabels_held_traces() {
        // Eight traces a day against `min_traces = 10`: a change takes more
        // than a day to confirm, so its first traces are held first.
        let config = Config {
            min_traces: 10,
            ..Config::default()
        };
        let removed = with(base(), &[], &[5]);
        let added = with(base(), &[21], &[]);
        for changed in [removed, added] {
            let traces: Vec<Trace> = stream(60, |i| if i < 30 { base() } else { changed.clone() })
                .into_iter()
                .enumerate()
                .map(|(i, mut t)| {
                    t.time = t0() + Duration::hours(3 * i as i64);
                    t
                })
                .collect();
            let (batch_state, batch_output) = batch(&traces, &config);
            assert_eq!(batch_state.versions.len(), 2);
            let expected: Vec<_> = (0..60).map(|i| Some(usize::from(i >= 30))).collect();
            assert_eq!(labels(&batch_output), expected);
            let (state, incremental_labels) = incremental(&traces, &config);
            assert_eq!(state.versions.len(), 2);
            for label in &batch_output.labels {
                assert_eq!(
                    incremental_labels.get(&label.trace_id),
                    Some(&label.version)
                );
            }
        }
    }
}
