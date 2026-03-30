use anyhow::Result;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sodiumoxide::{
    crypto::aead::xchacha20poly1305_ietf::{Key, Nonce, open},
    hex,
};
use uuid::Uuid;

use crate::reports::email_template::ReportData;

const SLACK_API_BASE: &str = "https://slack.com/api";

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EventIdentificationPayload {
    pub project_id: Uuid,
    pub trace_id: Uuid,
    pub event_name: String,
    pub extracted_information: Option<serde_json::Value>,
    pub channel_id: String,
    pub integration_id: Uuid,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ReportPayload {
    pub title: String,
    pub report: ReportData,
    pub channel_id: String,
    pub integration_id: Uuid,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub enum SlackMessagePayload {
    EventIdentification(EventIdentificationPayload),
    Report(ReportPayload),
}

impl SlackMessagePayload {
    pub fn channel_id(&self) -> &str {
        match self {
            Self::EventIdentification(p) => &p.channel_id,
            Self::Report(p) => &p.channel_id,
        }
    }

    pub fn integration_id(&self) -> &Uuid {
        match self {
            Self::EventIdentification(p) => &p.integration_id,
            Self::Report(p) => &p.integration_id,
        }
    }
}

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

/// Split a mrkdwn string into chunks that each fit within `max_len` bytes.
/// Splits on newline boundaries to avoid breaking formatting mid-line.
/// Uses `floor_char_boundary` to avoid panicking on multi-byte UTF-8 characters.
fn split_mrkdwn_chunks(text: &str, max_len: usize) -> Vec<&str> {
    if text.len() <= max_len {
        return vec![text];
    }

    let mut chunks = Vec::new();
    let mut start = 0;

    while start < text.len() {
        if start + max_len >= text.len() {
            chunks.push(&text[start..]);
            break;
        }

        // Snap to a valid UTF-8 char boundary so slicing never panics
        let end = text.floor_char_boundary(start + max_len);
        let split_at = text[start..end]
            .rfind('\n')
            .map(|pos| start + pos + 1)
            .unwrap_or(end);

        chunks.push(&text[start..split_at]);
        start = split_at;
    }

    chunks
}

fn format_event_identification_blocks(
    project_id: &str,
    trace_id: &str,
    event_name: &str,
    extracted_information: Option<serde_json::Value>,
) -> serde_json::Value {
    let trace_link = format!(
        "https://laminar.sh/project/{}/traces/{}",
        project_id, trace_id
    );

    let info_entries: Vec<String> = if let Some(info) = extracted_information {
        if let Some(obj) = info.as_object() {
            obj.iter()
                .map(|(key, value)| {
                    let formatted_value = match value {
                        serde_json::Value::String(s) => s.clone(),
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
        let mut blocks = vec![json!({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": format!("*Event*: `{}`", event_name)
            }
        })];
        for entry in &info_entries {
            for chunk in split_mrkdwn_chunks(entry, MAX_SECTION_TEXT_LEN) {
                blocks.push(json!({
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": chunk
                    }
                }));
            }
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
        }
    ])
}

fn format_report_blocks(payload: &ReportPayload) -> serde_json::Value {
    let report = &payload.report;
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
            "text": { "type": "mrkdwn", "text": format!(":bar_chart: *{}*", payload.title) }
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
                text.push_str(&format!("• `{}`", event.signal_name));
                if !event.summary.is_empty() {
                    text.push_str(&format!(" – {}", event.summary));
                }
                text.push_str(&format!(
                    " ({}) <https://laminar.sh/project/{}/traces/{}|View trace>\n",
                    event.timestamp, project.project_id, event.trace_id,
                ));
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

        for chunk in split_mrkdwn_chunks(&text, MAX_SECTION_TEXT_LEN) {
            blocks.push(json!({
                "type": "section",
                "text": { "type": "mrkdwn", "text": chunk }
            }));
        }
    }

    json!(blocks)
}

pub fn format_message_blocks(payload: &SlackMessagePayload) -> serde_json::Value {
    match payload {
        SlackMessagePayload::EventIdentification(p) => format_event_identification_blocks(
            &p.project_id.to_string(),
            &p.trace_id.to_string(),
            &p.event_name,
            p.extracted_information.clone(),
        ),
        SlackMessagePayload::Report(p) => format_report_blocks(p),
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
