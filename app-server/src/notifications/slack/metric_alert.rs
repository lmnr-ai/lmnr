//! Slack layout of a metric alert. The message that opens an incident's
//! thread carries a header and the project; replies lead with what changed.

use serde_json::{Value, json};

use super::{report::escape_mrkdwn, truncate_to_slack_section_limit};
use crate::metric_alerts::engine::Level;
use crate::notifications::MetricAlertNotification;
use crate::notifications::utils::{frontend_url_slack, with_utm};
use crate::utils::truncate_chars;

const CAMPAIGN: &str = "metric_alert";
// Slack caps a `header` at 150 characters and a section at 10 fields.
const MAX_HEADER_CHARS: usize = 150;
const MAX_SUBJECT_CHARS: usize = 100;
const MAX_FIELDS: usize = 10;

fn level_emoji(level: Level) -> &'static str {
    match level {
        Level::Critical => ":red_circle:",
        Level::Warning => ":large_orange_circle:",
        Level::Ok => ":large_green_circle:",
    }
}

fn title(alert: &MetricAlertNotification) -> String {
    format!(
        "{}: {}",
        alert.headline,
        truncate_chars(&alert.subject(), MAX_SUBJECT_CHARS)
    )
}

/// What Slack shows in notifications, where blocks are not rendered.
pub fn fallback_text(alert: &MetricAlertNotification) -> String {
    title(alert)
}

fn section(text: &str) -> Value {
    json!({
        "type": "section",
        "text": { "type": "mrkdwn", "text": truncate_to_slack_section_limit(text) }
    })
}

fn details(alert: &MetricAlertNotification) -> Option<Value> {
    let fields: Vec<Value> = alert
        .details
        .iter()
        .take(MAX_FIELDS)
        .map(|detail| {
            let text = format!(
                "*{}*\n{}",
                escape_mrkdwn(&detail.label),
                escape_mrkdwn(&detail.value)
            );
            json!({ "type": "mrkdwn", "text": text })
        })
        .collect();
    (!fields.is_empty()).then(|| json!({ "type": "section", "fields": fields }))
}

fn link(path: &str, content: &str) -> String {
    with_utm(
        &format!("{}{}", frontend_url_slack(), path),
        "slack",
        CAMPAIGN,
        content,
    )
}

fn actions(alert: &MetricAlertNotification) -> Value {
    json!({
        "type": "actions",
        "elements": [
            {
                "type": "button",
                "text": { "type": "plain_text", "text": "Open traces", "emoji": true },
                "url": link(&alert.traces_path, "open_traces"),
                "action_id": "open_traces",
                "style": "primary"
            },
            {
                "type": "button",
                "text": { "type": "plain_text", "text": "Open alert", "emoji": true },
                "url": link(&alert.alert_path, "open_alert"),
                "action_id": "open_alert"
            }
        ]
    })
}

/// The message that starts an incident's thread in a channel.
pub fn message_blocks(alert: &MetricAlertNotification) -> Value {
    let header = truncate_chars(
        &format!("{} {}", level_emoji(alert.level), title(alert)),
        MAX_HEADER_CHARS,
    );
    let statline = format!(
        "*{}* · {}",
        escape_mrkdwn(&alert.project_name),
        alert.checked_at
    );

    let mut blocks = vec![
        json!({
            "type": "header",
            "text": { "type": "plain_text", "text": header, "emoji": true }
        }),
        section(&escape_mrkdwn(&alert.summary)),
    ];
    blocks.extend(details(alert));
    blocks.push(actions(alert));
    blocks.push(json!({
        "type": "context",
        "elements": [{ "type": "mrkdwn", "text": statline }]
    }));

    json!(blocks)
}

