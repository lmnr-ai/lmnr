use serde_json::json;
use uuid::Uuid;

use super::{md_links_to_slack, truncate_to_slack_section_limit};
use crate::notifications::utils::{frontend_url_slack, inject_utm_into_links, with_utm};
use crate::utils::truncate_chars;

// Format Slack message blocks for an event identification notification.
pub(super) fn format_event_identification_blocks(
    project_id: &str,
    signal_id: &str,
    trace_id: &str,
    event_id: Option<&Uuid>,
    signal_name: &str,
    extracted_information: Option<serde_json::Value>,
    severity: &u8,
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

    // Render each user-defined payload field into one of two zones: short scalar values flow into a
    // two-column `fields` grid (label left, value right); long or structured values become
    // full-width lines above the grid. Keys are entirely user-configured, so this routing is what
    // keeps any payload readable.
    const SHORT_VALUE_CHARS: usize = 45;
    const MAX_GRID_FIELDS: usize = 10; // 5 rows; Slack caps `fields` at 10.

    let format_value = |value: &serde_json::Value| -> String {
        match value {
            serde_json::Value::String(s) => md_links_to_slack(&inject_utm_into_links(
                s,
                "slack",
                "signal_alert",
                "event_description",
            )),
            serde_json::Value::Number(n) => n.to_string(),
            serde_json::Value::Bool(b) => b.to_string(),
            serde_json::Value::Null => String::new(),
            _ => inject_utm_into_links(
                &serde_json::to_string_pretty(value).unwrap_or_default(),
                "slack",
                "signal_alert",
                "event_description",
            ),
        }
    };

    let mut long_lines: Vec<String> = Vec::new();
    let mut grid_fields: Vec<serde_json::Value> = Vec::new();
    if let Some(info) = extracted_information {
        if let Some(obj) = info.as_object() {
            for (key, value) in obj {
                let formatted = format_value(value);
                let is_scalar = matches!(
                    value,
                    serde_json::Value::String(_)
                        | serde_json::Value::Number(_)
                        | serde_json::Value::Bool(_)
                );
                let is_short = is_scalar
                    && formatted.chars().count() <= SHORT_VALUE_CHARS
                    && !formatted.contains('\n');
                if is_short && grid_fields.len() < MAX_GRID_FIELDS {
                    let value_text = if formatted.is_empty() {
                        "—".to_string()
                    } else {
                        formatted
                    };
                    grid_fields.push(json!({ "type": "mrkdwn", "text": format!("*{}*", key) }));
                    grid_fields.push(json!({ "type": "mrkdwn", "text": value_text }));
                } else {
                    long_lines.push(format!("*{}*\n{}", key, formatted));
                }
            }
        } else {
            long_lines.push(serde_json::to_string_pretty(&info).unwrap_or_default());
        }
    }

    let mut blocks = vec![json!({
        "type": "header",
        "text": { "type": "plain_text", "text": header_text, "emoji": true }
    })];

    if !long_lines.is_empty() {
        let combined = long_lines.join("\n\n");
        let truncated = truncate_to_slack_section_limit(&combined);
        blocks.push(json!({
            "type": "section",
            "text": { "type": "mrkdwn", "text": truncated }
        }));
    }
    if !grid_fields.is_empty() {
        blocks.push(json!({ "type": "section", "fields": grid_fields }));
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
    blocks.push(json!({"type": "divider"}));

    json!(blocks)
}
