//! Line-level diff of two example prompts, rendered into the agent's user
//! message so the model sees what varies dynamically between examples. The
//! diff is advisory only — the `regex` tool always re-verifies against the
//! raw examples.

use similar::{ChangeTag, TextDiff};

/// Context lines kept on each side of a collapsed unchanged run.
const CONTEXT_LINES: usize = 3;
/// Unchanged runs longer than this many lines are collapsed.
const MAX_UNCHANGED_RUN: usize = 2 * CONTEXT_LINES + 1;

/// Render a line-level diff with `- ` / `+ ` / `  ` prefixes. Unchanged runs
/// longer than [`MAX_UNCHANGED_RUN`] lines are collapsed to
/// [`CONTEXT_LINES`] context lines on each side plus an omission marker; the
/// leading context is dropped when the run opens the diff and the trailing
/// context when it closes it.
pub fn line_diff(old: &str, new: &str) -> String {
    let diff = TextDiff::from_lines(old, new);

    enum Entry {
        Changed(String),
        Unchanged(Vec<String>),
    }

    let mut entries: Vec<Entry> = Vec::new();
    for change in diff.iter_all_changes() {
        let line = change.value().strip_suffix('\n').unwrap_or(change.value());
        match change.tag() {
            ChangeTag::Equal => {
                if let Some(Entry::Unchanged(run)) = entries.last_mut() {
                    run.push(format!("  {line}"));
                } else {
                    entries.push(Entry::Unchanged(vec![format!("  {line}")]));
                }
            }
            ChangeTag::Delete => entries.push(Entry::Changed(format!("- {line}"))),
            ChangeTag::Insert => entries.push(Entry::Changed(format!("+ {line}"))),
        }
    }

    let last_index = entries.len().saturating_sub(1);
    let mut out: Vec<String> = Vec::new();
    for (i, entry) in entries.into_iter().enumerate() {
        match entry {
            Entry::Changed(line) => out.push(line),
            Entry::Unchanged(run) => {
                if run.len() > MAX_UNCHANGED_RUN {
                    let head = if i == 0 { 0 } else { CONTEXT_LINES };
                    let tail = if i == last_index { 0 } else { CONTEXT_LINES };
                    let hidden = run.len() - head - tail;
                    out.extend_from_slice(&run[..head]);
                    out.push(format!("… ({hidden} unchanged lines omitted) …"));
                    out.extend_from_slice(&run[run.len() - tail..]);
                } else {
                    out.extend(run);
                }
            }
        }
    }
    out.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn marks_changed_lines() {
        let old = "keep\nold value\nkeep2";
        let new = "keep\nnew value\nkeep2";
        assert_eq!(
            line_diff(old, new),
            "  keep\n- old value\n+ new value\n  keep2"
        );
    }

    #[test]
    fn collapses_long_unchanged_runs() {
        let common: Vec<String> = (0..10).map(|i| format!("line {i}")).collect();
        let old = format!("A\n{}\nC", common.join("\n"));
        let new = format!("B\n{}\nD", common.join("\n"));
        let diff = line_diff(&old, &new);
        assert!(diff.starts_with("- A\n+ B\n"));
        assert!(diff.contains("  line 0\n  line 1\n  line 2\n"));
        assert!(diff.contains("… (4 unchanged lines omitted) …"));
        assert!(diff.contains("  line 7\n  line 8\n  line 9\n"));
        assert!(diff.ends_with("- C\n+ D"));
        assert!(!diff.contains("line 4"));
    }

    #[test]
    fn skips_leading_context_when_run_opens_the_diff() {
        let common: Vec<String> = (0..10).map(|i| format!("line {i}")).collect();
        let old = format!("{}\nA", common.join("\n"));
        let new = format!("{}\nB", common.join("\n"));
        let diff = line_diff(&old, &new);
        assert!(diff.starts_with("… (7 unchanged lines omitted) …\n"));
        assert!(diff.contains("  line 7\n  line 8\n  line 9\n"));
        assert!(diff.ends_with("- A\n+ B"));
    }

    #[test]
    fn skips_trailing_context_when_run_closes_the_diff() {
        let common: Vec<String> = (0..10).map(|i| format!("line {i}")).collect();
        let old = format!("A\n{}", common.join("\n"));
        let new = format!("B\n{}", common.join("\n"));
        let diff = line_diff(&old, &new);
        assert!(diff.starts_with("- A\n+ B\n"));
        assert!(diff.contains("  line 0\n  line 1\n  line 2\n"));
        assert!(diff.ends_with("… (7 unchanged lines omitted) …"));
        assert!(!diff.contains("line 7"));
    }

    #[test]
    fn keeps_short_unchanged_runs() {
        let old = "a\nx\nx\nx\nb";
        let new = "a2\nx\nx\nx\nb";
        let diff = line_diff(old, new);
        assert!(!diff.contains("omitted"));
        assert_eq!(diff, "- a\n+ a2\n  x\n  x\n  x\n  b");
    }
}
