use serde_json::json;
use uuid::Uuid;

use crate::notifications::utils::{frontend_url_slack, with_utm};
use crate::utils::truncate_chars;

// Format Slack message blocks for a new-cluster notification.
#[allow(clippy::too_many_arguments)]
pub(super) fn format_new_cluster_blocks(
    project_id: &Uuid,
    signal_id: &Uuid,
    signal_name: &str,
    cluster_id: &Uuid,
    cluster_name: &str,
    num_signal_events: u32,
    num_child_clusters: usize,
    alert_name: &str,
) -> serde_json::Value {
    let base = frontend_url_slack();

    // "Open in Signals" — selects the signal and this cluster.
    let open_in_signals_link = with_utm(
        &format!(
            "{}/project/{}/signals/{}?clusterId={}",
            base, project_id, signal_id, cluster_id
        ),
        "slack",
        "new_cluster_alert",
        "open_in_signals",
    );
    let alert_link = with_utm(
        &format!("{}/project/{}/settings?tab=alerts", base, project_id),
        "slack",
        "new_cluster_alert",
        "manage_alert",
    );

    // Cube swatch from /api/cluster-swatch (colored by colors.ts); boxes for non-leaf, box for leaf.
    let variant = if num_child_clusters > 0 {
        "boxes"
    } else {
        "box"
    };
    let cube_url = format!(
        "{}/api/cluster-swatch?clusterId={}&variant={}",
        base, cluster_id, variant
    );
    let cube_alt = if cluster_name.is_empty() {
        "cluster"
    } else {
        cluster_name
    };

    let events_label = if num_signal_events == 1 {
        "event"
    } else {
        "events"
    };
    let children_label = if num_child_clusters == 1 {
        "child cluster"
    } else {
        "child clusters"
    };
    let subhead = format!(
        "{} {} · {} {}",
        num_signal_events, events_label, num_child_clusters, children_label
    );

    // Title mirrors the event header: "<signal> - New cluster". Cap the name so the rendered
    // header stays under Slack's 150-char `header` limit.
    const MAX_NAME_CHARS: usize = 120;
    let display_signal = truncate_chars(signal_name, MAX_NAME_CHARS);
    let header_text = format!("{} - New cluster", display_signal);

    // `alert_name` no longer renders inline (the Manage Alert button replaces the context link).
    let _ = alert_name;

    json!([
        {
            "type": "header",
            "text": { "type": "plain_text", "text": header_text, "emoji": true }
        },
        {
            "type": "context",
            "elements": [
                { "type": "image", "image_url": cube_url, "alt_text": cube_alt },
                { "type": "mrkdwn", "text": format!("*{}*", cluster_name) }
            ]
        },
        {
            "type": "context",
            "elements": [
                { "type": "mrkdwn", "text": subhead }
            ]
        },
        {
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
        },
        {"type": "divider"}
    ])
}
