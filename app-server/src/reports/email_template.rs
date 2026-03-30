use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A noteworthy signal event highlighted by the AI summary, shown with full details.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct NoteworthyEvent {
    pub signal_name: String,
    pub summary: String,
    pub timestamp: String,
    pub trace_id: String,
}

/// Data for a single project section in the report
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProjectReportData {
    pub project_name: String,
    pub project_id: Uuid,
    /// Map of signal_name -> total event count in period
    pub signal_event_counts: BTreeMap<String, u64>,
    /// AI-generated summary for this project's signals
    pub ai_summary: String,
    /// Noteworthy events selected by the AI summary
    pub noteworthy_events: Vec<NoteworthyEvent>,
}

/// Full report data for rendering
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ReportData {
    pub workspace_id: Uuid,
    pub workspace_name: String,
    pub period_label: String,
    pub period_start: String,
    pub period_end: String,
    pub projects: Vec<ProjectReportData>,
    pub total_events: u64,
}

const LAMINAR_LOGO_CID: &str = "laminar-logo";

/// Primary brand color (#D0754E)
const PRIMARY: &str = "#D0754E";

pub fn render_report_email(data: &ReportData) -> String {
    let mut projects_html = String::new();

    for project in &data.projects {
        // Build summary table for this project: signal name -> count
        let mut summary_rows = String::new();
        let project_total: u64 = project.signal_event_counts.values().sum();
        for (signal_name, count) in &project.signal_event_counts {
            summary_rows.push_str(&format!(
                r##"<tr>
  <td style="padding:6px 0;font-size:14px;color:#111827;border-bottom:1px solid #f3f4f6;">{signal_name}</td>
  <td style="padding:6px 0;font-size:14px;font-weight:600;color:{primary};text-align:right;border-bottom:1px solid #f3f4f6;">{count}</td>
</tr>"##,
                signal_name = html_escape(signal_name),
                count = count,
                primary = PRIMARY,
            ));
        }

        let summary_section = format!(
            r##"<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:20px;">
  <h3 style="margin:0 0 12px;font-size:14px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Signal Overview</h3>
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td style="padding:6px 0;font-size:12px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;">Signal</td>
      <td style="padding:6px 0;font-size:12px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;text-align:right;border-bottom:1px solid #e5e7eb;">Events</td>
    </tr>
    {summary_rows}
    <tr>
      <td style="padding:8px 0;font-size:14px;font-weight:700;color:#111827;">Total</td>
      <td style="padding:8px 0;font-size:14px;font-weight:700;color:{primary};text-align:right;">{project_total}</td>
    </tr>
  </table>
</div>"##,
            summary_rows = summary_rows,
            project_total = project_total,
            primary = PRIMARY,
        );

        // Per-project AI summary
        let ai_summary_html = if project.ai_summary.is_empty() {
            String::new()
        } else {
            format!(
                r##"<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:20px;">
  <h3 style="margin:0 0 8px;font-size:14px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Summary</h3>
  <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">{ai_summary}</p>
</div>"##,
                ai_summary = html_escape(&project.ai_summary),
            )
        };

        // Noteworthy events section (selected by AI)
        let noteworthy_html = if project.noteworthy_events.is_empty() {
            String::new()
        } else {
            let mut events_html = String::new();
            for event in &project.noteworthy_events {
                let summary_part = if event.summary.is_empty() {
                    String::new()
                } else {
                    format!(
                        r#"<div style="margin-top:4px;color:#374151;font-size:13px;">{}</div>"#,
                        html_escape(&event.summary)
                    )
                };

                events_html.push_str(&format!(
                    r##"<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px;margin-bottom:8px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:4px;"><tr>
    <td style="font-size:12px;color:#6b7280;" align="left">{signal_name} &middot; {timestamp}</td>
    <td style="font-size:12px;" align="right"><a href="https://laminar.sh/project/{project_id}/traces/{trace_id}" style="color:{primary};text-decoration:none;">View trace &rarr;</a></td>
  </tr></table>{summary}
</div>"##,
                    signal_name = html_escape(&event.signal_name),
                    timestamp = html_escape(&event.timestamp),
                    project_id = project.project_id,
                    trace_id = html_escape(&event.trace_id),
                    summary = summary_part,
                    primary = PRIMARY,
                ));
            }

            format!(
                r##"<div style="margin-bottom:20px;">
  <h3 style="margin:0 0 12px;font-size:14px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Noteworthy Events</h3>
  {events_html}
</div>"##,
                events_html = events_html,
            )
        };

        projects_html.push_str(&format!(
            r##"<div style="margin-bottom:28px;">
  <div style="border-bottom:1px solid #e5e7eb;padding-bottom:8px;margin-bottom:16px;">
    <h2 style="margin:0;font-size:17px;font-weight:600;color:#111827;">{project_name}</h2>
  </div>
  {summary_section}
  {ai_summary_html}
  {noteworthy_html}
</div>"##,
            project_name = html_escape(&project.project_name),
            summary_section = summary_section,
            ai_summary_html = ai_summary_html,
            noteworthy_html = noteworthy_html,
        ));
    }

    if projects_html.is_empty() {
        projects_html = r#"<p style="color:#9ca3af;font-size:14px;text-align:center;padding:24px 0;">No projects with signal activity found.</p>"#.to_string();
    }

    format!(
        r##"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Signals Report – {workspace_name}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:640px;margin:0 auto;padding:24px 16px;">

  <!-- Header -->
  <div style="background:#0A0A0A;border-radius:10px;padding:28px 24px;margin-bottom:20px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;"><tr>
      <td style="vertical-align:middle;">
        <img src="cid:{logo_cid}" alt="Laminar" width="120" height="21" style="display:block;" />
      </td>
      <td style="vertical-align:middle;text-align:right;">
        <p style="margin:0 0 2px;font-size:13px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Total Events</p>
        <p style="margin:0;font-size:32px;font-weight:700;color:#ffffff;">{total_events}</p>
      </td>
    </tr></table>
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;">Signals Report</h1>
    <p style="margin:0 0 4px;font-size:14px;color:#9ca3af;">{workspace_name} &middot; {period_label}</p>
    <p style="margin:0;font-size:13px;color:#6b7280;">{period_start} &ndash; {period_end}</p>
  </div>

  <!-- Projects -->
  <div style="background:#ffffff;border-radius:10px;border:1px solid #e5e7eb;padding:24px;margin-bottom:20px;">
    {projects_html}
  </div>

  <!-- Footer -->
  <div style="text-align:center;padding:16px 0;">
    <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">This report was generated automatically by <a href="https://www.lmnr.ai" style="color:{primary};text-decoration:none;">Laminar</a>.</p>
    <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">You are receiving this because you are subscribed to reports for the {workspace_name} workspace.</p>
    <p style="margin:0;font-size:12px;color:#9ca3af;"><a href="https://lmnr.ai/workspace/{workspace_id}?tab=reports" style="color:{primary};text-decoration:none;">Unsubscribe</a></p>
  </div>

</div>
</body>
</html>"##,
        workspace_id = data.workspace_id,
        workspace_name = html_escape(&data.workspace_name),
        period_label = html_escape(&data.period_label),
        period_start = html_escape(&data.period_start),
        period_end = html_escape(&data.period_end),
        total_events = data.total_events,
        projects_html = projects_html,
        primary = PRIMARY,
        logo_cid = LAMINAR_LOGO_CID,
    )
}

pub fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#x27;")
}
