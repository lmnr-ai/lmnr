use serde_json::json;

use super::rich_text::{cell, link_run, markdown_link_runs, text_cell, text_run};
use super::truncate_to_slack_section_limit;
use crate::notifications::utils::{frontend_url_slack, inject_utm_into_links, with_utm};
use crate::reports::ReportData;
use crate::utils::truncate_chars;

/// Severity emoji: 0 = Info (ℹ️), 1 = Warning (🟠), 2 = Critical (🔴).
fn severity_emoji(severity: u8) -> &'static str {
    match severity {
        0 => "ℹ️",
        1 => "🟠",
        2 => "🔴",
        _ => "",
    }
}

/// Format Slack message blocks for a signals report notification.
///
/// Layout: an H1 `markdown` title + overview, then per project an H2 `markdown`
/// heading, a per-signal stat line, the AI summary, and a two-column `table` of
/// noteworthy events (Signal + wrapped Summary). Events beyond `MAX_EVENTS` are
/// surfaced as a "+N more" link to the signals page.
///
/// The whole message is capped at Slack's 50-block `chat.postMessage` limit:
/// projects are rendered until the budget is hit, then a "+N more projects"
/// notice is appended.
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

    // Truncation guards: heading text and per-event fields.
    const HEADER_MAX: usize = 150;
    const SIGNAL_MAX: usize = 120;
    const SUMMARY_MAX: usize = 2000;
    // Noteworthy events shown per project before a "+N more" link (the table is a single
    // block regardless of row count; this cap is for readability, not the block budget).
    const MAX_EVENTS: usize = 10;

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
                "type": "markdown",
                "text": format!("## {}", truncate_chars(&project.project_name, HEADER_MAX))
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
                // Cap the concatenated per-signal counts — a project with many signals could
                // otherwise overflow Slack's context text limit and fail the whole postMessage.
                "elements": [{ "type": "mrkdwn", "text": truncate_to_slack_section_limit(&stat_line) }]
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

            // Two-column table: Signal (severity emoji + bold name) | Summary (wrapped),
            // where the summary cell ends with a blank-line gap then an italic timestamp
            // and a "View trace" link. Table cells accept only rich_text — no buttons.
            let mut rows: Vec<serde_json::Value> = vec![json!([
                text_cell("Signal", true, false),
                text_cell("Summary", true, false)
            ])];

            for event in project.noteworthy_events.iter().take(MAX_EVENTS) {
                let trace_link = with_utm(
                    &format!(
                        "{}/project/{}/traces/{}?chat=true",
                        base, project.project_id, event.trace_id,
                    ),
                    "slack",
                    "signals_report",
                    "view_trace",
                );

                let signal_cell = cell(vec![
                    text_run(
                        &format!("{} ", severity_emoji(event.severity)),
                        false,
                        false,
                    ),
                    text_run(&truncate_chars(&event.signal_name, SIGNAL_MAX), true, false),
                ]);

                // Summary may carry markdown links (kept clickable), then a blank-line gap,
                // an italic timestamp, and the trace link.
                let summary = inject_utm_into_links(
                    &truncate_chars(&event.summary, SUMMARY_MAX),
                    "slack",
                    "signals_report",
                    "event_description",
                );
                let mut summary_runs = markdown_link_runs(&summary);
                summary_runs.push(text_run("\n\n", false, false));
                summary_runs.push(text_run(&event.timestamp, false, true));
                summary_runs.push(text_run(" · ", false, false));
                summary_runs.push(link_run(&trace_link, "View trace"));

                rows.push(json!([signal_cell, cell(summary_runs)]));
            }

            pb.push(json!({
                "type": "table",
                "column_settings": [{ "is_wrapped": false }, { "is_wrapped": true }],
                "rows": rows
            }));

            if project.noteworthy_events.len() > MAX_EVENTS {
                let more = project.noteworthy_events.len() - MAX_EVENTS;
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
