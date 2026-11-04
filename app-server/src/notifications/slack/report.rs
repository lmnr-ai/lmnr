use serde_json::json;

use super::truncate_to_slack_section_limit;
use crate::notifications::utils::{frontend_url_slack, with_utm};
use crate::reports::{ProjectReportData, ReportClusterData, ReportData, SignalReportData};
use crate::utils::truncate_chars;

const HEADER_MAX: usize = 150;
const NAME_MAX: usize = 120;
// Slack `chat.postMessage` rejects a message with more than 50 blocks.
const MAX_BLOCKS: usize = 50;

/// Format Slack message blocks for a signals report notification.
///
/// Mirrors the report email: an H1 title + period overview, then one card per
/// signal across all projects (busiest first) with the signal's summary, its event
/// count vs the previous period, and its notable clusters, then a "Manage reports"
/// footer.
///
/// Signals are rendered until the 50-block budget is hit, then a
/// "+N more signals" notice is appended.
pub(super) fn format_report_blocks(title: &str, report: &ReportData) -> serde_json::Value {
    let base = frontend_url_slack();
    let project_count = report.projects.len();

    let overview = format!(
        "{} – {} · *{}* event{} across *{}* project{}",
        report.period_start,
        report.period_end,
        report.total_events,
        if report.total_events == 1 { "" } else { "s" },
        project_count,
        if project_count == 1 { "" } else { "s" },
    );

    let mut blocks = vec![
        json!({
            "type": "markdown",
            "text": truncate_chars(&format!("# 📊 {}", title), HEADER_MAX)
        }),
        json!({
            "type": "context",
            "elements": [{ "type": "mrkdwn", "text": overview }]
        }),
    ];

    let manage_link = with_utm(
        &format!("{}/workspace/{}?tab=reports", base, report.workspace_id),
        "slack",
        "signals_report",
        "manage_reports",
    );
    let footer = json!({
        "type": "context",
        "elements": [{ "type": "mrkdwn", "text": format!("<{}|Manage reports>", manage_link) }]
    });

    let signals = report.signals_by_volume();
    if signals.is_empty() {
        blocks.push(json!({
            "type": "section",
            "text": { "type": "mrkdwn", "text": "_No signal activity in this period._" }
        }));
        blocks.push(footer);
        return json!(blocks);
    }

    let total_signals = signals.len();
    let mut rendered = 0usize;
    for (project, signal) in signals {
        let card = signal_card_blocks(project, signal, &base);
        // Reserve the footer, plus the truncation notice while signals remain.
        let reserve = 1 + usize::from(total_signals - rendered > 1);
        if blocks.len() + card.len() + reserve > MAX_BLOCKS {
            break;
        }
        blocks.extend(card);
        rendered += 1;
    }

    if rendered < total_signals {
        let omitted = total_signals - rendered;
        blocks.push(json!({
            "type": "context",
            "elements": [{
                "type": "mrkdwn",
                "text": format!(
                    "_+{} more signal{} not shown (a Slack message is capped at 50 blocks)._",
                    omitted,
                    if omitted == 1 { "" } else { "s" }
                )
            }]
        }));
    }

    blocks.push(footer);
    json!(blocks)
}

/// One signal's card: divider, overview section (breadcrumb, event count, summary),
/// and a notable-clusters section.
fn signal_card_blocks(
    project: &ProjectReportData,
    signal: &SignalReportData,
    base: &str,
) -> Vec<serde_json::Value> {
    let signal_link = with_utm(
        &format!(
            "{}/project/{}/signals/{}",
            base, project.project_id, signal.signal_id
        ),
        "slack",
        "signals_report",
        "view_signal",
    );

    let overview = format!(
        "{} / *<{}|{}>*\n*{}* {}  {} vs previous period\n\n{}",
        escape_mrkdwn(&truncate_chars(&project.project_name, NAME_MAX)),
        signal_link,
        escape_link_text(&truncate_chars(&signal.signal_name, NAME_MAX)),
        signal.current_count,
        if signal.current_count == 1 {
            "event"
        } else {
            "events"
        },
        delta(signal.current_count, signal.previous_count),
        escape_mrkdwn(&signal.summary_or_default()),
    );

    let clusters = signal.notable_clusters();
    let clusters_text = if clusters.is_empty() {
        "*Notable clusters*\n_No notable clusters in this period._".to_string()
    } else {
        let rows = clusters
            .into_iter()
            .map(|row| cluster_line(project, signal, row, base))
            .collect::<Vec<_>>()
            .join("\n");
        format!("*Notable clusters*\n{}", rows)
    };

    vec![
        json!({"type": "divider"}),
        json!({
            "type": "section",
            "text": { "type": "mrkdwn", "text": truncate_to_slack_section_limit(&overview) }
        }),
        json!({
            "type": "section",
            "text": { "type": "mrkdwn", "text": truncate_to_slack_section_limit(&clusters_text) }
        }),
    ]
}

fn cluster_line(
    project: &ProjectReportData,
    signal: &SignalReportData,
    row: &ReportClusterData,
    base: &str,
) -> String {
    let cluster_link = with_utm(
        &format!(
            "{}/project/{}/signals/{}?clusterId={}",
            base, project.project_id, signal.signal_id, row.id
        ),
        "slack",
        "signals_report",
        "view_cluster",
    );
    format!(
        "◇ <{}|{}> · {} {} · {}",
        cluster_link,
        escape_link_text(&truncate_chars(&row.name, NAME_MAX)),
        row.count,
        if row.count == 1 { "event" } else { "events" },
        delta(row.count, row.previous_count),
    )
}

/// Change vs the previous period, matching the email's NEW / ▲ / ▼ markers.
fn delta(current: u64, previous: u64) -> String {
    if previous == 0 {
        return "`NEW`".to_string();
    }
    let pct = (current as f64 - previous as f64) / previous as f64 * 100.0;
    if pct > 0.0 {
        format!("▲ {:.1}%", pct)
    } else if pct < 0.0 {
        format!("▼ {:.1}%", pct.abs())
    } else {
        "0.0%".to_string()
    }
}

/// Escape the three characters Slack mrkdwn treats as control sequences.
fn escape_mrkdwn(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// Link text additionally can't contain `|`, which ends the `<url|text>` label early.
fn escape_link_text(text: &str) -> String {
    escape_mrkdwn(text).replace('|', "¦")
}
