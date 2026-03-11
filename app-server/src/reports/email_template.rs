use std::collections::BTreeMap;

use uuid::Uuid;

/// Represents a single signal event sample for display in the report
pub struct SignalEventSample {
    pub payload: String,
    pub summary: String,
    pub timestamp: String,
    pub trace_id: String,
}

/// Data for a single project section in the report
pub struct ProjectReportData {
    pub project_name: String,
    pub project_id: Uuid,
    /// Map of signal_name -> Vec<SignalEventSample>
    pub signals: BTreeMap<String, Vec<SignalEventSample>>,
    /// Map of signal_name -> total event count in period
    pub signal_event_counts: BTreeMap<String, u64>,
}

/// Full report data for rendering
pub struct ReportData {
    pub workspace_name: String,
    pub period_label: String,
    pub period_start: String,
    pub period_end: String,
    pub projects: Vec<ProjectReportData>,
    pub total_events: u64,
    pub ai_summary: String,
}

/// Laminar logo as inline SVG (icon_light variant with horizontal lines)
const LAMINAR_LOGO_SVG: &str = r#"<svg width="32" height="32" viewBox="0 0 118 118" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M29 23.0659C29 21.9613 29.8954 21.0659 31 21.0659H67C87.9868 21.0659 105 38.0791 105 59.0659C105 59.7368 104.983 60.4036 104.948 61.0659H29V59.0659V23.0659ZM29 67.0659V73.0659H102.338C103.102 71.1383 103.713 69.1333 104.156 67.0659H29ZM29 79.0659H99.3171C97.9821 81.2186 96.4379 83.2281 94.713 85.0659H29V79.0659ZM29 91.0659V95.0659C29 96.1705 29.8954 97.0659 31 97.0659H67C74.551 97.0659 81.5877 94.8635 87.5026 91.0659H29Z" fill="white"/></svg>"#;

/// Primary brand color (#D0754E)
const PRIMARY: &str = "#D0754E";
/// Lighter tint for badges/backgrounds
const PRIMARY_LIGHT: &str = "#FDF0EB";
/// Darker shade for badge text
const PRIMARY_DARK: &str = "#A85A3A";

