//! The decision core, free of IO. Given one agent's samples (one per trace,
//! oldest first) and its known versions, find sharp line flips, turn them into
//! version changes, and decide how far and with which version traces are
//! labelled.
//!
//! A flip is a line present in N consecutive samples and absent in the next N
//! (or the reverse), allowing a rollout overlap of mixed samples between the
//! two runs. Flips with intersecting overlaps form one change; the new
//! version's core is the intersection of the samples after it. Outside an
//! overlap a trace gets the version of its time; inside one, the larger core
//! its prompt contains.

use std::collections::HashMap;

pub struct Knobs {
    /// N, in samples.
    pub min_run: usize,
    pub rollout_window: i64,
    pub max_hold: i64,
}

/// One trace's first agent prompt.
#[derive(Debug, Clone)]
pub struct Sample {
    pub time: i64,
    /// Sorted, deduplicated line hashes.
    pub lines: Vec<u64>,
}

pub struct Input<'a> {
    /// Labelled samples just before the labelling horizon, oldest first.
    pub context: &'a [Sample],
    /// Unlabelled samples, oldest first.
    pub pending: &'a [Sample],
    /// `pending` hit the per-run cap, so later samples exist unseen.
    pub truncated: bool,
    /// Core line sets of the agent's versions, each sorted.
    pub cores: &'a [Vec<u64>],
    /// The version at the labelling horizon.
    pub current: Option<usize>,
    pub now: i64,
}

#[derive(Debug, PartialEq)]
pub struct Minted {
    /// Index into [`Plan::cores`].
    pub version: usize,
    /// A sample containing the core, indexed over `context` then `pending`.
    pub example: usize,
}

#[derive(Debug)]
struct Period {
    /// First sample of the rollout overlap.
    start: i64,
    /// First sample after it.
    settled: i64,
    version: usize,
    previous: Option<usize>,
}

#[derive(Debug)]
pub struct Plan {
    /// The input cores followed by minted ones.
    pub cores: Vec<Vec<u64>>,
    pub minted: Vec<Minted>,
    /// Traces up to here (inclusive) are final; `None` labels nothing.
    pub labeled_until: Option<i64>,
    /// The version at `labeled_until`.
    pub current: Option<usize>,
    /// The version before the first period.
    base: Option<usize>,
    periods: Vec<Period>,
    /// Traces after this were labelled at max hold, unconfirmed, so by content.
    forced_after: i64,
}

#[derive(Debug)]
struct Event {
    /// Last sample of the pre-run.
    pre: usize,
    /// First sample of the post-run.
    post: usize,
    removed: Vec<u64>,
    added: Vec<u64>,
}

