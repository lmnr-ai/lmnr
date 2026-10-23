//! An agent's version timeline, built without IO. Given its samples (one per
//! trace, oldest first) and its known versions, find sharp line flips, turn
//! them into version changes, and decide how far and with which version
//! traces are labelled.
//!
//! A flip is a line present in N consecutive samples and absent in the next N
//! (or the reverse), allowing a rollout overlap of mixed samples between the
//! two runs. Flips with intersecting overlaps form one change; the new
//! version's core is the intersection of the samples after it. Outside an
//! overlap a trace gets the version of its time; inside one, the larger core
//! its prompt contains.

use std::collections::HashMap;

pub struct Params {
    /// N, in samples.
    pub min_run: usize,
    pub rollout_window: i64,
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
    pub labeled: &'a [Sample],
    /// Unlabelled samples, oldest first.
    pub unlabeled: &'a [Sample],
    /// Core line sets of the agent's versions, each sorted.
    pub cores: &'a [Vec<u64>],
    /// The version at the labelling horizon.
    pub current: Option<usize>,
}

#[derive(Debug, PartialEq)]
pub struct NewVersion {
    /// Index into [`Timeline::cores`].
    pub version: usize,
    /// A sample containing the core, indexed over `labeled` then `unlabeled`.
    pub example: usize,
}

#[derive(Debug)]
struct Change {
    /// First sample of the rollout overlap.
    start: i64,
    /// First sample after it.
    settled: i64,
    from: Option<usize>,
    to: usize,
}

#[derive(Debug)]
pub struct Timeline {
    /// The input cores followed by new ones.
    pub cores: Vec<Vec<u64>>,
    pub new_versions: Vec<NewVersion>,
    /// Traces up to here (inclusive) are final; `None` labels nothing.
    pub labeled_until: Option<i64>,
    /// The version at `labeled_until`.
    pub current: Option<usize>,
    /// The version before the first change.
    initial: Option<usize>,
    changes: Vec<Change>,
}

#[derive(Debug)]
struct Flip {
    /// Last sample of the pre-run.
    pre: usize,
    /// First sample of the post-run.
    post: usize,
    removed: Vec<u64>,
    added: Vec<u64>,
}

pub fn build(input: &Input, params: &Params) -> Timeline {
    let samples: Vec<&Sample> = input.labeled.iter().chain(input.unlabeled).collect();
    let first_unlabeled = input.labeled.len();
    let mut timeline = Timeline {
        cores: input.cores.to_vec(),
        new_versions: Vec::new(),
        labeled_until: None,
        current: input.current,
        initial: input.current,
        changes: Vec::new(),
    };

    // A trace without N samples after it stays unlabelled until they arrive.
    let Some(mut until) = confirmed_until(input.unlabeled, params) else {
        return timeline;
    };

    let mut flips = flips(&samples, params);
    // A post-run starting in the labeled samples was applied by an earlier run.
    flips.retain(|f| f.post >= first_unlabeled);

    if timeline.current.is_none() {
        let end = flips
            .first()
            .map(|f| f.pre + 1)
            .unwrap_or(samples.len())
            .min(first_unlabeled + params.min_run)
            .max(first_unlabeled + 1);
        let version =
            timeline.version_for(intersect(&samples[first_unlabeled..end]), first_unlabeled);
        timeline.initial = Some(version);
        timeline.current = Some(version);
    }

    for (i, flip) in flips.iter().enumerate() {
        let start = samples[flip.pre + 1].time;
        if start > until {
            break;
        }
        let end = flips
            .get(i + 1)
            .map(|next| next.pre + 1)
            .unwrap_or(samples.len())
            .min(flip.post + params.min_run);
        let version = timeline.version_for(intersect(&samples[flip.post..end]), flip.post);
        if Some(version) == timeline.current {
            continue;
        }
        let settled = samples[flip.post].time;
        timeline.changes.push(Change {
            start,
            settled,
            from: timeline.current,
            to: version,
        });
        timeline.current = Some(version);
        // The change is final, so its whole overlap is too.
        until = until.max(settled - 1);
    }

    timeline.labeled_until = Some(until);
    timeline
}

impl Timeline {
    /// The version of a trace at `time`; `lines` (its first prompt) settles
    /// overlaps by content.
    pub fn version_at(&self, time: i64, lines: Option<&[u64]>) -> Option<usize> {
        let change = self
            .changes
            .partition_point(|c| c.start <= time)
            .checked_sub(1)
            .map(|i| &self.changes[i]);
        let (by_time, overlap) = match change {
            None => (self.initial, None),
            Some(c) if time < c.settled => (c.from, Some(c)),
            Some(c) => (Some(c.to), None),
        };
        let Some(lines) = lines else {
            return by_time;
        };
        match overlap {
            Some(c) => self
                .contained(lines, c.from.into_iter().chain([c.to]))
                .or(by_time),
            None => by_time,
        }
    }

    /// A trace that arrived after its time was labelled: by content against
    /// known versions, never minting.
    pub fn version_by_content(&self, lines: &[u64]) -> Option<usize> {
        self.contained(lines, 0..self.cores.len()).or(self.initial)
    }

