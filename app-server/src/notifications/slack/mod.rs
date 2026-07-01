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
use super::utils::build_report_data_from_batch;

const SLACK_API_BASE: &str = "https://slack.com/api";

#[derive(Debug, Deserialize, Serialize)]
struct SlackApiResponse {
    ok: bool,
    #[serde(default)]
    error: Option<String>,
    // `ts` of the posted message — the stable per-channel id the agent keys persisted rows on.
    #[serde(default)]
    ts: Option<String>,
}

pub fn decode_slack_token(
    team_id: &str,
    nonce_hex: &str,
    encrypted_value: &str,
) -> anyhow::Result<String> {
    let key_hex = std::env::var(crate::env::secrets::SLACK_ENCRYPTION_KEY)
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
            project_id,
            signal_id,
            signal_name,
            cluster_id,
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
        } => {
            format_usage_warning_blocks(workspace_id, workspace_name, usage_label, formatted_limit)
        }
    }
}

/// Convert standard markdown links `[text](url)` to Slack mrkdwn `<url|text>`.
fn md_links_to_slack(text: &str) -> String {
    static RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\[([^\]]+)\]\(([^)]+)\)").unwrap());
    RE.replace_all(text, "<$2|$1>").into_owned()
}

/// Slack section block `text` fields are capped at 3000 chars. If the input
/// exceeds the limit, truncate at a char boundary and append `...` so the
/// block stays under the limit while signalling the truncation to the reader.
pub(crate) fn truncate_to_slack_section_limit(text: &str) -> String {
    const SLACK_SECTION_TEXT_LIMIT: usize = 3000;
    const ELLIPSIS: &str = "...";

    if text.chars().count() <= SLACK_SECTION_TEXT_LIMIT {
        return text.to_string();
    }

    let keep = SLACK_SECTION_TEXT_LIMIT - ELLIPSIS.chars().count();
    let mut out: String = text.chars().take(keep).collect();
    out.push_str(ELLIPSIS);
    out
}

mod event_identification;
mod new_cluster;
mod report;
mod usage_warning;

use event_identification::format_event_identification_blocks;
use new_cluster::format_new_cluster_blocks;
use report::format_report_blocks;
use usage_warning::format_usage_warning_blocks;

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

/// Post a message into a Slack thread via `chat.postMessage`. Pass `blocks: Some(..)` for a Block Kit
/// message (e.g. the in-Slack project picker), `None` for a plain-text reply. `text` is the plain body
/// / Block Kit notification fallback and must be pre-truncated to the Slack section limit by the caller.
/// Returns the posted message `ts` (None when Slack omits it) so callers that persist the turn can key
/// it by `external_id`; callers that don't persist (e.g. the picker) ignore it. Errors propagate so the
/// spawned handler can log them.
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub async fn post_thread_message(
    slack_client: &Client,
    token: &str,
    channel_id: &str,
    thread_ts: &str,
    text: &str,
    blocks: Option<serde_json::Value>,
) -> Result<Option<String>> {
    let mut body = json!({
        "channel": channel_id,
        "thread_ts": thread_ts,
        "text": text,
        "unfurl_links": false,
        "unfurl_media": false,
    });
    // Insert `blocks` only when present — never send `blocks: null`. `body` is an object literal, so
    // serde_json's IndexMut adds the key in place.
    if let Some(blocks) = blocks {
        body["blocks"] = blocks;
    }

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
            "Failed to post Slack thread message. HTTP Status: {}, Response: {}",
            status,
            body
        ));
    }
    let parsed: SlackApiResponse = serde_json::from_str(&body)
        .map_err(|e| anyhow::anyhow!("Failed to parse Slack response: {}. Raw: {}", e, body))?;
    if !parsed.ok {
        return Err(anyhow::anyhow!(
            "Slack API error on chat.postMessage: {}",
            parsed.error.unwrap_or_else(|| "unknown".to_string())
        ));
    }
    // None (not "") when ts is absent: an empty external_id is non-NULL and would collapse rows under
    // the partial unique index, whereas None is exempt (same as intermediate/non-Slack turns).
    Ok(parsed.ts.filter(|ts| !ts.is_empty()))
}