pub fn plan(input: &Input, knobs: &Knobs) -> Plan {
    let samples: Vec<&Sample> = input.context.iter().chain(input.pending).collect();
    let ctx = input.context.len();
    let mut plan = Plan {
        cores: input.cores.to_vec(),
        minted: Vec::new(),
        labeled_until: None,
        current: input.current,
        base: input.current,
        periods: Vec::new(),
        forced_after: i64::MAX,
    };

    let settled = settled_until(input.pending, knobs);
    let forced = (!input.truncated)
        .then(|| {
            input
                .pending
                .iter()
                .rev()
                .map(|s| s.time)
                .find(|t| input.now - t >= knobs.max_hold)
        })
        .flatten()
        .filter(|forced| settled.is_none_or(|settled| *forced > settled));
    let Some(mut until) = settled.max(forced) else {
        return plan;
    };

    let mut events = events(&samples, knobs);
    // A post-run starting in the context was applied by an earlier run.
    events.retain(|e| e.post >= ctx);

    if plan.current.is_none() {
        let end = events
            .first()
            .map(|e| e.pre + 1)
            .unwrap_or(samples.len())
            .min(ctx + knobs.min_run)
            .max(ctx + 1);
        let version = plan.version_for(intersect(&samples[ctx..end]), ctx);
        plan.base = Some(version);
        plan.current = Some(version);
    }

    for (i, event) in events.iter().enumerate() {
        let start = samples[event.pre + 1].time;
        if start > until {
            break;
        }
        let end = events
            .get(i + 1)
            .map(|next| next.pre + 1)
            .unwrap_or(samples.len())
            .min(event.post + knobs.min_run);
        let version = plan.version_for(intersect(&samples[event.post..end]), event.post);
        if Some(version) == plan.current {
            continue;
        }
        let settled = samples[event.post].time;
        plan.periods.push(Period {
            start,
            settled,
            version,
            previous: plan.current,
        });
        plan.current = Some(version);
        // The change is final, so its whole overlap is too.
        until = until.max(settled - 1);
    }

    if let Some(forced) = forced {
        plan.forced_after = settled.unwrap_or(i64::MIN);
        let forced_samples: Vec<usize> = (ctx..samples.len())
            .filter(|&i| samples[i].time > plan.forced_after && samples[i].time <= forced)
            .collect();
        let unmatched: Vec<usize> = forced_samples
            .iter()
            .copied()
            .filter(|&i| {
                plan.contained(&samples[i].lines, 0..plan.cores.len())
                    .is_none()
            })
            .collect();
        if let Some(&first) = unmatched.first() {
            let unmatched: Vec<&Sample> = unmatched.iter().map(|&i| samples[i]).collect();
            plan.version_for(intersect(&unmatched), first);
        }
        if let Some(&last) = forced_samples.last() {
            plan.current = plan.label(samples[last].time, Some(&samples[last].lines));
        }
    }

    plan.labeled_until = Some(until);
    plan
}

impl Plan {
    /// The version of a trace at `time`; `lines` (its first prompt) settles
    /// overlaps and max-hold labels by content.
    pub fn label(&self, time: i64, lines: Option<&[u64]>) -> Option<usize> {
        let period = self
            .periods
            .partition_point(|p| p.start <= time)
            .checked_sub(1)
            .map(|i| &self.periods[i]);
        let (by_time, overlap) = match period {
            None => (self.base, None),
            Some(p) if time < p.settled => (p.previous, Some(p)),
            Some(p) => (Some(p.version), None),
        };
        let Some(lines) = lines else {
            return by_time;
        };
        if time > self.forced_after {
            if by_time.is_some_and(|v| contains(lines, &self.cores[v])) {
                return by_time;
            }
            return self.contained(lines, 0..self.cores.len()).or(by_time);
        }
        match overlap {
            Some(p) => self
                .contained(lines, p.previous.into_iter().chain([p.version]))
                .or(by_time),
            None => by_time,
        }
    }

    /// A trace that arrived after its time was labelled: by content against
    /// known versions, never minting.
    pub fn label_late(&self, lines: &[u64]) -> Option<usize> {
        self.contained(lines, 0..self.cores.len()).or(self.base)
    }

    /// Time ranges `[from, to)` whose traces need their prompt to be labelled.
    pub fn content_ranges(&self) -> Vec<(i64, i64)> {
        let mut ranges: Vec<(i64, i64)> = self
            .periods
            .iter()
            .filter(|p| p.start < p.settled)
            .map(|p| (p.start, p.settled))
            .collect();
        if let Some(until) = self.labeled_until
            && self.forced_after < until
        {
            ranges.push((self.forced_after + 1, until + 1));
        }
        ranges
    }

    /// The largest of `candidates`' cores contained in `lines`.
    fn contained(&self, lines: &[u64], candidates: impl Iterator<Item = usize>) -> Option<usize> {
        candidates
            .filter(|&v| contains(lines, &self.cores[v]))
            .max_by_key(|&v| self.cores[v].len())
    }

    /// An existing version with this core (a rollback), else a minted one.
    fn version_for(&mut self, core: Vec<u64>, example: usize) -> usize {
        if let Some(version) = self.cores.iter().position(|c| *c == core) {
            return version;
        }
        self.cores.push(core);
        let version = self.cores.len() - 1;
        self.minted.push(Minted { version, example });
        version
    }
}