    /// Time ranges `[from, to)` whose traces need their prompt to be labelled.
    pub fn prompt_ranges(&self) -> Vec<(i64, i64)> {
        self.changes
            .iter()
            .filter(|c| c.start < c.settled)
            .map(|c| (c.start, c.settled))
            .collect()
    }

    /// The largest of `candidates`' cores contained in `lines`.
    fn contained(&self, lines: &[u64], candidates: impl Iterator<Item = usize>) -> Option<usize> {
        candidates
            .filter(|&v| contains(lines, &self.cores[v]))
            .max_by_key(|&v| self.cores[v].len())
    }

    /// An existing version with this core (a rollback), else a new one.
    fn version_for(&mut self, core: Vec<u64>, example: usize) -> usize {
        if let Some(version) = self.cores.iter().position(|c| *c == core) {
            return version;
        }
        self.cores.push(core);
        let version = self.cores.len() - 1;
        self.new_versions.push(NewVersion { version, example });
        version
    }
}

/// The latest unlabeled time with N samples after its possible rollout window,
/// so no change can still begin at or before it unseen.
fn confirmed_until(unlabeled: &[Sample], params: &Params) -> Option<i64> {
    let mut last = None;
    for sample in unlabeled {
        let window_end = sample.time.saturating_add(params.rollout_window);
        let after = unlabeled.len() - unlabeled.partition_point(|s| s.time <= window_end);
        if after < params.min_run {
            break;
        }
        last = Some(sample.time);
    }
    last
}

