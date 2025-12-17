use anyhow::Result;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sodiumoxide::{
    crypto::aead::xchacha20poly1305_ietf::{Key, Nonce, open},
    hex,
};
use uuid::Uuid;

const SLACK_API_BASE: &str = "https://slack.com/api";

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EventIdentificationPayload {
    pub event_name: String,
    pub extracted_information: Option<serde_json::Value>,
    pub channel_id: String,
    pub integration_id: Uuid,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub enum SlackMessagePayload {
    EventIdentification(EventIdentificationPayload),
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

fn format_event_identification_blocks(
    project_id: &str,
    trace_id: &str,
    span_id: &str,
    event_name: &str,
    extracted_information: Option<serde_json::Value>,
) -> serde_json::Value {
    let trace_link = format!(
        "https://laminar.sh/project/{}/traces/{}?spanId={}",
        project_id, trace_id, span_id
    );

    let extracted_information_text = if let Some(info) = extracted_information {
        if let Some(obj) = info.as_object() {
            obj.iter()
                .map(|(key, value)| {
                    let formatted_value = match value {
                        serde_json::Value::String(s) => s.clone(),
                        serde_json::Value::Number(n) => n.to_string(),
                        serde_json::Value::Bool(b) => b.to_string(),
                        serde_json::Value::Null => "".to_string(),
                        _ => serde_json::to_string_pretty(value).unwrap_or_default(),
                    };
                    format!("*{}*:\n{}", key, formatted_value)
                })
                .collect::<Vec<_>>()
                .join("\n\n")
        } else {
            serde_json::to_string_pretty(&info).unwrap_or_default()
        }
    } else {
        String::new()
    };

    if !extracted_information_text.is_empty() {
        return json!([
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": format!("*Event*: `{}`", event_name)
                }
            },
            {
                "type": "markdown",
                "text": extracted_information_text
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
        ]);
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

pub fn format_message_blocks(
    payload: &SlackMessagePayload,
    project_id: &str,
    trace_id: &str,
    span_id: &str,
    event_name: &str,
) -> serde_json::Value {
    match payload {
        SlackMessagePayload::EventIdentification(event_payload) => {
            format_event_identification_blocks(
                project_id,
                trace_id,
                span_id,
                event_name,
                event_payload.extracted_information.clone(),
            )
        }
    }
}

pub fn get_channel_id(payload: &SlackMessagePayload) -> &str {
    match payload {
        SlackMessagePayload::EventIdentification(event_payload) => &event_payload.channel_id,
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