/// The latest pending time with N samples after its possible rollout window,
/// so no change can still begin at or before it unseen.
fn settled_until(pending: &[Sample], knobs: &Knobs) -> Option<i64> {
    let mut last = None;
    for sample in pending {
        let window_end = sample.time.saturating_add(knobs.rollout_window);
        let after = pending.len() - pending.partition_point(|s| s.time <= window_end);
        if after < knobs.min_run {
            break;
        }
        last = Some(sample.time);
    }
    last
}

fn events(samples: &[&Sample], knobs: &Knobs) -> Vec<Event> {
    let mut postings: HashMap<u64, Vec<usize>> = HashMap::new();
    for (i, sample) in samples.iter().enumerate() {
        for &line in &sample.lines {
            postings.entry(line).or_default().push(i);
        }
    }

    // (pre, post, line, added)
    let mut flips: Vec<(usize, usize, u64, bool)> = Vec::new();
    for (line, present) in postings {
        if present.len() < knobs.min_run {
            continue;
        }
        let long_runs: Vec<(bool, usize, usize)> = runs(&present, samples.len())
            .into_iter()
            .filter(|(_, start, end)| end - start + 1 >= knobs.min_run)
            .collect();
        for pair in long_runs.windows(2) {
            let [(before, _, pre), (after, post, _)] = [pair[0], pair[1]];
            if before == after {
                continue;
            }
            let overlap_ok = post == pre + 1
                || samples[post - 1].time - samples[pre + 1].time <= knobs.rollout_window;
            if overlap_ok {
                flips.push((pre, post, line, after));
            }
        }
    }
    flips.sort_unstable();

    let mut events: Vec<Event> = Vec::new();
    for (pre, post, line, added) in flips {
        let event = match events.last_mut() {
            Some(event) if pre < event.post => {
                event.post = event.post.max(post);
                event
            }
            _ => {
                events.push(Event {
                    pre,
                    post,
                    removed: Vec::new(),
                    added: Vec::new(),
                });
                events.last_mut().unwrap()
            }
        };
        if added {
            event.added.push(line);
        } else {
            event.removed.push(line);
        }
    }

    // In a deploy every overlap prompt is wholly old or wholly new; a prompt
    // with both old and new lines is churn, not a change.
    events.retain(|e| {
        samples[e.pre + 1..e.post].iter().all(|s| {
            let has = |lines: &[u64]| lines.iter().any(|l| s.lines.binary_search(l).is_ok());
            !(has(&e.removed) && has(&e.added))
        })
    });
    events
}

/// Alternating (present, first, last) runs covering `0..len`, given the
/// sorted indices where a line is present.
fn runs(present: &[usize], len: usize) -> Vec<(bool, usize, usize)> {
    let mut runs = Vec::new();
    let mut cursor = 0;
    let mut i = 0;
    while i < present.len() {
        let start = present[i];
        while i + 1 < present.len() && present[i + 1] == present[i] + 1 {
            i += 1;
        }
        if start > cursor {
            runs.push((false, cursor, start - 1));
        }
        runs.push((true, start, present[i]));
        cursor = present[i] + 1;
        i += 1;
    }
    if cursor < len {
        runs.push((false, cursor, len - 1));
    }
    runs
}

fn intersect(samples: &[&Sample]) -> Vec<u64> {
    let Some((first, rest)) = samples.split_first() else {
        return Vec::new();
    };
    let mut core = first.lines.clone();
    for sample in rest {
        core.retain(|l| sample.lines.binary_search(l).is_ok());
    }
    core
}

