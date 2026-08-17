//! Line-level similarity and intersection primitives for prompt-version
//! detection (v2 pipeline).
//!
//! Lines are compared byte-identical (no trimming / case folding — nobody
//! reformats a system prompt between runs) and travel as 64-bit blake3
//! hashes so windows and version line sets stay compact in Redis.

use std::collections::HashSet;

use sha3::{Digest, Sha3_256};
use similar::{Algorithm, DiffOp, capture_diff_slices};

/// Cap on hashed lines per prompt. Prompts longer than this compare on their
/// first `MAX_LINES` *hashable* lines only — bounds both blob size and LCS
/// cost, both of which scale with the hash count rather than the raw text.
pub const MAX_LINES: usize = 4096;

/// 128-bit content hash of the raw prompt (memo key + byte-identity dedup).
pub fn full_prompt_hash(text: &str) -> String {
    hex::encode(blake3::hash(text.as_bytes()).as_bytes())[..32].to_string()
}

/// The lines that participate in hashing, in order: every line except
/// blank/whitespace-only ones, capped at [`MAX_LINES`].
///
/// Blanks are excluded because they carry no content yet made up a third of a
/// measured production system prompt, and as identical repeated tokens they
/// gave the LCS fold enormous alignment freedom — two prompts with the same
/// content could fold to different blank counts and mint different versions.
///
/// This is the single definition of "a line" for the pipeline. Anything that
/// pairs a hash back with the text it came from must walk the prompt through
/// here too, or the two stop lining up.
pub fn hashable_lines(text: &str) -> impl Iterator<Item = &str> {
    text.split('\n')
        .filter(|line| !line.trim().is_empty())
        .take(MAX_LINES)
}

fn hash_line(line: &str) -> u64 {
    let hash = blake3::hash(line.as_bytes());
    u64::from_le_bytes(hash.as_bytes()[..8].try_into().unwrap())
}

/// Per-line 64-bit hashes over [`hashable_lines`], in order.
pub fn line_hashes(text: &str) -> Vec<u64> {
    hashable_lines(text).map(hash_line).collect()
}

pub fn line_hash_set(hashes: &[u64]) -> HashSet<u64> {
    hashes.iter().copied().collect()
}

/// Jaccard similarity over line-hash sets. Empty-vs-empty is 0.
pub fn jaccard(a: &HashSet<u64>, b: &HashSet<u64>) -> f64 {
    if a.is_empty() && b.is_empty() {
        return 0.0;
    }
    let intersection = a.intersection(b).count();
    let union = a.len() + b.len() - intersection;
    intersection as f64 / union as f64
}

/// Longest common subsequence of two hash sequences (Myers, via `similar`).
pub fn lcs(a: &[u64], b: &[u64]) -> Vec<u64> {
    let mut out = Vec::new();
    for op in capture_diff_slices(Algorithm::Myers, a, b) {
        if let DiffOp::Equal { old_index, len, .. } = op {
            out.extend_from_slice(&a[old_index..old_index + len]);
        }
    }
    out
}

/// Ordered intersection of several sequences: iterative pairwise LCS fold.
/// The fold order affects the result on pathological inputs, so callers must
/// pass `seqs` in a deterministic order.
pub fn intersect_ordered(seqs: &[&[u64]]) -> Vec<u64> {
    let Some(first) = seqs.first() else {
        return Vec::new();
    };
    let mut acc: Vec<u64> = first.to_vec();
    for seq in &seqs[1..] {
        if acc.is_empty() {
            break;
        }
        acc = lcs(&acc, seq);
    }
    acc
}

/// Version hash: `sha3[..8 hex]` over the ordered intersection line hashes.
pub fn version_hash(intersection: &[u64]) -> String {
    let joined = intersection
        .iter()
        .map(|h| format!("{h:016x}"))
        .collect::<Vec<_>>()
        .join(":");
    let digest = Sha3_256::digest(joined.as_bytes());
    format!("{:x}", digest)[..8].to_string()
}

