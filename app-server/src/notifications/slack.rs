use std::collections::HashMap;

use anyhow::Result;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sodiumoxide::{
    crypto::aead::xchacha20poly1305_ietf::{Key, Nonce, open},
    hex,
};

use super::TraceAnalysisPayload;

const SLACK_API_BASE: &str = "https://slack.com/api";

#[derive(Debug, Deserialize, Serialize, Clone)]
pub enum SlackMessagePayload {
    TraceAnalysis(TraceAnalysisPayload),
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

fn format_trace_analysis_blocks(
    project_id: &str,
    trace_id: &str,
    event_name: &str,
    status: &str,
    summary: &str,
    analysis: &str,
    span_ids_map: &HashMap<String, String>,
) -> serde_json::Value {
    let emoji = match status {
        "error" => "🚨",
        "warning" => "⚠️",
        _ => "ℹ️",
    };

    let mut analysis_text = if analysis.is_empty() {
        "No analysis available".to_string()
    } else {
        analysis.to_string()
    };

    for (span_name, span_id) in span_ids_map {
        let link_url = format!(
            "https://laminar.sh/project/{}/traces?trace_id={}&span_id={}",
            project_id, trace_id, span_id
        );
        let slack_link = format!("<{}|`{}`>", link_url, span_name);
        let backticked_span = format!("`{}`", span_name);
        analysis_text = analysis_text.replace(&backticked_span, &slack_link);
    }

    json!([
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": format!("{} *Event: {}*\n{}", emoji, event_name, summary)
            }
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": analysis_text
            }
        }
    ])
}

fn format_message_blocks(
    payload: &SlackMessagePayload,
    project_id: &str,
    trace_id: &str,
    event_name: &str,
) -> serde_json::Value {
    match payload {
        SlackMessagePayload::TraceAnalysis(trace_payload) => format_trace_analysis_blocks(
            project_id,
            trace_id,
            event_name,
            &trace_payload.status,
            &trace_payload.summary,
            &trace_payload.analysis,
            &trace_payload.span_ids_map,
        ),
    }
}

pub async fn send_message(
    slack_client: &Client,
    token: &str,
    payload: &SlackMessagePayload,
    project_id: &str,
    trace_id: &str,
    event_name: &str,
) -> Result<()> {
    let channel_id = match payload {
        SlackMessagePayload::TraceAnalysis(trace_payload) => &trace_payload.channel_id,
    };

    let blocks = format_message_blocks(payload, project_id, trace_id, event_name);

    let response = slack_client
        .post(format!("{}/chat.postMessage", SLACK_API_BASE))
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&json!({ "channel": channel_id, "blocks": blocks }))
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
        return Err(anyhow::anyhow!(
            "Slack API returned error: {}",
            slack_response
                .error
                .unwrap_or_else(|| "Unknown error".to_string())
        ));
    }

    Ok(())
}