pub fn render_report_email(data: &ReportData) -> String {
    let mut projects_html = String::new();

    for project in &data.projects {
        let mut signals_html = String::new();

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

        for (signal_name, samples) in &project.signals {
            let count = project
                .signal_event_counts
                .get(signal_name)
                .copied()
                .unwrap_or(0);

            let mut samples_html = String::new();
            for sample in samples {
                let summary_section = if sample.summary.is_empty() {
                    String::new()
                } else {
                    format!(
                        r#"<div style="margin-top:4px;color:#374151;font-size:13px;">{}</div>"#,
                        html_escape(&sample.summary)
                    )
                };

                samples_html.push_str(&format!(
                    r##"<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px;margin-bottom:8px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:4px;"><tr>
    <td style="font-size:12px;color:#6b7280;" align="left">{timestamp}</td>
    <td style="font-size:12px;" align="right"><a href="https://www.lmnr.ai/project/{project_id}/traces/{trace_id}" style="color:{primary};text-decoration:none;">View trace &rarr;</a></td>
  </tr></table>{summary}
  <pre style="background:#1f2937;color:#e5e7eb;padding:10px;border-radius:4px;font-size:12px;overflow-x:auto;margin-top:8px;white-space:pre-wrap;word-break:break-all;">{payload}</pre>
</div>"##,
                    timestamp = html_escape(&sample.timestamp),
                    project_id = project.project_id,
                    trace_id = html_escape(&sample.trace_id),
                    summary = summary_section,
                    payload = html_escape(&sample.payload),
                    primary = PRIMARY,
                ));
            }

            signals_html.push_str(&format!(
                r##"<div style="margin-bottom:20px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px;"><tr>
    <td align="left" style="vertical-align:middle;"><h3 style="margin:0;font-size:15px;font-weight:600;color:#111827;">{signal_name}</h3></td>
    <td align="right" style="vertical-align:middle;"><span style="background:{primary_light};color:{primary_dark};font-size:12px;font-weight:500;padding:2px 8px;border-radius:10px;">{count} event{s}</span></td>
  </tr></table>
  {samples_html}
</div>"##,
                signal_name = html_escape(signal_name),
                count = count,
                s = if count == 1 { "" } else { "s" },
                samples_html = samples_html,
                primary_light = PRIMARY_LIGHT,
                primary_dark = PRIMARY_DARK,
            ));
        }

        if signals_html.is_empty() {
            signals_html = r#"<p style="color:#9ca3af;font-size:14px;text-align:center;padding:16px 0;">No signal events in this period.</p>"#.to_string();
        }

        projects_html.push_str(&format!(
            r##"<div style="margin-bottom:28px;">
  <div style="border-bottom:1px solid #e5e7eb;padding-bottom:8px;margin-bottom:16px;">
    <h2 style="margin:0;font-size:17px;font-weight:600;color:#111827;">{project_name}</h2>
  </div>
  {summary_section}
  <h3 style="margin:0 0 12px;font-size:14px;font-weight:600;color:#6b7280;">Recent Samples</h3>
  {signals_html}
</div>"##,
            project_name = html_escape(&project.project_name),
            summary_section = summary_section,
            signals_html = signals_html,
        ));
    }

    if projects_html.is_empty() {
        projects_html = r#"<p style="color:#9ca3af;font-size:14px;text-align:center;padding:24px 0;">No projects with signal activity found.</p>"#.to_string();
    }

    let ai_summary_html = if data.ai_summary.is_empty() {
        String::new()
    } else {
        format!(
            r##"
  <!-- AI Summary -->
  <div style="background:#ffffff;border-radius:10px;border:1px solid #e5e7eb;padding:20px 24px;margin-bottom:20px;">
    <h2 style="margin:0 0 12px;font-size:15px;font-weight:600;color:#111827;">Summary</h2>
    <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">{ai_summary}</p>
  </div>"##,
            ai_summary = html_escape(&data.ai_summary),
        )
    };

    format!(
        r##"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Signal Report – {workspace_name}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:640px;margin:0 auto;padding:24px 16px;">

  <!-- Header -->
  <div style="background:#ffffff;border-radius:10px;border:1px solid #e5e7eb;padding:28px 24px;margin-bottom:20px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;"><tr>
      <td style="vertical-align:middle;">
        <table cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="vertical-align:middle;padding-right:12px;">
            <div style="background:{primary};width:32px;height:32px;border-radius:8px;text-align:center;line-height:32px;">
              {logo}
            </div>
          </td>
          <td style="vertical-align:middle;"><span style="font-size:18px;font-weight:700;color:#111827;">Laminar</span></td>
        </tr></table>
      </td>
      <td style="vertical-align:middle;text-align:right;">
        <p style="margin:0 0 2px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Total Events</p>
        <p style="margin:0;font-size:32px;font-weight:700;color:{primary};">{total_events}</p>
      </td>
    </tr></table>
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Signal Report</h1>
    <p style="margin:0 0 4px;font-size:14px;color:#6b7280;">{workspace_name} &middot; {period_label}</p>
    <p style="margin:0;font-size:13px;color:#9ca3af;">{period_start} &ndash; {period_end}</p>
  </div>

  {ai_summary_html}

  <!-- Projects -->
  <div style="background:#ffffff;border-radius:10px;border:1px solid #e5e7eb;padding:24px;margin-bottom:20px;">
    {projects_html}
  </div>

  <!-- Footer -->
  <div style="text-align:center;padding:16px 0;">
    <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">This report was generated automatically by <a href="https://www.lmnr.ai" style="color:{primary};text-decoration:none;">Laminar</a>.</p>
    <p style="margin:0;font-size:12px;color:#9ca3af;">You are receiving this because you are a member of the {workspace_name} workspace.</p>
  </div>

</div>
</body>
</html>"##,
        workspace_name = html_escape(&data.workspace_name),
        period_label = html_escape(&data.period_label),
        period_start = html_escape(&data.period_start),
        period_end = html_escape(&data.period_end),
        total_events = data.total_events,
        projects_html = projects_html,
        primary = PRIMARY,
        logo = LAMINAR_LOGO_SVG,
        ai_summary_html = ai_summary_html,
    )
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#x27;")
}
