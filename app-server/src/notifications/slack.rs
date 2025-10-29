use anyhow::Result;
use reqwest::Client;
use serde_json::json;
use sodiumoxide::{
    crypto::aead::xchacha20poly1305_ietf::{Key, Nonce, open},
    hex,
};

use super::TraceAnalysisPayload;

const SLACK_API_BASE: &str = "https://slack.com/api";

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

pub async fn send_message(
    token: &str,
    channel_id: &str,
    payload: &TraceAnalysisPayload,
) -> Result<()> {
    let client = Client::new();

    let blocks = json!([
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": format!("*{}*", payload.summary)
            }
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": payload.analysis_preview
            }
        }
    ]);

    let response = client
        .post(format!("{}/chat.postMessage", SLACK_API_BASE))
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&json!({
            "channel": channel_id,
            "text": &payload.summary,
            "blocks": blocks,
        }))
        .send()
        .await?;

    let status = response.status();
    let body = response.text().await?;

    if !status.is_success() {
        return Err(anyhow::anyhow!(
            "Failed to send Slack message. Status: {}, Response: {}",
            status,
            body
        ));
    }

    Ok(())
}