/// True iff every line of the version's static set occurs in the prompt.
pub fn is_subset(static_lines: &[u64], prompt_lines: &HashSet<u64>) -> bool {
    static_lines.iter().all(|h| prompt_lines.contains(h))
}

/// True iff `candidate` keeps every line of `base` and adds at least one —
/// i.e. the static set GREW. Set semantics, matching [`is_subset`]: a
/// repeated line counts once, and line order is irrelevant (the two are
/// independently-ordered LCS folds, so a reordering is not a change).
pub fn is_strict_superset(candidate: &[u64], base: &[u64]) -> bool {
    let candidate_set = line_hash_set(candidate);
    let base_set = line_hash_set(base);
    candidate_set.len() > base_set.len() && base_set.is_subset(&candidate_set)
}

/// Rebuild the static part as TEXT: keep the prompt's lines whose hashes
/// appear, in order, in `intersection`. Sound because the intersection is an
/// LCS fold over the cluster, so it's a subsequence of every member's line
/// hashes — including the triggering prompt's. Hashes are one-way, so this is
/// the only way to recover the text (see the `system_prompt_version_defs`
/// journal).
///
/// Walks [`hashable_lines`], so the output carries no blank lines: they aren't
/// part of a version, and emitting them would render text the hashes don't
/// describe.
pub fn reconstruct_static_text(prompt: &str, intersection: &[u64]) -> String {
    let mut wanted = intersection.iter().copied().peekable();
    let mut out: Vec<&str> = Vec::new();
    for line in hashable_lines(prompt) {
        let Some(target) = wanted.peek() else { break };
        if hash_line(line) == *target {
            out.push(line);
            wanted.next();
        }
    }
    out.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hashes(text: &str) -> Vec<u64> {
        line_hashes(text)
    }

    #[test]
    fn line_hashes_are_byte_identical() {
        assert_eq!(hashes("a\nb"), hashes("a\nb"));
        // Trailing whitespace / case are real differences.
        assert_ne!(hashes("a \nb"), hashes("a\nb"));
        assert_ne!(hashes("A\nb"), hashes("a\nb"));
    }

    #[test]
    fn blank_lines_do_not_participate_in_hashing() {
        assert_eq!(hashes("a\n\nb"), hashes("a\nb"));
        assert_eq!(hashes("a\n   \n\t\nb"), hashes("a\nb"));
        assert_eq!(hashes("\n\na\nb\n\n"), hashes("a\nb"));
        // A line that merely *starts* blank is still content.
        assert_ne!(hashes("a\n b\nc"), hashes("a\nb\nc"));
    }

    #[test]
    fn paragraph_spacing_cannot_change_the_version() {
        // The bug this fixes: identical content folding to different blank
        // counts minted distinct versions.
        assert_eq!(
            version_hash(&hashes("head\n\n\nbody")),
            version_hash(&hashes("head\nbody"))
        );
    }

    #[test]
    fn reconstruct_static_text_skips_blank_lines() {
        let prompt = "head\n\nalice\n\nbody";
        let intersection = intersect_ordered(&[&hashes(prompt), &hashes("head\n\nbob\nbody")]);
        assert_eq!(reconstruct_static_text(prompt, &intersection), "head\nbody");
    }

    #[test]
    fn full_prompt_hash_is_stable_and_content_sensitive() {
        assert_eq!(full_prompt_hash("abc"), full_prompt_hash("abc"));
        assert_ne!(full_prompt_hash("abc"), full_prompt_hash("abd"));
        assert_eq!(full_prompt_hash("abc").len(), 32);
    }

    #[test]
    fn jaccard_basic() {
        let a = line_hash_set(&hashes("a\nb\nc"));
        let b = line_hash_set(&hashes("a\nb\nd"));
        assert!((jaccard(&a, &a) - 1.0).abs() < f64::EPSILON);
        assert!((jaccard(&a, &b) - 0.5).abs() < f64::EPSILON);
        assert_eq!(jaccard(&HashSet::new(), &HashSet::new()), 0.0);
    }

    #[test]
    fn lcs_keeps_order_and_drops_divergent_lines() {
        let a = hashes("static1\ndynamic-a\nstatic2\nstatic3");
        let b = hashes("static1\ndynamic-b\nstatic2\nstatic3");
        let common = lcs(&a, &b);
        assert_eq!(common, hashes("static1\nstatic2\nstatic3"));
    }

    #[test]
    fn intersect_ordered_folds_across_many() {
        let s1 = hashes("head\nuser: alice\nbody\ntail");
        let s2 = hashes("head\nuser: bob\nbody\ntail");
        let s3 = hashes("head\nuser: carol\nbody\ntail");
        let intersection = intersect_ordered(&[&s1, &s2, &s3]);
        assert_eq!(intersection, hashes("head\nbody\ntail"));
    }

    #[test]
    fn intersect_single_sequence_is_identity() {
        let s = hashes("a\nb\nc");
        assert_eq!(intersect_ordered(&[&s]), s);
        assert!(intersect_ordered(&[]).is_empty());
    }

    #[test]
    fn version_hash_is_order_sensitive() {
        let a = hashes("one\ntwo");
        let b = hashes("two\none");
        assert_ne!(version_hash(&a), version_hash(&b));
        assert_eq!(version_hash(&a).len(), 8);
    }

    #[test]
    fn reconstruct_static_text_keeps_intersection_lines_in_order() {
        let s1 = hashes("head\nuser: alice\nbody\ntail");
        let s2 = hashes("head\nuser: bob\nbody\ntail");
        let intersection = intersect_ordered(&[&s1, &s2]);
        assert_eq!(
            reconstruct_static_text("head\nuser: alice\nbody\ntail", &intersection),
            "head\nbody\ntail"
        );
    }

    #[test]
    fn reconstruct_static_text_handles_repeated_lines() {
        // A line repeated in the prompt must consume one intersection entry
        // per occurrence, not collapse them.
        let prompt = "sep\nalice\nsep\nbody";
        let intersection = intersect_ordered(&[&hashes(prompt), &hashes("sep\nbob\nsep\nbody")]);
        assert_eq!(
            reconstruct_static_text(prompt, &intersection),
            "sep\nsep\nbody"
        );
    }

    #[test]
    fn reconstruct_static_text_empty_cases() {
        assert_eq!(reconstruct_static_text("a\nb", &[]), "");
        // Intersection lines absent from the prompt yield nothing rather than
        // fabricating text.
        assert_eq!(reconstruct_static_text("a\nb", &hashes("z")), "");
    }

    #[test]
    fn subset_check() {
        let static_lines = hashes("head\ntail");
        let prompt = line_hash_set(&hashes("head\ndynamic\ntail"));
        assert!(is_subset(&static_lines, &prompt));
        let other = line_hash_set(&hashes("head\ndynamic"));
        assert!(!is_subset(&static_lines, &other));
    }

    #[test]
    fn strict_superset_is_growth_only() {
        let base = hashes("head\ntail");
        // Grew: keeps both, adds one.
        assert!(is_strict_superset(&hashes("head\nmiddle\ntail"), &base));
        // Identical: nothing was added.
        assert!(!is_strict_superset(&hashes("head\ntail"), &base));
        // Shrank: the estimator dropped a line rather than finding a new one.
        assert!(!is_strict_superset(&hashes("head"), &base));
        // Same size, different content — a swap is not growth.
        assert!(!is_strict_superset(&hashes("head\nother"), &base));
        // Bigger, but dropped one of the base lines: not a superset.
        assert!(!is_strict_superset(&hashes("head\nx\ny"), &base));
    }

    /// The two sides are independently-ordered LCS folds, so neither line
    /// order nor a repeat may register as growth.
    #[test]
    fn strict_superset_ignores_order_and_repeats() {
        let base = hashes("head\ntail");
        assert!(!is_strict_superset(&hashes("tail\nhead"), &base));
        assert!(!is_strict_superset(&hashes("head\ntail\nhead"), &base));
        assert!(is_strict_superset(&hashes("tail\nnew\nhead"), &base));
    }
}
