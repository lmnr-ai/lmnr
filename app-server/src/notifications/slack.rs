use std::sync::LazyLock;

use anyhow::Result;
use regex::Regex;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sodiumoxide::{
    crypto::aead::xchacha20poly1305_ietf::{Key, Nonce, open},
    hex,
};

use super::NotificationKind;
use crate::reports::email_template::ReportData;

const SLACK_API_BASE: &str = "https://slack.com/api";

#[derive(Debug, Deserialize, Serialize)]
struct SlackApiResponse {
    ok: bool,
    #[serde(default)]
    error: Option<String>,
}

pub fn decode_slack_token(
    team_id: &str,
    nonce_hex: &str,
    encrypted_value: &str,
) -> anyhow::Result<String> {
    let key_hex = std::env::var("SLACK_ENCRYPTION_KEY")
        .map_err(|_| anyhow::anyhow!("SLACK_ENCRYPTION_KEY environment variable is not set"))?;

    let key = Key::from_slice(
        hex::decode(key_hex)
            .map_err(|e| anyhow::anyhow!("Failed to decode SLACK_ENCRYPTION_KEY hex: {:?}", e))?
            .as_slice(),
    )
    .ok_or_else(|| anyhow::anyhow!("Invalid SLACK_ENCRYPTION_KEY"))?;

    let nonce_bytes = hex::decode(nonce_hex)
        .map_err(|e| anyhow::anyhow!("Failed to decode nonce hex: {:?}", e))?;
    let nonce = Nonce::from_slice(&nonce_bytes).ok_or_else(|| anyhow::anyhow!("Invalid nonce"))?;

    let encrypted_bytes = hex::decode(encrypted_value)
        .map_err(|e| anyhow::anyhow!("Failed to decode encrypted value hex: {:?}", e))?;

    let decrypted = open(&encrypted_bytes, Some(team_id.as_bytes()), &nonce, &key)
        .map_err(|_| anyhow::anyhow!("Failed to decrypt Slack token"))?;

    String::from_utf8(decrypted)
        .map_err(|e| anyhow::anyhow!("Failed to convert decrypted bytes to string: {}", e))
}

/// Convert standard markdown links `[text](url)` to Slack mrkdwn `<url|text>`.
fn md_links_to_slack(text: &str) -> String {
    static RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\[([^\]]+)\]\(([^)]+)\)").unwrap());
    RE.replace_all(text, "<$2|$1>").into_owned()
}

fn format_event_identification_blocks(
    project_id: &str,
    trace_id: &str,
    event_name: &str,
    extracted_information: Option<serde_json::Value>,
) -> serde_json::Value {
    let trace_link = format!(
        "https://lmnr.ai/project/{}/traces/{}?chat=true",
        project_id, trace_id
    );

    let info_entries: Vec<String> = if let Some(info) = extracted_information {
        if let Some(obj) = info.as_object() {
            obj.iter()
                .map(|(key, value)| {
                    let formatted_value = match value {
                        serde_json::Value::String(s) => md_links_to_slack(s),
                        serde_json::Value::Number(n) => n.to_string(),
                        serde_json::Value::Bool(b) => b.to_string(),
                        serde_json::Value::Null => String::new(),
                        _ => serde_json::to_string_pretty(value).unwrap_or_default(),
                    };
                    format!("_{}_:\n{}", key, formatted_value)
                })
                .collect()
        } else {
            vec![serde_json::to_string_pretty(&info).unwrap_or_default()]
        }
    } else {
        vec![]
    };

    if !info_entries.is_empty() {
        const MAX_SECTION_TEXT_LEN: usize = 3000;
        let mut combined = String::new();
        for entry in &info_entries {
            if combined.len() + entry.len() + 2 > MAX_SECTION_TEXT_LEN {
                break;
            }
            if !combined.is_empty() {
                combined.push_str("\n\n");
            }
            combined.push_str(entry);
        }
        let mut blocks = vec![
            json!({
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": format!("*Event*: `{}`", event_name)
                }
            }),
            json!({
                "type": "section",
                "text": { "type": "mrkdwn", "text": combined }
            }),
        ];
        blocks.push(json!({
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": {
                        "type": "plain_text",
                        "text": "View Trace",
                        "emoji": true
                    },
                    "url": trace_link,
                    "action_id": "view_trace"
                }
            ]
        }));
        blocks.push(json!({"type": "divider"}));
        return json!(blocks);
    }

    json!([
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": format!("✅ *Event Detected: {}*", event_name)
            }
        },
        {
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": {
                        "type": "plain_text",
                        "text": "View Trace",
                        "emoji": true
                    },
                    "url": trace_link,
                    "action_id": "view_trace"
                }
            ]
        },
        {"type": "divider"}
    ])
}

