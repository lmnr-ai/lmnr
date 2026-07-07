use serde_json::json;
<<<<<<< Updated upstream

use super::truncate_to_slack_section_limit;
use crate::notifications::NotificationKind;
use crate::notifications::utils::{frontend_url_slack, with_utm};

/// Format Slack message blocks for a new-cluster digest — one message covering
/// every new cluster from a clustering batch.
pub(super) fn format_new_cluster_blocks(clusters: &[&NotificationKind]) -> serde_json::Value {
    const NEW_CLUSTER_SECTION_TEXT_LEN: usize = 3000;
    // Slack caps messages at 50 blocks; each cluster adds 2 (section + actions),
    // plus header, optional overflow, context, and divider.
    const MAX_CLUSTERS_PER_DIGEST: usize = 20;

    let Some(NotificationKind::NewCluster {
        project_id,
        signal_id,
        signal_name,
        alert_name,
        ..
    }) = clusters.first()
    else {
        return json!([]);
    };

    let base = frontend_url_slack();
    let signal_link = with_utm(
        &format!("{}/project/{}/signals/{}", base, project_id, signal_id),
        "slack",
        "new_cluster_alert",
        "view_signal",
=======
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
>>>>>>> Stashed changes
    );
    let alert_link = with_utm(
        &format!("{}/project/{}/settings?tab=alerts", base, project_id),
        "slack",
        "new_cluster_alert",
        "manage_alert",
    );

<<<<<<< Updated upstream
    let header = if clusters.len() > 1 {
        format!("`{}`: {} New Clusters", signal_name, clusters.len())
    } else {
        format!("`{}`: New Cluster", signal_name)
    };
    let mut blocks = vec![json!({
        "type": "section",
        "text": { "type": "mrkdwn", "text": header }
    })];

    for kind in clusters.iter().take(MAX_CLUSTERS_PER_DIGEST) {
        let NotificationKind::NewCluster {
            project_id,
            signal_id,
            cluster_id,
            cluster_name,
            num_signal_events,
            first_seen,
            last_seen,
            severity_counts,
            example_events,
            ..
        } = kind
        else {
            continue;
        };

        let cluster_link = with_utm(
            &format!(
                "{}/project/{}/signals/{}?clusterId={}",
                base, project_id, signal_id, cluster_id
            ),
            "slack",
            "new_cluster_alert",
            "view_cluster",
        );

        let mut text = format!(
            "*<{}|{}>*\n*Events:* {}",
            cluster_link, cluster_name, num_signal_events
        );
        if let Some(first_seen) = first_seen {
            text.push_str(&format!("\n*First seen:* {}", first_seen));
        }
        if let Some(last_seen) = last_seen {
            text.push_str(&format!("\n*Last seen:* {}", last_seen));
        }

        let [info, warning, critical] = severity_counts;
        let mut severity_parts = Vec::new();
        if *critical > 0 {
            severity_parts.push(format!(":red_circle: {} Critical", critical));
        }
        if *warning > 0 {
            severity_parts.push(format!(":large_orange_circle: {} Warning", warning));
        }
        if *info > 0 {
            severity_parts.push(format!(":large_green_circle: {} Info", info));
        }
        if !severity_parts.is_empty() {
            text.push('\n');
            text.push_str(&severity_parts.join("  "));
        }

        if !example_events.is_empty() {
            text.push_str("\n*Example events:*\n");
            for event in example_events {
                let trace_link = with_utm(
                    &format!(
                        "{}/project/{}/traces/{}?chat=true",
                        base, project_id, event.trace_id
                    ),
                    "slack",
                    "new_cluster_alert",
                    "view_trace",
                );
                let entry = if let Some(summary) = &event.summary {
                    format!(
                        "• `{}` – {} ({}) <{}|View trace>\n",
                        event.name, summary, event.timestamp, trace_link
                    )
                } else {
                    format!(
                        "• `{}` ({}) <{}|View trace>\n",
                        event.name, event.timestamp, trace_link
                    )
                };
                if text.len() + entry.len() > NEW_CLUSTER_SECTION_TEXT_LEN {
                    break;
                }
                text.push_str(&entry);
            }
        }

        blocks.push(json!({
            "type": "section",
            "text": { "type": "mrkdwn", "text": truncate_to_slack_section_limit(&text) }
        }));
        blocks.push(json!({
            "type": "actions",
            "elements": [{
                "type": "button",
                "text": { "type": "plain_text", "text": "View Cluster", "emoji": true },
                "url": cluster_link,
                "action_id": format!("view_cluster_{}", cluster_id)
            }]
        }));
    }

    if clusters.len() > MAX_CLUSTERS_PER_DIGEST {
        blocks.push(json!({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": format!(
                    "…and {} more new clusters — <{}|view all>",
                    clusters.len() - MAX_CLUSTERS_PER_DIGEST,
                    signal_link
                )
            }
        }));
    }

    blocks.push(json!({
        "type": "context",
        "elements": [
            { "type": "mrkdwn", "text": format!("Signal: <{}|{}>", signal_link, signal_name) },
            { "type": "mrkdwn", "text": format!("Alert: <{}|{}>", alert_link, alert_name) }
        ]
    }));
    blocks.push(json!({"type": "divider"}));
    json!(blocks)
=======
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
>>>>>>> Stashed changes
}
