//! One agent call as a set of lines: the system prompt and the tool set
//! rendered into a single document, so one deploy that touches both is one
//! change, and each line hashed after masking the values that differ per
//! call (numbers, ids, dates, day and month names).
//!
//! Ingestion stores each call as the hashes of its lines in document order,
//! plus the text of each hash once per agent, so a version's lines can be
//! shown as text.

use std::sync::LazyLock;

use regex::Regex;
use serde_json::Value;

use crate::traces::{
    dedup::tool_normalize::{normalize_tools, tool_name},
    prompt_hash::strip_claude_code_billing_header,
};

/// Lines past this are ignored, bounding the work per call. An edit beyond it
/// is invisible to versioning.
pub const MAX_LINES: usize = 4096;

/// Sorted, deduplicated line hashes.
pub type LineSet = Vec<u64>;

/// Any word containing a digit: numbers, dates, times, ids, uuids, versions.
static DIGIT_WORD: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\w*\d\w*").unwrap());

static DAY_OR_MONTH: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r"(?i)\b(?:",
        r"jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|",
        r"sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|",
        r"mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|",
        r"sat(?:urday)?|sun(?:day)?",
        r")\b",
    ))
    .unwrap()
});

static WHITESPACE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\s+").unwrap());

/// The display lines of one call from its two halves, which ingestion
/// computes at different points: system prompt lines first, then one line per
/// tool leaf prefixed with `tools.<name>.<path>`. Blank lines are dropped.
pub fn join(mut prompt_lines: Vec<String>, tool_lines: Vec<String>) -> Vec<String> {
    prompt_lines.extend(tool_lines);
    prompt_lines.truncate(MAX_LINES);
    prompt_lines
}

pub fn prompt_lines(system_prompt: &str) -> Vec<String> {
    let system_prompt = strip_claude_code_billing_header(system_prompt);
    split_prose(&system_prompt)
        .into_iter()
        .map(str::to_string)
        .collect()
}

pub fn tool_lines(tools: &[Value]) -> Vec<String> {
    let mut lines = Vec::new();
    for tool in normalize_tools(tools) {
        let path = format!("tools.{}", tool_name(&tool));
        // A bare-name tool still contributes a line, so adding or removing
        // any tool changes the document.
        lines.push(path.clone());
        match &tool {
            Value::Object(map) => {
                for (key, value) in map {
                    if key != "name" {
                        flatten(&format!("{path}.{key}"), value, &mut lines);
                    }
                }
            }
            other => flatten(&path, other, &mut lines),
        }
        if lines.len() >= MAX_LINES {
            break;
        }
    }
    lines
}

/// The line as versioning sees it: per-call values masked, whitespace
/// collapsed.
pub fn mask(line: &str) -> String {
    let line = DIGIT_WORD.replace_all(line, "#");
    let line = DAY_OR_MONTH.replace_all(&line, "@");
    WHITESPACE.replace_all(line.trim(), " ").into_owned()
}

pub fn line_hash(line: &str) -> u64 {
    let digest = blake3::hash(mask(line).as_bytes());
    u64::from_le_bytes(digest.as_bytes()[..8].try_into().unwrap())
}

#[cfg(test)]
pub fn render(system_prompt: &str, tools: &[Value]) -> Vec<String> {
    join(prompt_lines(system_prompt), tool_lines(tools))
}

#[cfg(test)]
pub fn line_set(lines: &[String]) -> LineSet {
    let mut set: LineSet = lines.iter().map(|line| line_hash(line)).collect();
    set.sort_unstable();
    set.dedup();
    set
}

fn flatten(path: &str, value: &Value, out: &mut Vec<String>) {
    match value {
        Value::Object(map) if map.is_empty() => out.push(format!("{path} = {{}}")),
        Value::Object(map) => {
            for (key, value) in map {
                flatten(&format!("{path}.{key}"), value, out);
            }
        }
        Value::Array(items) if items.is_empty() => out.push(format!("{path} = []")),
        // Enum values, `required` lists: one line per member, so adding a
        // value keeps every existing line.
        Value::Array(items) if items.iter().all(is_primitive) => {
            for item in items {
                out.push(format!("{path}[] = {item}"));
            }
        }
        Value::Array(items) => {
            for (i, item) in items.iter().enumerate() {
                flatten(&format!("{path}[{i}]"), item, out);
            }
        }
        Value::String(text) => {
            let parts = split_prose(text);
            if parts.is_empty() {
                out.push(format!("{path}: \"\""));
            }
            for part in parts {
                out.push(format!("{path}: {part}"));
            }
        }
        other => out.push(format!("{path} = {other}")),
    }
}

fn is_primitive(value: &Value) -> bool {
    !matches!(value, Value::Object(_) | Value::Array(_))
}

/// Splits at line breaks, and after sentence punctuation followed by
/// whitespace and a likely sentence start, so a value injected into one
/// sentence keeps the rest of its paragraph stable. The lookahead keeps
/// `e.g. foo` and `v1.2` whole; colons never split. Parts are trimmed and
/// blank ones dropped.
fn split_prose(text: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    for line in text.split('\n') {
        let chars: Vec<(usize, char)> = line.char_indices().collect();
        let mut start = 0;
        let mut i = 0;
        while i < chars.len() {
            let (at, c) = chars[i];
            if matches!(c, '.' | ';' | '!' | '?') {
                let mut next = i + 1;
                while next < chars.len() && chars[next].1.is_whitespace() {
                    next += 1;
                }
                if next > i + 1 && next < chars.len() && starts_sentence(chars[next].1) {
                    parts.push(&line[start..at + c.len_utf8()]);
                    start = chars[next].0;
                    i = next;
                    continue;
                }
            }
            i += 1;
        }
        parts.push(&line[start..]);
    }
    parts
        .into_iter()
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect()
}

fn starts_sentence(c: char) -> bool {
    c.is_ascii_uppercase() || matches!(c, '`' | '\'' | '"' | '(' | '-' | '*')
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn masks_numbers_ids_dates_and_day_names() {
        assert_eq!(
            mask("Today is Tuesday, October 21, 2026 at 10:15 (req a3f9-77b2)."),
            mask("Today is Monday, March 3, 2025 at 09:00 (req 00ff-1234)."),
        );
        assert_eq!(mask("  Be   concise. "), "Be concise.");
        assert_ne!(line_hash("Be concise."), line_hash("Be brief."));
    }

    #[test]
    fn renders_prompt_sentences_then_tool_leaves() {
        let lines = render(
            "You are a helpful agent. Be concise.\n\nToday is 2026-10-22.",
            &[json!({
                "type": "function",
                "function": {
                    "name": "search",
                    "description": "Search the web.",
                    "parameters": {"type": "object", "required": ["q"]},
                },
            })],
        );
        assert_eq!(
            lines,
            vec![
                "You are a helpful agent.",
                "Be concise.",
                "Today is 2026-10-22.",
                "tools.search",
                "tools.search.description: Search the web.",
                "tools.search.input_schema.required[] = \"q\"",
                "tools.search.input_schema.type: object",
            ]
        );
    }

    #[test]
    fn line_set_is_sorted_and_deduplicated() {
        let set = line_set(&["Day 1.".into(), "Day 2.".into(), "Other.".into()]);
        assert_eq!(set.len(), 2);
        assert!(set.windows(2).all(|pair| pair[0] < pair[1]));
    }
}
