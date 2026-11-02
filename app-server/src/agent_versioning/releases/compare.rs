//! Release decisions, built without IO. A release is read as a few sampled
//! prompts; a core line changed between two releases when it is in every
//! prompt of one and in no prompt of the other. Lines that come and go within
//! a release (optional clauses, dynamic content) never count.

/// A release's sampled prompts, or a known version's core.
#[derive(Debug, Clone, PartialEq)]
pub struct PromptLines {
    /// Lines in every prompt, sorted.
    pub every: Vec<u64>,
    /// Lines in any prompt, sorted.
    pub any: Vec<u64>,
}

impl PromptLines {
    /// From prompts whose lines are each sorted and deduplicated.
    pub fn from_samples<'a>(samples: impl IntoIterator<Item = &'a [u64]>) -> Self {
        let mut samples = samples.into_iter();
        let Some(first) = samples.next() else {
            return PromptLines::from_core(&[]);
        };
        let mut every = first.to_vec();
        let mut any = first.to_vec();
        for lines in samples {
            every.retain(|l| lines.binary_search(l).is_ok());
            any.extend_from_slice(lines);
        }
        any.sort_unstable();
        any.dedup();
        PromptLines { every, any }
    }

    pub fn from_core(core: &[u64]) -> Self {
        PromptLines {
            every: core.to_vec(),
            any: core.to_vec(),
        }
    }
}

/// Lines in every prompt of one and in none of the other, sorted.
pub fn changed(a: &PromptLines, b: &PromptLines) -> Vec<u64> {
    let mut lines: Vec<u64> = a
        .every
        .iter()
        .filter(|l| b.any.binary_search(l).is_err())
        .chain(b.every.iter().filter(|l| a.any.binary_search(l).is_err()))
        .copied()
        .collect();
    lines.sort_unstable();
    lines
}

#[derive(Debug, PartialEq)]
pub enum Decision {
    /// The baseline's version: no line changed.
    Same,
    /// An existing version, by index into the cores: a rollback.
    Existing(usize),
    /// A new version with this core.
    New(Vec<u64>),
}

/// A release's version given the release before it (`baseline`, when it has
/// a version) and the agent's version cores, oldest first.
pub fn decide(
    release: &PromptLines,
    baseline: Option<&PromptLines>,
    cores: &[Vec<u64>],
) -> Decision {
    if baseline.is_some_and(|b| changed(release, b).is_empty()) {
        return Decision::Same;
    }
    match cores
        .iter()
        .rposition(|core| changed(release, &PromptLines::from_core(core)).is_empty())
    {
        Some(version) => Decision::Existing(version),
        None => Decision::New(release.every.clone()),
    }
}

pub struct Params {
    /// N: traces a release is decided from.
    pub min_run: u64,
    /// Nanoseconds after its first prompt that a short release is decided anyway.
    pub decide_after: i64,
}

/// How many of an undecided release's `traces` to decide it from now, if it
/// can be decided: N once it has them, else however many it has once a newer
/// release reached N or it is `age` old enough.
pub fn sample_size(traces: u64, newer_has_min_run: bool, age: i64, params: &Params) -> Option<u64> {
    if traces >= params.min_run {
        Some(params.min_run)
    } else if (newer_has_min_run || age >= params.decide_after) && traces > 0 {
        Some(traces)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PARAMS: Params = Params {
        min_run: 10,
        decide_after: 100,
    };

    fn lines(samples: &[&[u64]]) -> PromptLines {
        PromptLines::from_samples(samples.iter().copied())
    }

    #[test]
    fn identical_releases_do_not_change() {
        let a = lines(&[&[1, 2, 3], &[1, 2, 3]]);
        let b = lines(&[&[1, 2, 3]]);
        assert!(changed(&a, &b).is_empty());
        assert_eq!(decide(&b, Some(&a), &[vec![1, 2, 3]]), Decision::Same);
    }

    #[test]
    fn an_added_or_removed_line_changes() {
        let a = lines(&[&[1, 2, 3], &[1, 2, 3]]);
        let b = lines(&[&[1, 2, 3, 4], &[1, 2, 3, 4]]);
        assert_eq!(changed(&a, &b), vec![4]);
        assert_eq!(changed(&b, &a), vec![4]);
        let c = lines(&[&[1, 3], &[1, 3]]);
        assert_eq!(changed(&a, &c), vec![2]);
        assert_eq!(
            decide(&b, Some(&a), &[vec![1, 2, 3]]),
            Decision::New(vec![1, 2, 3, 4])
        );
    }

    #[test]
    fn optional_lines_are_noise() {
        // 9 comes and goes in both releases; 8 only in some of the new one's.
        let a = lines(&[&[1, 2, 9], &[1, 2]]);
        let b = lines(&[&[1, 2], &[1, 2, 8, 9], &[1, 2, 9]]);
        assert!(changed(&a, &b).is_empty());
        // An optional line seen in every one of a few samples still has to be
        // missing from every prompt of the other release.
        let c = lines(&[&[1, 2, 9], &[1, 2, 9]]);
        assert!(changed(&a, &c).is_empty());
    }

    #[test]
    fn a_rollback_reuses_the_version() {
        let cores = vec![vec![1, 2], vec![1, 2, 3]];
        let back = lines(&[&[1, 2], &[1, 2, 7]]);
        let previous = lines(&[&[1, 2, 3]]);
        assert_eq!(
            decide(&back, Some(&previous), &cores),
            Decision::Existing(0)
        );
        // Without a baseline too, newest matching core first.
        let cores = vec![vec![1, 2], vec![1, 2]];
        assert_eq!(decide(&back, None, &cores), Decision::Existing(1));
    }

    #[test]
    fn releases_chain_into_versions() {
        // a, then b changes the prompt, then c ships no prompt change.
        let a = lines(&[&[1, 2], &[1, 2, 5]]);
        let b = lines(&[&[1, 2, 3], &[1, 2, 3]]);
        let c = lines(&[&[1, 2, 3, 6], &[1, 2, 3]]);
        let mut cores = Vec::new();
        let mut versions = Vec::new();
        let mut previous: Option<(&PromptLines, usize)> = None;
        for release in [&a, &b, &c] {
            let version = match decide(release, previous.map(|p| p.0), &cores) {
                Decision::Same => previous.unwrap().1,
                Decision::Existing(version) => version,
                Decision::New(core) => {
                    cores.push(core);
                    cores.len() - 1
                }
            };
            versions.push(version);
            previous = Some((release, version));
        }
        assert_eq!(versions, vec![0, 1, 1]);
        assert_eq!(cores, vec![vec![1, 2], vec![1, 2, 3]]);
    }

    #[test]
    fn sample_size_waits_for_n_or_a_reason() {
        assert_eq!(sample_size(12, false, 0, &PARAMS), Some(10));
        assert_eq!(sample_size(5, false, 0, &PARAMS), None);
        // A newer release reached N, or the release timed out.
        assert_eq!(sample_size(5, true, 0, &PARAMS), Some(5));
        assert_eq!(sample_size(5, false, 100, &PARAMS), Some(5));
        // From any number of traces, but never none (expired from `agent_prompts`).
        assert_eq!(sample_size(1, false, 100, &PARAMS), Some(1));
        assert_eq!(sample_size(0, true, 1000, &PARAMS), None);
    }
}