fn format_report_blocks(title: &str, report: &ReportData) -> serde_json::Value {
    let project_count = report.projects.len();

    let overview = format!(
        "{} – {}\n{} event{} across {} project{}",
        report.period_start,
        report.period_end,
        report.total_events,
        if report.total_events == 1 { "" } else { "s" },
        project_count,
        if project_count == 1 { "" } else { "s" },
    );

    let mut blocks = vec![
        json!({
            "type": "section",
            "text": { "type": "mrkdwn", "text": format!(":bar_chart: *{}*", title) }
        }),
        json!({
            "type": "section",
            "text": { "type": "mrkdwn", "text": overview }
        }),
    ];

    const MAX_SECTION_TEXT_LEN: usize = 3000;

    for project in &report.projects {
        let mut text = String::new();

        let project_total: u64 = project.signal_event_counts.values().sum();
        text.push_str(&format!("\nTotal events: *{}*\n", project_total));
        for (name, count) in &project.signal_event_counts {
            text.push_str(&format!("• {}: *{}*\n", name, count));
        }

        if !project.ai_summary.is_empty() {
            text.push_str(&format!("\n\nSummary: _{}_\n", project.ai_summary));
        }

        if !project.noteworthy_events.is_empty() {
            text.push_str("\nNoteworthy Events:\n");
            for event in &project.noteworthy_events {
                let entry = format!(
                    "• `{}` – {} ({}) <https://lmnr.ai/project/{}/traces/{}?chat=true|View trace>\n",
                    event.signal_name,
                    event.summary,
                    event.timestamp,
                    project.project_id,
                    event.trace_id,
                );
                if text.len() + entry.len() > MAX_SECTION_TEXT_LEN {
                    break;
                }
                text.push_str(&entry);
            }
        }

        blocks.push(json!({"type": "divider"}));
        blocks.push(json!({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": format!(":small_orange_diamond: *{}*", project.project_name)
            }
        }));
        blocks.push(json!({
            "type": "section",
            "text": { "type": "mrkdwn", "text": text }
        }));
    }

    json!(blocks)
}

/// Format Slack message blocks for a batch of notifications.
///
/// For single-element batches, renders the notification directly.
/// For multi-element batches (e.g. reports with per-project data),
/// combines all entries into a single Slack message.
pub fn format_message_blocks_batch(notifications: &[NotificationKind]) -> serde_json::Value {
    if notifications.len() == 1 {
        return format_message_blocks_single(&notifications[0]);
    }

    // Multi-notification batch. Currently only reports produce multi-element
    // batches, so we merge project data into a single report block set.
    let mut combined_report_data: Option<ReportData> = None;
    let mut title = String::new();

    for kind in notifications {
        if let NotificationKind::SignalsReport {
            report_data,
            title: t,
        } = kind
        {
            match combined_report_data.as_mut() {
                None => {
                    combined_report_data = Some(report_data.clone());
                    title = t.clone();
                }
                Some(existing) => {
                    existing.projects.extend(report_data.projects.clone());
                    existing.total_events += report_data.total_events;
                }
            }
        }
    }

    if let Some(report_data) = combined_report_data {
        return format_report_blocks(&title, &report_data);
    }

    // Fallback: render only the first notification.
    format_message_blocks_single(&notifications[0])
}

/// Format Slack message blocks from a single `NotificationKind`.
fn format_message_blocks_single(kind: &NotificationKind) -> serde_json::Value {
    match kind {
        NotificationKind::EventIdentification {
            project_id,
            trace_id,
            event_name,
            extracted_information,
        } => format_event_identification_blocks(
            &project_id.to_string(),
            &trace_id.to_string(),
            event_name,
            extracted_information.clone(),
        ),
        NotificationKind::SignalsReport { report_data, title } => {
            format_report_blocks(title, report_data)
        }
        NotificationKind::UsageWarning {
            workspace_name,
            usage_label,
            formatted_limit,
            ..
        } => {
            json!([
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": format!(
                            ":warning: *Usage Warning*\n{} has reached *{}* of {}.",
                            workspace_name, formatted_limit, usage_label
                        )
                    }
                },
                {"type": "divider"}
            ])
        }
    }
}

pub async fn send_message(
    slack_client: &Client,
    token: &str,
    channel_id: &str,
    blocks: serde_json::Value,
) -> Result<()> {
    let body = json!({
        "channel": channel_id,
        "blocks": blocks,
        "unfurl_links": false,
        "unfurl_media": false
    });

    let response = slack_client
        .post(format!("{}/chat.postMessage", SLACK_API_BASE))
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await?;
    let status = response.status();
    let body = response.text().await?;

    if !status.is_success() {
        return Err(anyhow::anyhow!(
            "Failed to send Slack message. HTTP Status: {}, Response: {}",
            status,
            body
        ));
    }

    let slack_response: SlackApiResponse = serde_json::from_str(&body).map_err(|e| {
        anyhow::anyhow!(
            "Failed to parse Slack API response: {}. Raw response: {}",
            e,
            body
        )
    })?;

    if !slack_response.ok {
        log::error!("Slack API returned error: {}", body);
        return Err(anyhow::anyhow!(
            "Slack API returned error: {}",
            slack_response
                .error
                .unwrap_or_else(|| "Unknown error".to_string())
        ));
    }

    Ok(())
}