/// Fetch a thread's prior messages via `conversations.replies` (oldest first). Used to backfill
/// context when the agent is first mentioned mid-thread. The caller persists each as a `user` turn
/// (the agent's own replies are written live as `assistant`), so authorship isn't distinguished here.
/// Best-effort — the caller treats a failure as "no backfill".
pub async fn fetch_thread_replies(
    slack_client: &Client,
    token: &str,
    channel_id: &str,
    thread_ts: &str,
    limit: u32,
) -> Result<Vec<ThreadMessage>> {
    #[derive(Deserialize)]
    struct RepliesResponse {
        ok: bool,
        #[serde(default)]
        error: Option<String>,
        #[serde(default)]
        messages: Vec<RawThreadMessage>,
    }
    #[derive(Deserialize)]
    struct RawThreadMessage {
        #[serde(default)]
        text: String,
        #[serde(default)]
        ts: Option<String>,
    }

    let response = slack_client
        .get(format!("{}/conversations.replies", SLACK_API_BASE))
        .header("Authorization", format!("Bearer {}", token))
        .query(&[
            ("channel", channel_id),
            ("ts", thread_ts),
            ("limit", &limit.to_string()),
        ])
        .send()
        .await?;
    let parsed: RepliesResponse = response.json().await?;
    if !parsed.ok {
        return Err(anyhow::anyhow!(
            "Slack conversations.replies error: {}",
            parsed.error.unwrap_or_else(|| "unknown".to_string())
        ));
    }

    Ok(parsed
        .messages
        .into_iter()
        .filter(|m| !m.text.trim().is_empty())
        .map(|m| ThreadMessage {
            text: m.text,
            ts: m.ts,
        })
        .collect())
}

/// One backfilled thread message. Persisted as a `user` turn regardless of author (see
/// `fetch_thread_replies`).
#[derive(Debug, Clone)]
pub struct ThreadMessage {
    pub text: String,
    pub ts: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncate_preserves_short_text() {
        let input = "hello world";
        assert_eq!(truncate_to_slack_section_limit(input), input);
    }

    #[test]
    fn truncate_preserves_text_at_limit() {
        let input: String = "a".repeat(3000);
        assert_eq!(truncate_to_slack_section_limit(&input), input);
    }

    #[test]
    fn truncate_appends_ellipsis_past_limit() {
        let input: String = "a".repeat(3500);
        let out = truncate_to_slack_section_limit(&input);
        assert_eq!(out.chars().count(), 3000);
        assert!(out.ends_with("..."));
        assert!(out.starts_with("aaa"));
    }

    #[test]
    fn truncate_respects_char_boundaries() {
        // Multi-byte chars would panic on byte-index slicing.
        let input: String = "é".repeat(3500);
        let out = truncate_to_slack_section_limit(&input);
        assert_eq!(out.chars().count(), 3000);
        assert!(out.ends_with("..."));
    }

    use crate::reports::email_template::{NoteworthyEvent, ProjectReportData, ReportData};
    use std::collections::BTreeMap;

    fn blocks_of(v: &serde_json::Value) -> &Vec<serde_json::Value> {
        v.as_array().expect("blocks array")
    }

    #[test]
    fn usage_warning_has_manage_billing_button() {
        let wid = Uuid::nil();
        let v = format_usage_warning_blocks(wid, "Acme Inc", "the monthly signal allowance", "85%");
        let first = &blocks_of(&v)[0];
        assert_eq!(first["accessory"]["action_id"], "manage_billing");
        let url = first["accessory"]["url"].as_str().unwrap();
        assert!(url.contains("/checkout/portal?workspaceId="));
        assert!(url.contains(&wid.to_string()));
        assert!(first["text"]["text"].as_str().unwrap().contains("85%"));
    }

    #[test]
    fn event_identification_routes_short_to_grid_long_to_section() {
        let eid = Uuid::nil();
        let info = json!({
            "error_code": "INVALID_ORDER_ID",
            "description": "x".repeat(120),
        });
        let v = format_event_identification_blocks(
            "pid",
            "sid",
            "tid",
            Some(&eid),
            "Failure Detector",
            Some(info),
            "Alert",
            &2u8,
        );
        let blocks = blocks_of(&v);
        // header carries the severity
        let header = blocks.iter().find(|b| b["type"] == "header").unwrap();
        let ht = header["text"]["text"].as_str().unwrap();
        assert!(ht.contains("Failure Detector"));
        assert!(ht.contains("Critical"));
        // short scalar -> a fields grid; long value -> a plain section
        assert!(
            blocks
                .iter()
                .any(|b| b["type"] == "section" && b.get("fields").is_some())
        );
        assert!(
            blocks
                .iter()
                .any(|b| b["type"] == "section" && b.get("text").is_some())
        );
        // "Open in Signals" carries trace + cluster
        let btn = blocks.iter().find(|b| b["type"] == "actions").unwrap()["elements"][0].clone();
        let url = btn["url"].as_str().unwrap();
        assert!(url.contains("eventCluster="));
        assert!(url.contains("traceId="));
    }

