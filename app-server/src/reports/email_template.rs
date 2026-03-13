use std::collections::BTreeMap;

use uuid::Uuid;

/// Represents a single signal event sample for display in the report
pub struct SignalEventSample {
    pub payload: String,
    pub summary: String,
    pub timestamp: String,
    pub trace_id: String,
}

/// A noteworthy signal event highlighted by the AI summary, shown with full details.
pub struct NoteworthyEvent {
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
    pub signals: BTreeMap<String, Vec<SignalEventSample>>,
    /// Map of signal_name -> total event count in period
    pub signal_event_counts: BTreeMap<String, u64>,
    /// AI-generated summary for this project's signals
    pub ai_summary: String,
    /// Noteworthy events selected by the AI summary
    pub noteworthy_events: Vec<NoteworthyEvent>,
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

/// Laminar wordmark logo SVG (from frontend/assets/logo/logo.svg)
const LAMINAR_LOGO_SVG: &str = r#"<svg width="120" height="21" viewBox="0 0 532 94" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M102.308 0.901855V91.9999H118.814V0.901855H102.308ZM142.637 89.1019C147.089 91.8739 152.087 93.2599 157.631 93.2599C161.999 93.2599 165.905 92.3779 169.349 90.6139C171.638 89.3853 173.612 87.8783 175.271 86.0929V91.9999H191.651V31.1419H175.271V36.9926C173.612 35.1888 171.638 33.7006 169.349 32.5279C165.905 30.7639 161.999 29.8819 157.631 29.8819C152.087 29.8819 147.089 31.2679 142.637 34.0399C138.185 36.8119 134.699 40.5919 132.179 45.3799C129.659 50.1679 128.399 55.5859 128.399 61.6339C128.399 67.5979 129.659 72.9739 132.179 77.7619C134.699 82.5499 138.185 86.3299 142.637 89.1019ZM171.869 73.4779C169.013 76.5019 165.275 78.0139 160.655 78.0139C157.631 78.0139 154.943 77.3419 152.591 75.9979C150.323 74.5699 148.517 72.6379 147.173 70.2019C145.913 67.6819 145.283 64.7839 145.283 61.5079C145.283 58.3159 145.913 55.5019 147.173 53.0659C148.517 50.5459 150.323 48.6139 152.591 47.2699C154.943 45.8419 157.631 45.1279 160.655 45.1279C163.763 45.1279 166.451 45.8419 168.719 47.2699C171.071 48.6139 172.877 50.5459 174.137 53.0659C175.481 55.5019 176.153 58.3159 176.153 61.5079C176.153 66.3799 174.725 70.3699 171.869 73.4779ZM204.993 31.1419V91.9999H221.499V56.0899C221.499 53.7379 222.003 51.7219 223.011 50.0419C224.019 48.3619 225.405 47.1019 227.169 46.2619C228.933 45.3379 230.907 44.8759 233.091 44.8759C236.367 44.8759 239.097 45.8839 241.281 47.8999C243.549 49.8319 244.683 52.5619 244.683 56.0899V91.9999H261.189V56.0899C261.189 53.7379 261.693 51.7219 262.701 50.0419C263.709 48.3619 265.095 47.1019 266.859 46.2619C268.707 45.3379 270.681 44.8759 272.781 44.8759C276.057 44.8759 278.787 45.8839 280.971 47.8999C283.239 49.8319 284.373 52.5619 284.373 56.0899V91.9999H300.879V53.4439C300.879 48.5719 299.829 44.3719 297.729 40.8439C295.629 37.3159 292.773 34.6279 289.161 32.7799C285.549 30.8479 281.475 29.8819 276.939 29.8819C272.403 29.8819 268.287 30.8899 264.591 32.9059C261.652 34.442 259.165 36.5091 257.129 39.1072C255.246 36.4377 252.861 34.3285 249.975 32.7799C246.531 30.8479 242.709 29.8819 238.509 29.8819C234.057 29.8819 230.067 30.8479 226.539 32.7799C224.656 33.7665 222.976 34.9805 221.499 36.422V31.1419H204.993ZM312.999 31.1419V91.9999H329.631V31.1419H312.999ZM314.637 18.6679C316.401 20.4319 318.627 21.3139 321.315 21.3139C324.087 21.3139 326.313 20.4319 327.993 18.6679C329.757 16.8199 330.639 14.5519 330.639 11.8639C330.639 9.25986 329.757 7.03386 327.993 5.18586C326.313 3.33786 324.087 2.41386 321.315 2.41386C318.627 2.41386 316.401 3.33786 314.637 5.18586C312.873 7.03386 311.991 9.25986 311.991 11.8639C311.991 14.5519 312.873 16.8199 314.637 18.6679ZM383.943 57.0979V91.9999H400.449V53.4439C400.449 49.3279 399.441 45.5059 397.425 41.9779C395.409 38.3659 392.637 35.4679 389.109 33.2839C385.581 31.0159 381.591 29.8819 377.139 29.8819C372.519 29.8819 368.361 30.8899 364.665 32.9059C362.725 33.9887 361.003 35.3018 359.499 36.8451V31.1419H342.993V91.9999H359.499V57.0979C359.499 54.6619 360.003 52.5199 361.011 50.6719C362.103 48.8239 363.573 47.3959 365.421 46.3879C367.269 45.3799 369.369 44.8759 371.721 44.8759C375.333 44.8759 378.273 46.0099 380.541 48.2779C382.809 50.5459 383.943 53.4859 383.943 57.0979ZM422.943 89.1019C427.395 91.8739 432.393 93.2599 437.937 93.2599C442.305 93.2599 446.211 92.3779 449.655 90.6139C451.944 89.3853 453.918 87.8784 455.577 86.093V91.9999H471.957V31.1419H455.577V36.9926C453.918 35.1888 451.944 33.7006 449.655 32.5279C446.211 30.7639 442.305 29.8819 437.937 29.8819C432.393 29.8819 427.395 31.2679 422.943 34.0399C418.491 36.8119 415.005 40.5919 412.485 45.3799C409.965 50.1679 408.705 55.5859 408.705 61.6339C408.705 67.5979 409.965 72.9739 412.485 77.7619C415.005 82.5499 418.491 86.3299 422.943 89.1019ZM452.175 73.4779C449.319 76.5019 445.581 78.0139 440.961 78.0139C437.937 78.0139 435.249 77.3419 432.897 75.9979C430.629 74.5699 428.823 72.6379 427.479 70.2019C426.219 67.6819 425.589 64.7839 425.589 61.5079C425.589 58.3159 426.219 55.5019 427.479 53.0659C428.823 50.5459 430.629 48.6139 432.897 47.2699C435.249 45.8419 437.937 45.1279 440.961 45.1279C444.069 45.1279 446.757 45.8419 449.025 47.2699C451.377 48.6139 453.183 50.5459 454.443 53.0659C455.787 55.5019 456.459 58.3159 456.459 61.5079C456.459 66.3799 455.031 70.3699 452.175 73.4779ZM485.299 31.1419V91.9999H501.805V58.3579C501.805 53.8219 502.897 50.4619 505.081 48.2779C507.349 46.0099 510.247 44.8759 513.775 44.8759C515.455 44.8759 516.925 45.1279 518.185 45.6319C519.529 46.1359 520.663 46.8919 521.587 47.8999L531.919 36.0559C529.987 33.8719 527.845 32.3179 525.493 31.3939C523.141 30.3859 520.495 29.8819 517.555 29.8819C510.751 29.8819 505.543 32.0659 501.931 36.4339C501.889 36.4839 501.847 36.5342 501.805 36.5847V31.1419H485.299ZM0.653968 84.1461C0.0802819 85.9866 0.00220402 88.0862 1.32507 89.4885C2.78376 91.0347 4.85185 91.9999 7.14535 91.9999H37.1454C58.1322 91.9999 75.1454 74.9867 75.1454 53.9999C75.1454 33.013 58.1322 15.9999 37.1454 15.9999H7.14535C4.56777 15.9999 2.27491 17.2189 0.811824 19.1119C-0.266346 20.5068 -0.129499 22.4002 0.408998 24.079C3.48464 33.6675 5.14534 43.8898 5.14534 54.4999C5.14534 64.8247 3.57273 74.7823 0.653968 84.1461Z" fill="white"/></svg>"#;

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
    <td style="font-size:12px;" align="right"><a href="https://lmnr.ai/project/{project_id}/traces/{trace_id}" style="color:{primary};text-decoration:none;">View trace &rarr;</a></td>
  </tr></table>{summary}
  <pre style="background:#1f2937;color:#e5e7eb;padding:10px;border-radius:4px;font-size:12px;overflow-x:auto;margin-top:8px;white-space:pre-wrap;word-break:break-all;">{payload}</pre>
</div>"##,
                    signal_name = html_escape(&event.signal_name),
                    timestamp = html_escape(&event.timestamp),
                    project_id = project.project_id,
                    trace_id = html_escape(&event.trace_id),
                    summary = summary_part,
                    payload = html_escape(&event.payload),
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
    <td style="font-size:12px;" align="right"><a href="https://lmnr.ai/project/{project_id}/traces/{trace_id}" style="color:{primary};text-decoration:none;">View trace &rarr;</a></td>
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
  {ai_summary_html}
  {noteworthy_html}
  <h3 style="margin:0 0 12px;font-size:14px;font-weight:600;color:#6b7280;">Recent Samples</h3>
  {signals_html}
</div>"##,
            project_name = html_escape(&project.project_name),
            summary_section = summary_section,
            ai_summary_html = ai_summary_html,
            noteworthy_html = noteworthy_html,
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
  <div style="background:#0A0A0A;border-radius:10px;padding:28px 24px;margin-bottom:20px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;"><tr>
      <td style="vertical-align:middle;">
        {logo}
      </td>
      <td style="vertical-align:middle;text-align:right;">
        <p style="margin:0 0 2px;font-size:13px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Total Events</p>
        <p style="margin:0;font-size:32px;font-weight:700;color:#ffffff;">{total_events}</p>
      </td>
    </tr></table>
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;">Signal Report</h1>
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
    <p style="margin:0;font-size:12px;color:#9ca3af;">You are receiving this because you are subscribed to reports for the {workspace_name} workspace.</p>
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
    )
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#x27;")
}