fn flips(samples: &[&Sample], params: &Params) -> Vec<Flip> {
    let mut postings: HashMap<u64, Vec<usize>> = HashMap::new();
    for (i, sample) in samples.iter().enumerate() {
        for &line in &sample.lines {
            postings.entry(line).or_default().push(i);
        }
    }

    // (pre, post, line, added)
    let mut line_flips: Vec<(usize, usize, u64, bool)> = Vec::new();
    for (line, present) in postings {
        if present.len() < params.min_run {
            continue;
        }
        let long_runs: Vec<(bool, usize, usize)> = runs(&present, samples.len())
            .into_iter()
            .filter(|(_, start, end)| end - start + 1 >= params.min_run)
            .collect();
        for pair in long_runs.windows(2) {
            let [(before, _, pre), (after, post, _)] = [pair[0], pair[1]];
            if before == after {
                continue;
            }
            let overlap_ok = post == pre + 1
                || samples[post - 1].time - samples[pre + 1].time <= params.rollout_window;
            if overlap_ok {
                line_flips.push((pre, post, line, after));
            }
        }
    }
    line_flips.sort_unstable();

    let mut flips: Vec<Flip> = Vec::new();
    for (pre, post, line, added) in line_flips {
        let flip = match flips.last_mut() {
            Some(flip) if pre < flip.post => {
                flip.post = flip.post.max(post);
                flip
            }
            _ => {
                flips.push(Flip {
                    pre,
                    post,
                    removed: Vec::new(),
                    added: Vec::new(),
                });
                flips.last_mut().unwrap()
            }
        };
        if added {
            flip.added.push(line);
        } else {
            flip.removed.push(line);
        }
    }

    // In a deploy every overlap prompt is wholly old or wholly new; a prompt
    // with both old and new lines is churn, not a change.
    flips.retain(|f| {
        samples[f.pre + 1..f.post].iter().all(|s| {
            let has = |lines: &[u64]| lines.iter().any(|l| s.lines.binary_search(l).is_ok());
            !(has(&f.removed) && has(&f.added))
        })
    });
    flips
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

    const PARAMS: Params = Params {
        min_run: 5,
        rollout_window: 30 * MINUTE,
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
        labeled: &[Sample],
        unlabeled: &[Sample],
        cores: &[Vec<u64>],
        current: Option<usize>,
    ) -> Timeline {
        build(
            &Input {
                labeled,
                unlabeled,
                cores,
                current,
            },
            &PARAMS,
        )
    }

    fn version_of(timeline: &Timeline, s: &Sample) -> Option<usize> {
        timeline.version_at(s.time, Some(&s.lines))
    }

    #[test]
    fn cold_start_mints_the_shared_core() {
        let unlabeled = stream(0, 60, &[A]);
        let timeline = run(&[], &unlabeled, &[], None);
        assert_eq!(timeline.cores, vec![A.to_vec()]);
        assert_eq!(
            timeline.new_versions,
            vec![NewVersion {
                version: 0,
                example: 0
            }]
        );
        // 5 samples must follow t + 30 min.
        assert_eq!(timeline.labeled_until, Some(24 * MINUTE));
        assert_eq!(timeline.version_at(10 * MINUTE, None), Some(0));
    }

    #[test]
    fn too_few_samples_wait() {
        let unlabeled = stream(0, 20, &[A]);
        let timeline = run(&[], &unlabeled, &[], None);
        assert_eq!(timeline.labeled_until, None);
        assert!(timeline.new_versions.is_empty());
    }

    #[test]
    fn a_change_mints_only_the_new_version() {
        let mut unlabeled = stream(0, 40, &[A]);
        unlabeled.extend(stream(40, 60, &[B]));
        let timeline = run(&[], &unlabeled, &[A.to_vec()], Some(0));
        assert_eq!(timeline.cores, vec![A.to_vec(), B.to_vec()]);
        assert_eq!(
            timeline.new_versions,
            vec![NewVersion {
                version: 1,
                example: 40
            }]
        );
        assert_eq!(timeline.version_at(39 * MINUTE, None), Some(0));
        assert_eq!(timeline.version_at(40 * MINUTE, None), Some(1));
        assert_eq!(timeline.current, Some(1));
    }

    #[test]
    fn a_rollback_reuses_the_old_version() {
        let mut unlabeled = stream(0, 40, &[B]);
        unlabeled.extend(stream(40, 60, &[A]));
        let timeline = run(&[], &unlabeled, &[A.to_vec(), B.to_vec()], Some(1));
        assert!(timeline.new_versions.is_empty());
        assert_eq!(timeline.version_at(50 * MINUTE, None), Some(0));
        assert_eq!(timeline.current, Some(0));
    }

    #[test]
    fn a_rolling_deploy_labels_the_overlap_by_content() {
        let mut unlabeled = stream(0, 40, &[A]);
        unlabeled.extend(stream(40, 10, &[A, B]));
        unlabeled.extend(stream(50, 60, &[B]));
        let timeline = run(&[], &unlabeled, &[A.to_vec()], Some(0));
        assert_eq!(timeline.new_versions.len(), 1);
        // Sample 40 is A and 49 is B, so the mixed stretch is 41..49.
        assert_eq!(timeline.prompt_ranges(), vec![(41 * MINUTE, 49 * MINUTE)]);
        for s in &unlabeled[40..50] {
            let expected = if s.lines.contains(&3) { 0 } else { 1 };
            assert_eq!(version_of(&timeline, s), Some(expected));
        }
        assert_eq!(timeline.version_at(45 * MINUTE, None), Some(0));
    }

    #[test]
    fn an_ab_variant_is_not_a_version() {
        let variant: &[u64] = &[1, 2, 3, 9];
        let cores: Vec<&[u64]> = (0..10).map(|i| if i == 0 { variant } else { A }).collect();
        let timeline = run(&[], &stream(0, 200, &cores), &[], None);
        assert_eq!(timeline.cores, vec![A.to_vec()]);
        assert_eq!(timeline.version_at(100 * MINUTE, Some(variant)), Some(0));
    }

    #[test]
    fn churn_across_the_overlap_is_not_a_change() {
        let both: &[u64] = &[1, 2, 3, 4];
        let mut unlabeled = stream(0, 40, &[A]);
        unlabeled.extend(stream(40, 10, &[A, both, B]));
        unlabeled.extend(stream(50, 60, &[B]));
        let timeline = run(&[], &unlabeled, &[A.to_vec()], Some(0));
        assert!(timeline.new_versions.is_empty());
    }

    #[test]
    fn a_change_inside_the_labeled_samples_is_not_reapplied() {
        let mut labeled = stream(0, 5, &[A]);
        labeled.extend(stream(5, 5, &[B]));
        let unlabeled = stream(10, 60, &[B]);
        let timeline = run(&labeled, &unlabeled, &[A.to_vec(), B.to_vec()], Some(1));
        assert!(timeline.changes.is_empty());
        assert_eq!(timeline.current, Some(1));
    }

    #[test]
    fn a_new_day_is_not_a_change() {
        use super::super::normalize::line_set;
        let day = |minute: i64, date: &str| Sample {
            time: minute * MINUTE,
            lines: line_set(&format!("You are a helpful agent.\nToday is {date}."), ""),
        };
        let mut unlabeled: Vec<Sample> = (0..40).map(|m| day(m, "2026-10-22")).collect();
        unlabeled.extend((40..100).map(|m| day(m, "2026-10-23")));
        let timeline = run(&[], &unlabeled, &[], None);
        assert_eq!(timeline.cores.len(), 1);
    }

    #[test]
    fn a_quiet_agent_waits_for_n_more_traces() {
        let mut unlabeled: Vec<Sample> = (0..3).map(|i| sample(i * 60, A)).collect();
        let timeline = run(&[], &unlabeled, &[A.to_vec()], Some(0));
        assert_eq!(timeline.labeled_until, None);

        unlabeled.extend((0..5).map(|i| sample(1000 + i, A)));
        let timeline = run(&[], &unlabeled, &[A.to_vec()], Some(0));
        assert_eq!(timeline.labeled_until, Some(120 * MINUTE));
    }

    #[test]
    fn late_traces_match_known_versions() {
        let timeline = run(
            &[],
            &stream(0, 60, &[A]),
            &[A.to_vec(), B.to_vec()],
            Some(0),
        );
        assert_eq!(timeline.version_by_content(&[1, 2, 4, 8]), Some(1));
        assert_eq!(timeline.version_by_content(&[1, 8]), Some(0));
    }
}