    #[test]
    fn new_cluster_header_and_cube_variant() {
        let pid = Uuid::nil();
        let sid = Uuid::nil();
        let cid = Uuid::nil();
        // leaf (no children) -> variant=box
        let leaf = format_new_cluster_blocks(
            &pid,
            &sid,
            "Failure Detector",
            &cid,
            "Bad args",
            3,
            0,
            "Alert",
        );
        let lb = blocks_of(&leaf);
        let header = lb.iter().find(|b| b["type"] == "header").unwrap();
        assert_eq!(header["text"]["text"], "Failure Detector - New cluster");
        let cube = lb[1]["elements"][0]["image_url"].as_str().unwrap();
        assert!(cube.contains("/api/cluster-swatch?clusterId="));
        assert!(cube.contains("variant=box"));
        assert!(!cube.contains("variant=boxes"));
        // non-leaf -> variant=boxes
        let parent = format_new_cluster_blocks(&pid, &sid, "Sig", &cid, "Group", 9, 4, "Alert");
        let cube2 = blocks_of(&parent)[1]["elements"][0]["image_url"]
            .as_str()
            .unwrap();
        assert!(cube2.contains("variant=boxes"));
    }

    fn report_with(noteworthy: Vec<NoteworthyEvent>) -> ReportData {
        let mut counts = BTreeMap::new();
        counts.insert("Failure Detector".to_string(), 93u64);
        ReportData {
            workspace_id: Uuid::nil(),
            workspace_name: "WS".to_string(),
            period_label: "Weekly".to_string(),
            period_start: "Jun 1".to_string(),
            period_end: "Jun 7".to_string(),
            total_events: 93,
            projects: vec![ProjectReportData {
                project_name: "background-agent".to_string(),
                project_id: Uuid::nil(),
                signal_event_counts: counts,
                ai_summary: "Summary text".to_string(),
                noteworthy_events: noteworthy,
            }],
        }
    }

    fn event(sev: u8) -> NoteworthyEvent {
        NoteworthyEvent {
            signal_name: "Failure Detector".to_string(),
            summary: "Something broke".to_string(),
            timestamp: "Jun 7".to_string(),
            trace_id: Uuid::nil().to_string(),
            severity: sev,
        }
    }

    #[test]
    fn report_builds_carousel_with_severity_subtitle() {
        let v = format_report_blocks("Weekly report – WS", &report_with(vec![event(2)]));
        let blocks = blocks_of(&v);
        assert_eq!(blocks[0]["type"], "header");
        assert!(
            blocks[0]["text"]["text"]
                .as_str()
                .unwrap()
                .contains(":bar_chart:")
        );
        let carousel = blocks.iter().find(|b| b["type"] == "carousel").unwrap();
        let card = &carousel["elements"][0];
        assert_eq!(card["type"], "card");
        assert_eq!(card["title"]["text"], "Failure Detector");
        assert!(
            card["subtitle"]["text"]
                .as_str()
                .unwrap()
                .contains("Critical")
        );
    }

    #[test]
    fn report_carousel_caps_at_ten_with_overflow_note() {
        let events: Vec<NoteworthyEvent> = (0..12).map(|_| event(1)).collect();
        let v = format_report_blocks("R", &report_with(events));
        let blocks = blocks_of(&v);
        let carousel = blocks.iter().find(|b| b["type"] == "carousel").unwrap();
        assert_eq!(carousel["elements"].as_array().unwrap().len(), 10);
        // overflow surfaced as a "+N more" context with a signals link
        assert!(blocks.iter().any(|b| {
            b["type"] == "context"
                && b["elements"][0]["text"]
                    .as_str()
                    .map(|t| t.contains("+2 more"))
                    .unwrap_or(false)
        }));
    }
}
