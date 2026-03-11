use std::collections::HashMap;

use uuid::Uuid;

/// Represents a single signal event sample for display in the report
pub struct SignalEventSample {
    pub signal_name: String,
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
    pub signals: HashMap<String, Vec<SignalEventSample>>,
    /// Map of signal_name -> total event count in period
    pub signal_event_counts: HashMap<String, u64>,
}

/// Full report data for rendering
pub struct ReportData {
    pub workspace_name: String,
    pub period_label: String,
    pub period_start: String,
    pub period_end: String,
    pub projects: Vec<ProjectReportData>,
    pub total_events: u64,
}

pub fn render_report_email(data: &ReportData) -> String {
    let mut projects_html = String::new();

    for project in &data.projects {
        let mut signals_html = String::new();

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
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
    <span style="font-size:12px;color:#6b7280;">{timestamp}</span>
    <a href="https://www.lmnr.ai/project/{project_id}/traces/{trace_id}" style="font-size:12px;color:#6366f1;text-decoration:none;">View trace &rarr;</a>
  </div>{summary}
  <pre style="background:#1f2937;color:#e5e7eb;padding:10px;border-radius:4px;font-size:12px;overflow-x:auto;margin-top:8px;white-space:pre-wrap;word-break:break-all;">{payload}</pre>
</div>"##,
                    timestamp = html_escape(&sample.timestamp),
                    project_id = project.project_id,
                    trace_id = html_escape(&sample.trace_id),
                    summary = summary_section,
                    payload = html_escape(&sample.payload),
                ));
            }

            signals_html.push_str(&format!(
                r##"<div style="margin-bottom:20px;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
    <h3 style="margin:0;font-size:15px;font-weight:600;color:#111827;">{signal_name}</h3>
    <span style="background:#eef2ff;color:#4f46e5;font-size:12px;font-weight:500;padding:2px 8px;border-radius:10px;">{count} event{s}</span>
  </div>
  {samples_html}
</div>"##,
                signal_name = html_escape(signal_name),
                count = count,
                s = if count == 1 { "" } else { "s" },
                samples_html = samples_html,
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
  {signals_html}
</div>"##,
            project_name = html_escape(&project.project_name),
            signals_html = signals_html,
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
<title>Signal Report – {workspace_name}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:640px;margin:0 auto;padding:24px 16px;">

  <!-- Header -->
  <div style="background:#ffffff;border-radius:10px;border:1px solid #e5e7eb;padding:28px 24px;margin-bottom:20px;">
    <div style="display:flex;align-items:center;margin-bottom:16px;">
      <div style="background:#4f46e5;width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;margin-right:12px;">
        <span style="color:#ffffff;font-weight:700;font-size:16px;">L</span>
      </div>
      <span style="font-size:18px;font-weight:700;color:#111827;">Laminar</span>
    </div>
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Signal Report</h1>
    <p style="margin:0 0 4px;font-size:14px;color:#6b7280;">{workspace_name} &middot; {period_label}</p>
    <p style="margin:0;font-size:13px;color:#9ca3af;">{period_start} &ndash; {period_end}</p>
  </div>

  <!-- Summary -->
  <div style="background:#ffffff;border-radius:10px;border:1px solid #e5e7eb;padding:20px 24px;margin-bottom:20px;text-align:center;">
    <p style="margin:0 0 4px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Total Events</p>
    <p style="margin:0;font-size:32px;font-weight:700;color:#4f46e5;">{total_events}</p>
  </div>

  <!-- Projects -->
  <div style="background:#ffffff;border-radius:10px;border:1px solid #e5e7eb;padding:24px;margin-bottom:20px;">
    {projects_html}
  </div>

  <!-- Footer -->
  <div style="text-align:center;padding:16px 0;">
    <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">This report was generated automatically by <a href="https://www.lmnr.ai" style="color:#6366f1;text-decoration:none;">Laminar</a>.</p>
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
    )
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#x27;")
}
