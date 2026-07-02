use std::sync::LazyLock;

use regex::Regex;
use serde_json::json;
use uuid::Uuid;

use crate::notifications::utils::{frontend_url_slack, inject_utm_into_links, with_utm};
use crate::utils::truncate_chars;

// Matches markdown link syntax `[text](url)` inside a value so it can be rebuilt as a
// Slack `rich_text` `link` element (table cells are rich_text, which does NOT render
// mrkdwn `<url|text>` syntax — the link must be a structured element).
static MARKDOWN_LINK_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\[([^\]]+)\]\(([^)\s]+)\)").unwrap());

/// Build the `elements` of a `rich_text_section` from a value string, converting any
/// markdown `[text](url)` links into `link` elements so they stay clickable inside a
/// table cell. Non-link runs become plain `text` elements.
fn rich_text_run_elements(text: &str) -> Vec<serde_json::Value> {
    let mut elements = Vec::new();
    let mut last = 0usize;
    for caps in MARKDOWN_LINK_RE.captures_iter(text) {
        let m = caps.get(0).unwrap();
        if m.start() > last {
            elements.push(json!({ "type": "text", "text": &text[last..m.start()] }));
        }
        elements.push(json!({ "type": "link", "url": &caps[2], "text": &caps[1] }));
        last = m.end();
    }
    if last < text.len() {
        elements.push(json!({ "type": "text", "text": &text[last..] }));
    }
    if elements.is_empty() {
        elements.push(json!({ "type": "text", "text": "" }));
    }
    elements
}

/// A `rich_text` table cell whose (optionally bold) single run is plain text.
fn text_cell(text: &str, bold: bool) -> serde_json::Value {
    let mut run = json!({ "type": "text", "text": text });
    if bold {
        run["style"] = json!({ "bold": true });
    }
    json!({
        "type": "rich_text",
        "elements": [{ "type": "rich_text_section", "elements": [run] }]
    })
}

/// A `rich_text` table cell that may carry markdown links (rebuilt as `link` elements).
fn value_cell(text: &str) -> serde_json::Value {
    json!({
        "type": "rich_text",
        "elements": [{ "type": "rich_text_section", "elements": rich_text_run_elements(text) }]
    })
}

// Format Slack message blocks for an event identification notification.
//
// Layout mirrors the finalized design: a header carrying the severity, a two-column
// `table` (Field / Value) holding every payload field with the value column wrapped,
// the action buttons, and a `project · time` statline at the bottom.
pub(super) fn format_event_identification_blocks(
    project_id: &str,
    signal_id: &str,
    trace_id: &str,
    event_id: Option<&Uuid>,
    signal_name: &str,
    project_name: &str,
    extracted_information: Option<serde_json::Value>,
    severity: &u8,
    timestamp: &str,
) -> serde_json::Value {
    let base = frontend_url_slack();

    // "Open in Signals" — opens the signals page with the trace selected and, when an event id is
    // known, the event's cluster resolved and selected (the `eventCluster` param redirects to the
    // resolved `clusterId`/`emergingClusterId` while preserving `traceId`/`chat`).
    let open_in_signals_url = match event_id {
        Some(eid) => format!(
            "{}/project/{}/signals/{}?eventCluster={}&traceId={}&chat=true",
            base, project_id, signal_id, eid, trace_id
        ),
        None => format!(
            "{}/project/{}/signals/{}?traceId={}&chat=true",
            base, project_id, signal_id, trace_id
        ),
    };
    let open_in_signals_link = with_utm(
        &open_in_signals_url,
        "slack",
        "signal_alert",
        "open_in_signals",
    );
    let alert_link = with_utm(
        &format!("{}/project/{}/settings?tab=alerts", base, project_id),
        "slack",
        "signal_alert",
        "manage_alert",
    );

    let severity_label = match severity {
        0 => ":large_green_circle: Info",
        1 => ":large_orange_circle: Warning",
        2 => ":red_circle: Critical",
        _ => "Unknown",
    };

    // Title carries the severity: "<signal> - :red_circle: Critical event". Cap the signal-name
    // portion so the rendered header stays under Slack's 150-char `header` limit.
    const MAX_NAME_CHARS: usize = 100;
    let display_name = truncate_chars(signal_name, MAX_NAME_CHARS);
    let header_text = format!("{} - {} event", display_name, severity_label);

    // Every payload field becomes one Field/Value table row. Slack caps a table at 100 rows
    // (incl. the header) and truncates cell overflow, so cap the field count and each value's
    // length defensively. The value column wraps; the label column does not.
    const MAX_FIELDS: usize = 99;
    const MAX_VALUE_CHARS: usize = 2000;

    let format_value = |value: &serde_json::Value| -> String {
        match value {
            serde_json::Value::String(s) => {
                inject_utm_into_links(s, "slack", "signal_alert", "event_description")
            }
            serde_json::Value::Number(n) => n.to_string(),
            serde_json::Value::Bool(b) => b.to_string(),
            serde_json::Value::Null => "—".to_string(),
            _ => inject_utm_into_links(
                &serde_json::to_string_pretty(value).unwrap_or_default(),
                "slack",
                "signal_alert",
                "event_description",
            ),
        }
    };

    // Header row (Slack styles the first table row as a header regardless, so label it).
    let mut rows: Vec<serde_json::Value> =
        vec![json!([text_cell("Field", true), text_cell("Value", true)])];
    if let Some(info) = extracted_information {
        if let Some(obj) = info.as_object() {
            for (key, value) in obj.iter().take(MAX_FIELDS) {
                let formatted = truncate_chars(&format_value(value), MAX_VALUE_CHARS);
                rows.push(json!([text_cell(key, true), value_cell(&formatted)]));
            }
        } else {
            let formatted = truncate_chars(
                &serde_json::to_string_pretty(&info).unwrap_or_default(),
                MAX_VALUE_CHARS,
            );
            rows.push(json!([text_cell("Details", true), value_cell(&formatted)]));
        }
    }

    let mut blocks = vec![json!({
        "type": "header",
        "text": { "type": "plain_text", "text": header_text, "emoji": true }
    })];

    // Only render the table when there is at least one data row (the header row alone is noise).
    if rows.len() > 1 {
        blocks.push(json!({
            "type": "table",
            "column_settings": [{ "is_wrapped": false }, { "is_wrapped": true }],
            "rows": rows
        }));
    }

    blocks.push(json!({
        "type": "actions",
        "elements": [
            {
                "type": "button",
                "text": { "type": "plain_text", "text": "Open in Signals", "emoji": true },
                "url": open_in_signals_link,
                "action_id": "open_in_signals",
                "style": "primary"
            },
            {
                "type": "button",
                "text": { "type": "plain_text", "text": "Manage Alert", "emoji": true },
                "url": alert_link,
                "action_id": "manage_alert"
            }
        ]
    }));

    // Statline at the bottom: "*Project* · <time>" (project name omitted when unknown).
    let statline = if project_name.is_empty() {
        timestamp.to_string()
    } else {
        format!("*{}* · {}", project_name, timestamp)
    };
    blocks.push(json!({
        "type": "context",
        "elements": [{ "type": "mrkdwn", "text": statline }]
    }));

    json!(blocks)
}
