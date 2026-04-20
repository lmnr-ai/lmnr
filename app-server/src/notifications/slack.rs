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
use uuid::Uuid;

use super::NotificationKind;
use super::utils::{build_report_data_from_batch, frontend_url_slack};
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

/// Format Slack message blocks for a batch of notifications.
///
/// All notifications in the batch are expected to be of the same kind.
/// Reports are rendered by combining per-project data into a single message.
/// Alerts and usage warnings use the first (and only) notification.
pub fn format_message_blocks_batch(
    notifications: &[NotificationKind],
    workspace_id: Uuid,
) -> serde_json::Value {
    let Some(first) = notifications.first() else {
        return json!([]);
    };

    match first {
        NotificationKind::EventIdentification {
            project_id,
            trace_id,
            event_id,
            event_name,
            extracted_information,
            alert_name,
            severity,
            signal_id,
            ..
        } => format_event_identification_blocks(
            &project_id.to_string(),
            &signal_id.to_string(),
            &trace_id.to_string(),
            event_id.as_ref(),
            event_name,
            extracted_information.clone(),
            alert_name,
            severity,
        ),
        NotificationKind::NewCluster {
            project_id,
            signal_id,
            signal_name,
            cluster_id,
            cluster_name,
            num_signal_events,
            num_child_clusters,
            alert_name,
        } => format_new_cluster_blocks(
            &project_id.to_string(),
            &signal_id.to_string(),
            signal_name,
            &cluster_id.to_string(),
            cluster_name,
            *num_signal_events,
            *num_child_clusters,
            alert_name,
        ),
        NotificationKind::SignalsReport { .. } => {
            let (title, report_data) = build_report_data_from_batch(notifications, workspace_id)
                .expect("SignalsReport batch must contain at least one report");
            format_report_blocks(&title, &report_data)
        }
        NotificationKind::UsageWarning {
            workspace_name,
            usage_label,
            formatted_limit,
            ..
        } => format_usage_warning_blocks(workspace_name, usage_label, formatted_limit),
    }
}

/// Convert standard markdown links `[text](url)` to Slack mrkdwn `<url|text>`.
fn md_links_to_slack(text: &str) -> String {
    static RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\[([^\]]+)\]\(([^)]+)\)").unwrap());
    RE.replace_all(text, "<$2|$1>").into_owned()
}

// Format Slack message blocks for an event identification notification.
fn format_event_identification_blocks(
    project_id: &str,
    signal_id: &str,
    trace_id: &str,
    event_id: Option<&Uuid>,
    signal_name: &str,
    extracted_information: Option<serde_json::Value>,
    alert_name: &str,
    severity: &u8,
) -> serde_json::Value {
    let base = frontend_url_slack();
    let trace_link = format!(
        "{}/project/{}/traces/{}?chat=true",
        base, project_id, trace_id
    );

    let severity_label = match severity {
        0 => ":large_green_circle: Info",
        1 => ":large_orange_circle: Warning",
        2 => ":red_circle: Critical",
        _ => "Unknown",
    };

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

    let mut blocks = vec![json!({
        "type": "section",
        "text": {
            "type": "mrkdwn",
            "text": format!("`{}`: New Event", signal_name)
        }
    })];

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
        blocks.push(json!({
            "type": "section",
            "text": { "type": "mrkdwn", "text": combined }
        }));
    }

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
    let mut context_elements = vec![
        json!({
            "type": "mrkdwn",
            "text": format!("Severity: {}", severity_label)
        }),
        json!({
            "type": "mrkdwn",
            "text": format!("Signal: <{}/project/{}/signals/{}|{}>", base, project_id, signal_id, signal_name)
        }),
        json!({
            "type": "mrkdwn",
            "text": format!("Alert: <{}/project/{}/settings?tab=alerts|{}>", base, project_id, alert_name)
        }),
    ];
    if let Some(eid) = event_id {
        context_elements.push(json!({
            "type": "mrkdwn",
            "text": format!(
                "Similar Events: <{}/project/{}/signals/{}?eventCluster={}|View>",
                base, project_id, signal_id, eid,
            )
        }));
    }
    blocks.push(json!({
        "type": "context",
        "elements": context_elements
    }));
    blocks.push(json!({"type": "divider"}));

    json!(blocks)
}

// Format Slack message blocks for a new-cluster notification.
#[allow(clippy::too_many_arguments)]
fn format_new_cluster_blocks(
    project_id: &str,
    signal_id: &str,
    signal_name: &str,
    cluster_id: &str,
    cluster_name: &str,
    num_signal_events: u32,
    num_child_clusters: usize,
    alert_name: &str,
) -> serde_json::Value {
    let base = frontend_url_slack();
    let cluster_link = format!(
        "{}/project/{}/signals/{}?clusterId={}",
        base, project_id, signal_id, cluster_id
    );

    let summary = format!(
        "_Name:_ *{}*\n_Events:_ *{}*\n_Child clusters:_ *{}*",
        cluster_name, num_signal_events, num_child_clusters,
    );

    let blocks = vec![
        json!({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": format!("`{}`: New Cluster", signal_name)
            }
        }),
        json!({
            "type": "section",
            "text": { "type": "mrkdwn", "text": summary }
        }),
        json!({
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": {
                        "type": "plain_text",
                        "text": "View Cluster",
                        "emoji": true
                    },
                    "url": cluster_link,
                    "action_id": "view_cluster"
                }
            ]
        }),
        json!({
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": format!("Signal: <{}/project/{}/signals/{}|{}>", base, project_id, signal_id, signal_name)
                },
                {
                    "type": "mrkdwn",
                    "text": format!("Alert: <{}/project/{}/settings?tab=alerts|{}>", base, project_id, alert_name)
                }
            ]
        }),
        json!({"type": "divider"}),
    ];

    json!(blocks)
}

/// Format Slack message blocks for a signals report notification.
fn format_report_blocks(title: &str, report: &ReportData) -> serde_json::Value {
    let base = frontend_url_slack();
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
                    "• `{}` – {} ({}) <{}/project/{}/traces/{}?chat=true|View trace>\n",
                    event.signal_name,
                    event.summary,
                    event.timestamp,
                    base,
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

/// Format Slack message blocks for a usage warning notification.
fn format_usage_warning_blocks(
    workspace_name: &str,
    usage_label: &str,
    formatted_limit: &str,
) -> serde_json::Value {
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
