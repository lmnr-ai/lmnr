//! An agent prompt as one document: the system prompt's lines followed by the
//! tool set's lines, each hashed after masking dates and times so a clock
//! ticking inside the prompt is not a change.

use std::{collections::HashSet, sync::LazyLock};

use regex::Regex;

use crate::traces::sp_versioning::similarity::hashable_lines;

const MASK: &str = "<datetime>";

const MONTH: &str = r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";

static DATETIME: LazyLock<Regex> = LazyLock::new(|| {
    let patterns: [&str; 7] = [
        // ISO 8601 date with optional time and zone.
        r"\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?",
        r"\b\d{1,2}/\d{1,2}/\d{2,4}\b|\b\d{4}/\d{1,2}/\d{1,2}\b|\b\d{1,2}\.\d{1,2}\.\d{4}\b",
        r"\b\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:\s?[AaPp]\.?[Mm]\.?)?",
        // Unix epoch seconds or milliseconds.
        r"\b1\d{9}(?:\d{3})?\b",
        &format!(r"\b{MONTH}\.?\s+\d{{1,2}}(?:st|nd|rd|th)?\b(?:,?\s+\d{{4}}\b)?"),
        &format!(r"\b\d{{1,2}}(?:st|nd|rd|th)?\s+{MONTH}\b(?:,?\s+\d{{4}}\b)?"),
        // Full names only: abbreviations collide with ordinary words.
        r"\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|April|June|July|September|October|November|December)\b",
    ];
    Regex::new(&patterns.join("|")).unwrap()
});

pub fn mask(line: &str) -> std::borrow::Cow<'_, str> {
    DATETIME.replace_all(line, MASK)
}

pub fn line_hash(line: &str) -> u64 {
    let hash = blake3::hash(mask(line).as_bytes());
    u64::from_le_bytes(hash.as_bytes()[..8].try_into().unwrap())
}

/// The document's lines in order; tool text is `tool_text::render` output.
pub fn doc_lines<'a>(system_prompt: &'a str, tool_text: &'a str) -> impl Iterator<Item = &'a str> {
    hashable_lines(system_prompt).chain(hashable_lines(tool_text))
}

/// One part of the document cut down to its lines in `core` (sorted), in order,
/// each line once.
pub fn core_text(text: &str, core: &[u64]) -> String {
    let mut seen = HashSet::new();
    hashable_lines(text)
        .filter(|line| {
            let hash = line_hash(line);
            core.binary_search(&hash).is_ok() && seen.insert(hash)
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// The document's line hashes as a sorted set.
pub fn line_set(system_prompt: &str, tool_text: &str) -> Vec<u64> {
    let mut lines: Vec<u64> = doc_lines(system_prompt, tool_text).map(line_hash).collect();
    lines.sort_unstable();
    lines.dedup();
    lines
}

/// Identifies a version across the project: the agent plus its core line set.
pub fn version_hash(agent_hash: &str, core: &[u64]) -> String {
    let mut hasher = blake3::Hasher::new();
    hasher.update(agent_hash.as_bytes());
    for line in core {
        hasher.update(&line.to_le_bytes());
    }
    hex::encode(&hasher.finalize().as_bytes()[..16])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn core_text_keeps_core_lines_in_order_once() {
        let text = "Be brief.\n\nToday is 2026-10-23.\nUser: Ada\nBe brief.\nEnd.";
        let mut core: Vec<u64> = ["End.", "Today is 2030-01-01.", "Be brief."]
            .iter()
            .map(|line| line_hash(line))
            .collect();
        core.sort_unstable();
        assert_eq!(
            core_text(text, &core),
            "Be brief.\nToday is 2026-10-23.\nEnd."
        );
    }

    #[test]
    fn masks_dates_and_times_only() {
        for (raw, masked) in [
            ("Today is 2026-10-23.", "Today is <datetime>."),
            ("Now: 2026-10-23T09:15:00Z", "Now: <datetime>"),
            (
                "It is 9:15 PM on 10/23/2026",
                "It is <datetime> on <datetime>",
            ),
            (
                "Date: Friday, October 23, 2026",
                "Date: <datetime>, <datetime>",
            ),
            (
                "Use at most 2000 tokens with lmnr 1.2.30",
                "Use at most 2000 tokens with lmnr 1.2.30",
            ),
            ("ts=1761210900", "ts=<datetime>"),
            ("Return at most 5 items.", "Return at most 5 items."),
            ("You may use 3 tools.", "You may use 3 tools."),
        ] {
            assert_eq!(mask(raw), masked, "{raw}");
        }
    }

    #[test]
    fn a_new_day_keeps_the_line_hash() {
        assert_eq!(
            line_hash("Current date: Thursday 2026-10-22"),
            line_hash("Current date: Friday 2026-10-23")
        );
        assert_ne!(line_hash("max 5 items"), line_hash("max 10 items"));
    }

    #[test]
    fn line_set_spans_prompt_and_tools() {
        let lines = line_set("a\n\nb\na", "search: find things");
        assert_eq!(lines.len(), 3);
        assert!(lines.windows(2).all(|w| w[0] < w[1]));
    }
}
