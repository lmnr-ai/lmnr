//! An agent prompt as one document: the system prompt's lines followed by the
//! tool set's lines, each hashed after masking dates, times and ids, so a
//! clock ticking or a per-user id inside the prompt is not a change.

use std::{borrow::Cow, collections::HashSet, sync::LazyLock};

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

const ID_MASK: &str = "<id>";

/// UUIDs and long hex strings (object ids, digests) anywhere in a line.
static ID: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|\b[0-9a-f]{24,}\b",
    )
    .unwrap()
});

/// A value with a digit after an id-named key (`id`, `user_id`, `project-id`,
/// `projectId`, `ORG_ID`): short numeric ids are only ids by their key, as a
/// bare number may be a limit. The digit keeps `user_id: string` in tools.
static ID_VALUE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r#"(\b(?:[\w-]*[_-](?:id|Id|ID)|[a-z][A-Za-z0-9]*Id|id|Id|ID)\b["']?\s*[:=]\s*["']?)[^\s"',;)}\]]*\d[^\s"',;)}\]]*"#,
    )
    .unwrap()
});

pub fn mask(line: &str) -> Cow<'_, str> {
    // Ids first: an epoch-like id would otherwise become `<datetime>`.
    let line = ID.replace_all(line, ID_MASK);
    let line = replace(line, &ID_VALUE, "${1}<id>");
    replace(line, &DATETIME, MASK)
}

fn replace<'a>(line: Cow<'a, str>, regex: &Regex, replacement: &str) -> Cow<'a, str> {
    if !regex.is_match(&line) {
        return line;
    }
    Cow::Owned(regex.replace_all(&line, replacement).into_owned())
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
    fn masks_ids() {
        for (raw, masked) in [
            ("project_id=123", "project_id=<id>"),
            (
                "Project: 3f2b9c1e-8a4d-4e6f-9b0a-1c2d3e4f5a6b",
                "Project: <id>",
            ),
            (
                r#"{"userId": "u_42", "name": "Ada"}"#,
                r#"{"userId": "<id>", "name": "Ada"}"#,
            ),
            ("ORG_ID: 7, session-id=s9x", "ORG_ID: <id>, session-id=<id>"),
            (
                "id: 99 and ref 65f1a2b3c4d5e6f7a8b9c0d1",
                "id: <id> and ref <id>",
            ),
            // Not ids: no id key, no digit, or a short bare number.
            ("Return at most 5 items.", "Return at most 5 items."),
            ("valid: 10 retries", "valid: 10 retries"),
            ("get_user.user_id: string", "get_user.user_id: string"),
            ("Use the deadbeef cache", "Use the deadbeef cache"),
        ] {
            assert_eq!(mask(raw), masked, "{raw}");
        }
    }

    #[test]
    fn a_new_user_keeps_the_line_hash() {
        assert_eq!(
            line_hash("You are helping project_id=123."),
            line_hash("You are helping project_id=456.")
        );
        assert_eq!(line_hash("user_id=42"), line_hash("user_id=1761210900"));
        assert_eq!(
            mask("user_id=1761210900, ts=1761210900"),
            "user_id=<id>, ts=<datetime>"
        );
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
