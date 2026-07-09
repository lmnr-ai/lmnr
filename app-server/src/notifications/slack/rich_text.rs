//! Shared `rich_text` builders for Slack `table` cells. Table cells accept only
//! `rich_text` (no buttons/sections), so both the event-identification table and the
//! signals-report table compose their cells from these run/cell helpers.

use std::sync::LazyLock;

use regex::Regex;
use serde_json::{Value, json};

// Matches markdown link syntax `[text](url)` inside a value so it can be rebuilt as a
// Slack `rich_text` `link` element (table cells are rich_text, which does NOT render
// mrkdwn `<url|text>` syntax — the link must be a structured element).
static MARKDOWN_LINK_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\[([^\]]+)\]\(([^)\s]+)\)").unwrap());

/// A `rich_text` `text` run, optionally bold and/or italic.
pub(super) fn text_run(text: &str, bold: bool, italic: bool) -> Value {
    let mut run = json!({ "type": "text", "text": text });
    if bold || italic {
        let mut style = serde_json::Map::new();
        if bold {
            style.insert("bold".to_string(), Value::Bool(true));
        }
        if italic {
            style.insert("italic".to_string(), Value::Bool(true));
        }
        run["style"] = Value::Object(style);
    }
    run
}

/// A `rich_text` `link` run (clickable inside a table cell).
pub(super) fn link_run(url: &str, text: &str) -> Value {
    json!({ "type": "link", "url": url, "text": text })
}

/// Split a string into `rich_text` runs, converting markdown `[text](url)` links into
/// `link` runs (kept clickable) and leaving the rest as `text` runs.
pub(super) fn markdown_link_runs(text: &str) -> Vec<Value> {
    let mut runs = Vec::new();
    let mut last = 0usize;
    for caps in MARKDOWN_LINK_RE.captures_iter(text) {
        let m = caps.get(0).unwrap();
        if m.start() > last {
            runs.push(text_run(&text[last..m.start()], false, false));
        }
        runs.push(link_run(&caps[2], &caps[1]));
        last = m.end();
    }
    if last < text.len() {
        runs.push(text_run(&text[last..], false, false));
    }
    if runs.is_empty() {
        runs.push(text_run("", false, false));
    }
    runs
}

/// Wrap `rich_text` runs into a single-section `rich_text` table cell.
pub(super) fn cell(runs: Vec<Value>) -> Value {
    json!({
        "type": "rich_text",
        "elements": [{ "type": "rich_text_section", "elements": runs }]
    })
}

/// A single-run plain-text table cell.
pub(super) fn text_cell(text: &str, bold: bool, italic: bool) -> Value {
    cell(vec![text_run(text, bold, italic)])
}

/// A table cell that may carry markdown links (rebuilt as `link` runs).
pub(super) fn value_cell(text: &str) -> Value {
    cell(markdown_link_runs(text))
}
