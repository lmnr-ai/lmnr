use serde_json::json;

use super::truncate_to_slack_section_limit;
use crate::notifications::utils::{frontend_url_slack, with_utm};
use crate::reports::email_template::ReportData;
use crate::utils::truncate_chars;

fn severity_circle(severity: u8) -> &'static str {
    match severity {
        0 => ":large_green_circle: Info",
        1 => ":large_orange_circle: Warning",
        2 => ":red_circle: Critical",
        _ => "",
    }
}

/// Format Slack message blocks for a signals report notification.
///
/// Layout: a `:bar_chart:` title + overview, then per project a header, a
/// per-signal stat line, the AI summary, and a horizontal `carousel` of cards
/// (one per noteworthy event). The carousel is capped at 10 cards (Slack's max);
/// overflow is surfaced as a "+N more" link to the signals page.
///
/// The whole message is capped at Slack's 50-block `chat.postMessage` limit:
/// projects are rendered until the budget is hit, then a "+N more projects"
/// notice is appended (a large multi-project workspace fits ~8 projects).
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

    // Slack `header` text caps at 150 chars; carousel caps at 10 cards.
    const HEADER_MAX: usize = 150;
    const CARD_TITLE_MAX: usize = 150;
    const CARD_BODY_MAX: usize = 200;
    const MAX_CARDS: usize = 10;

    let mut blocks = vec![
        json!({
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": truncate_chars(&format!(":bar_chart: {}", title), HEADER_MAX),
                "emoji": true
            }
        }),
        json!({
            "type": "context",
            "elements": [{ "type": "mrkdwn", "text": overview }]
        }),
    ];

    // Slack `chat.postMessage` rejects a message with more than 50 blocks, so a
    // multi-project report must stay under that cap or the whole report fails to
    // deliver. Build each project's blocks into a scratch Vec, and only commit it
    // if it fits — reserving one block for the "+N more projects" notice whenever
    // more projects remain. A single project always fits (its blocks + the 2 header
    // blocks are well under 50).
    const MAX_BLOCKS: usize = 50;
    let total_projects = report.projects.len();
    let mut rendered = 0usize;

    for project in &report.projects {
        let mut pb: Vec<serde_json::Value> = vec![
            json!({"type": "divider"}),
            json!({
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": truncate_chars(&project.project_name, HEADER_MAX),
                    "emoji": true
                }
            }),
        ];

        // Stat line: per-signal counts, e.g. "*Failure Detector* 21 events · *Latency Spike* 7 events".
        let stat_line = project
            .signal_event_counts
            .iter()
            .map(|(name, count)| {
                format!(
                    "*{}* {} {}",
                    name,
                    count,
                    if *count == 1 { "event" } else { "events" }
                )
            })
            .collect::<Vec<_>>()
            .join(" · ");
        if !stat_line.is_empty() {
            pb.push(json!({
                "type": "context",
                "elements": [{ "type": "mrkdwn", "text": stat_line }]
            }));
        }

        if !project.ai_summary.is_empty() {
            pb.push(json!({
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": truncate_to_slack_section_limit(&format!("*Summary*\n{}", project.ai_summary))
                }
            }));
        }

        if !project.noteworthy_events.is_empty() {
            pb.push(json!({
                "type": "section",
                "text": { "type": "mrkdwn", "text": "*Noteworthy events*" }
            }));

            let cards: Vec<serde_json::Value> = project
                .noteworthy_events
                .iter()
                .take(MAX_CARDS)
                .enumerate()
                .map(|(i, event)| {
                    let trace_link = with_utm(
                        &format!(
                            "{}/project/{}/traces/{}?chat=true",
                            base, project.project_id, event.trace_id,
                        ),
                        "slack",
                        "signals_report",
                        "view_trace",
                    );
                    json!({
                        "type": "card",
                        "title": { "type": "mrkdwn", "text": truncate_chars(&event.signal_name, CARD_TITLE_MAX) },
                        "subtitle": { "type": "mrkdwn", "text": format!("{} · {}", severity_circle(event.severity), event.timestamp) },
                        "body": { "type": "mrkdwn", "text": truncate_chars(&event.summary, CARD_BODY_MAX) },
                        "actions": [{
                            "type": "button",
                            "text": { "type": "plain_text", "text": "View trace", "emoji": true },
                            "url": trace_link,
                            "action_id": format!("view_trace_{}", i),
                            "style": "primary"
                        }]
                    })
                })
                .collect();
            pb.push(json!({ "type": "carousel", "elements": cards }));

            if project.noteworthy_events.len() > MAX_CARDS {
                let more = project.noteworthy_events.len() - MAX_CARDS;
                let signals_link = with_utm(
                    &format!("{}/project/{}/signals", base, project.project_id),
                    "slack",
                    "signals_report",
                    "more_events",
                );
                pb.push(json!({
                    "type": "context",
                    "elements": [{
                        "type": "mrkdwn",
                        "text": format!("+{} more · <{}|Open in Signals>", more, signals_link)
                    }]
                }));
            }
        }

        // Reserve a block for the truncation notice while projects remain.
        let reserve = if total_projects - rendered > 1 { 1 } else { 0 };
        if blocks.len() + pb.len() + reserve > MAX_BLOCKS {
            break;
        }
        blocks.extend(pb);
        rendered += 1;
    }

    if rendered < total_projects {
        let omitted = total_projects - rendered;
        blocks.push(json!({
            "type": "context",
            "elements": [{
                "type": "mrkdwn",
                "text": format!(
                    "_+{} more project{} not shown (a Slack message is capped at 50 blocks)._",
                    omitted,
                    if omitted == 1 { "" } else { "s" }
                )
            }]
        }));
    }

    json!(blocks)
}