fn contains(lines: &[u64], core: &[u64]) -> bool {
    core.iter().all(|l| lines.binary_search(l).is_ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    const MINUTE: i64 = 60_000_000_000;
    const HOUR: i64 = 60 * MINUTE;

    const KNOBS: Knobs = Knobs {
        min_run: 5,
        rollout_window: 30 * MINUTE,
        max_hold: 24 * HOUR,
    };

    const A: &[u64] = &[1, 2, 3];
    const B: &[u64] = &[1, 2, 4];

    /// A sample at `minute` with `core` plus a line unique to the trace.
    fn sample(minute: i64, core: &[u64]) -> Sample {
        let mut lines = core.to_vec();
        lines.push(1_000_000 + minute as u64);
        lines.sort_unstable();
        Sample {
            time: minute * MINUTE,
            lines,
        }
    }

    /// One sample a minute from `from`, cycling through `cores`.
    fn stream(from: i64, count: i64, cores: &[&[u64]]) -> Vec<Sample> {
        (0..count)
            .map(|i| sample(from + i, cores[i as usize % cores.len()]))
            .collect()
    }

    fn run(
        context: &[Sample],
        pending: &[Sample],
        cores: &[Vec<u64>],
        current: Option<usize>,
    ) -> Plan {
        let now = pending.last().map(|s| s.time).unwrap_or(0) + MINUTE;
        plan(
            &Input {
                context,
                pending,
                truncated: false,
                cores,
                current,
                now,
            },
            &KNOBS,
        )
    }

    fn label_at(plan: &Plan, s: &Sample) -> Option<usize> {
        plan.label(s.time, Some(&s.lines))
    }

    #[test]
    fn cold_start_mints_the_shared_core() {
        let pending = stream(0, 60, &[A]);
        let plan = run(&[], &pending, &[], None);
        assert_eq!(plan.cores, vec![A.to_vec()]);
        assert_eq!(
            plan.minted,
            vec![Minted {
                version: 0,
                example: 0
            }]
        );
        // 5 samples must follow t + 30 min.
        assert_eq!(plan.labeled_until, Some(24 * MINUTE));
        assert_eq!(plan.label(10 * MINUTE, None), Some(0));
    }

    #[test]
    fn too_few_samples_wait() {
        let pending = stream(0, 20, &[A]);
        let plan = run(&[], &pending, &[], None);
        assert_eq!(plan.labeled_until, None);
        assert!(plan.minted.is_empty());
    }

    #[test]
    fn a_change_mints_only_the_new_version() {
        let mut pending = stream(0, 40, &[A]);
        pending.extend(stream(40, 60, &[B]));
        let plan = run(&[], &pending, &[A.to_vec()], Some(0));
        assert_eq!(plan.cores, vec![A.to_vec(), B.to_vec()]);
        assert_eq!(
            plan.minted,
            vec![Minted {
                version: 1,
                example: 40
            }]
        );
        assert_eq!(plan.label(39 * MINUTE, None), Some(0));
        assert_eq!(plan.label(40 * MINUTE, None), Some(1));
        assert_eq!(plan.current, Some(1));
    }

    #[test]
    fn a_rollback_reuses_the_old_version() {
        let mut pending = stream(0, 40, &[B]);
        pending.extend(stream(40, 60, &[A]));
        let plan = run(&[], &pending, &[A.to_vec(), B.to_vec()], Some(1));
        assert!(plan.minted.is_empty());
        assert_eq!(plan.label(50 * MINUTE, None), Some(0));
        assert_eq!(plan.current, Some(0));
    }

    #[test]
    fn a_rolling_deploy_labels_the_overlap_by_content() {
        let mut pending = stream(0, 40, &[A]);
        pending.extend(stream(40, 10, &[A, B]));
        pending.extend(stream(50, 60, &[B]));
        let plan = run(&[], &pending, &[A.to_vec()], Some(0));
        assert_eq!(plan.minted.len(), 1);
        // Sample 40 is A and 49 is B, so the mixed stretch is 41..49.
        assert_eq!(plan.content_ranges(), vec![(41 * MINUTE, 49 * MINUTE)]);
        for s in &pending[40..50] {
            let expected = if s.lines.contains(&3) { 0 } else { 1 };
            assert_eq!(label_at(&plan, s), Some(expected));
        }
        assert_eq!(plan.label(45 * MINUTE, None), Some(0));
    }

    #[test]
    fn an_ab_variant_is_not_a_version() {
        let variant: &[u64] = &[1, 2, 3, 9];
        let cores: Vec<&[u64]> = (0..10).map(|i| if i == 0 { variant } else { A }).collect();
        let plan = run(&[], &stream(0, 200, &cores), &[], None);
        assert_eq!(plan.cores, vec![A.to_vec()]);
        assert_eq!(plan.label(100 * MINUTE, Some(variant)), Some(0));
    }

    #[test]
    fn churn_across_the_overlap_is_not_a_change() {
        let both: &[u64] = &[1, 2, 3, 4];
        let mut pending = stream(0, 40, &[A]);
        pending.extend(stream(40, 10, &[A, both, B]));
        pending.extend(stream(50, 60, &[B]));
        let plan = run(&[], &pending, &[A.to_vec()], Some(0));
        assert!(plan.minted.is_empty());
    }

    #[test]
    fn a_change_inside_the_context_is_not_reapplied() {
        let mut context = stream(0, 5, &[A]);
        context.extend(stream(5, 5, &[B]));
        let pending = stream(10, 60, &[B]);
        let plan = run(&context, &pending, &[A.to_vec(), B.to_vec()], Some(1));
        assert!(plan.periods.is_empty());
        assert_eq!(plan.current, Some(1));
    }

    #[test]
    fn a_new_day_is_not_a_change() {
        use super::super::normalize::line_set;
        let day = |minute: i64, date: &str| Sample {
            time: minute * MINUTE,
            lines: line_set(&format!("You are a helpful agent.\nToday is {date}."), ""),
        };
        let mut pending: Vec<Sample> = (0..40).map(|m| day(m, "2026-10-22")).collect();
        pending.extend((40..100).map(|m| day(m, "2026-10-23")));
        let plan = run(&[], &pending, &[], None);
        assert_eq!(plan.cores.len(), 1);
    }

    #[test]
    fn a_quiet_agent_is_labelled_at_max_hold() {
        let pending: Vec<Sample> = (0..3).map(|i| sample(i, B)).collect();
        let mut plan = run(&[], &pending, &[A.to_vec()], Some(0));
        assert_eq!(plan.labeled_until, None);

        plan = plan_at(&pending, 25 * HOUR);
        assert_eq!(plan.labeled_until, Some(2 * MINUTE));
        assert_eq!(plan.cores[1], B.to_vec());
        assert_eq!(label_at(&plan, &pending[1]), Some(1));
        assert_eq!(plan.label(MINUTE, Some(&[1, 2, 3, 7])), Some(0));
        assert_eq!(plan.current, Some(1));
    }

    fn plan_at(pending: &[Sample], now: i64) -> Plan {
        plan(
            &Input {
                context: &[],
                pending,
                truncated: false,
                cores: &[A.to_vec()],
                current: Some(0),
                now,
            },
            &KNOBS,
        )
    }

    #[test]
    fn a_truncated_backlog_is_never_forced() {
        let pending: Vec<Sample> = (0..3).map(|i| sample(i, B)).collect();
        let plan = plan(
            &Input {
                context: &[],
                pending: &pending,
                truncated: true,
                cores: &[A.to_vec()],
                current: Some(0),
                now: 25 * HOUR,
            },
            &KNOBS,
        );
        assert_eq!(plan.labeled_until, None);
    }

    #[test]
    fn late_traces_match_known_versions() {
        let plan = run(
            &[],
            &stream(0, 60, &[A]),
            &[A.to_vec(), B.to_vec()],
            Some(0),
        );
        assert_eq!(plan.label_late(&[1, 2, 4, 8]), Some(1));
        assert_eq!(plan.label_late(&[1, 8]), Some(0));
    }
}