/// A later transition or a reminder, posted in the incident's thread.
pub fn reply_blocks(alert: &MetricAlertNotification) -> Value {
    let text = format!(
        "{} *{}*\n{}",
        level_emoji(alert.level),
        escape_mrkdwn(&alert.headline),
        escape_mrkdwn(&alert.summary)
    );

    let mut blocks = vec![section(&text)];
    blocks.extend(details(alert));
    blocks.push(actions(alert));

    json!(blocks)
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::*;
    use crate::metric_alerts::engine::TransitionKind;
    use crate::notifications::MetricAlertDetail;

    fn alert(transition: TransitionKind, level: Level, headline: &str) -> MetricAlertNotification {
        MetricAlertNotification {
            project_id: Uuid::from_u128(1),
            project_name: "prod".to_string(),
            alert_id: Uuid::from_u128(2),
            alert_name: "Cost spike".to_string(),
            incident_id: Uuid::from_u128(3),
            transition,
            level,
            group: Some("gpt-4o".to_string()),
            headline: headline.to_string(),
            summary: "Total cost for gpt-4o over the last hour is $2.41. That is above the warning threshold of $2.00.".to_string(),
            details: vec![
                MetricAlertDetail {
                    label: "Value".to_string(),
                    value: "$2.41".to_string(),
                },
                MetricAlertDetail {
                    label: "Model".to_string(),
                    value: "<gpt&4o>".to_string(),
                },
            ],
            traces_path: "/project/p/traces?sortBy=cost".to_string(),
            alert_path: "/project/p/settings/alerts/a".to_string(),
            checked_at: "Nov 25, 2026 at 7:35 PM UTC".to_string(),
        }
    }

    #[test]
    fn opening_message_has_header_details_links_and_statline() {
        let opened = alert(TransitionKind::Opened, Level::Warning, "Warning");
        let blocks = message_blocks(&opened);
        let blocks = blocks.as_array().unwrap();

        assert_eq!(blocks[0]["type"], "header");
        assert_eq!(
            blocks[0]["text"]["text"],
            ":large_orange_circle: Warning: Cost spike (gpt-4o)"
        );
        assert!(
            blocks[1]["text"]["text"]
                .as_str()
                .unwrap()
                .contains("above the warning threshold of $2.00")
        );
        assert_eq!(blocks[2]["fields"][0]["text"], "*Value*\n$2.41");
        assert_eq!(
            blocks[2]["fields"][1]["text"],
            "*Model*\n&lt;gpt&amp;4o&gt;"
        );

        let buttons = blocks[3]["elements"].as_array().unwrap();
        assert_eq!(buttons[0]["text"]["text"], "Open traces");
        let traces_url = buttons[0]["url"].as_str().unwrap();
        assert!(traces_url.contains("/project/p/traces?sortBy=cost&utm_source=slack"));
        assert_eq!(buttons[1]["text"]["text"], "Open alert");
        assert!(
            buttons[1]["url"]
                .as_str()
                .unwrap()
                .contains("/project/p/settings/alerts/a?utm_source=slack")
        );
        assert_eq!(
            blocks[4]["elements"][0]["text"],
            "*prod* · Nov 25, 2026 at 7:35 PM UTC"
        );
    }

    #[test]
    fn reply_leads_with_what_changed() {
        let resolved = alert(TransitionKind::Resolved, Level::Ok, "Resolved");
        let blocks = reply_blocks(&resolved);
        let blocks = blocks.as_array().unwrap();

        assert!(blocks.iter().all(|block| block["type"] != "header"));
        assert!(
            blocks[0]["text"]["text"]
                .as_str()
                .unwrap()
                .starts_with(":large_green_circle: *Resolved*\n")
        );
        assert_eq!(blocks.last().unwrap()["type"], "actions");
    }

    #[test]
    fn long_names_fit_the_header() {
        let mut opened = alert(TransitionKind::Opened, Level::Critical, "Critical");
        opened.alert_name = "x".repeat(400);
        let blocks = message_blocks(&opened);
        let header = blocks[0]["text"]["text"].as_str().unwrap();
        assert!(header.chars().count() <= 150);
        assert_eq!(fallback_text(&opened), header[":red_circle: ".len()..]);

        // The longest emoji and headline together.
        let mut reminder = alert(
            TransitionKind::Reminder,
            Level::Warning,
            "Still approaching spending limit",
        );
        reminder.alert_name = "x".repeat(400);
        let blocks = message_blocks(&reminder);
        let header = blocks[0]["text"]["text"].as_str().unwrap();
        assert_eq!(header.chars().count(), 150);
    }
}
