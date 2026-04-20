//! Email formatting for all notification types.
//!
//! This module is responsible for rendering HTML emails on the consumer side,
//! based on the structured `NotificationKind` data. When a delivery message
//! contains multiple notifications (e.g. a report with per-project entries),
//! they are combined into a single email.

use uuid::Uuid;

use super::NotificationKind;
use super::utils::{build_report_data_from_batch, with_utm};
use crate::reports::email_template::ReportData;

const REPORT_FROM_EMAIL: &str = "Laminar <reports@mail.lmnr.ai>";
const ALERT_FROM_EMAIL: &str = "Laminar <alerts@mail.lmnr.ai>";
const USAGE_WARNING_FROM_EMAIL: &str = "Laminar <usage@mail.lmnr.ai>";

#[derive(Default)]
pub struct EmailContent {
    pub from: String,
    pub subject: String,
    pub html: String,
}

const LAMINAR_LOGO_CID: &str = "laminar-logo";
/// Primary brand color (#D0754E)
const PRIMARY: &str = "#D0754E";

/// Format an email for a batch of notifications.
///
/// All notifications in the batch are expected to be of the same kind.
/// Reports are rendered by combining per-project data into a single email.
/// Alerts and usage warnings use the first (and only) notification.
pub fn format_email_batch(notifications: &[NotificationKind], workspace_id: &Uuid) -> EmailContent {
    let Some(first) = notifications.first() else {
        return EmailContent::default();
    };

    match first {
        NotificationKind::EventIdentification {
            project_id,
            signal_id,
            trace_id,
            event_name,
            severity,
            extracted_information,
            alert_name,
            event_id,
        } => {
            let trace_link = with_utm(
                &format!(
                    "https://lmnr.ai/project/{}/traces/{}?chat=true",
                    project_id, trace_id
                ),
                "email",
                "signal_alert",
                "view_trace",
            );
            let attributes = extracted_information
                .clone()
                .unwrap_or(serde_json::Value::Object(Default::default()));
            let severity_label = severity_label(*severity);
            EmailContent {
                from: ALERT_FROM_EMAIL.to_string(),
                subject: format!("{}: {} event", event_name, severity_label),
                html: render_alert_email(
                    event_name,
                    &attributes,
                    &trace_link,
                    project_id,
                    signal_id,
                    *severity,
                    alert_name,
                    event_id.as_ref(),
                ),
            }
        }
        NotificationKind::SignalsReport { .. } => {
            let (title, report_data) = build_report_data_from_batch(notifications, *workspace_id)
                .expect("SignalsReport batch must contain at least one report");
            EmailContent {
                from: REPORT_FROM_EMAIL.to_string(),
                subject: title,
                html: render_report_email(&report_data),
            }
        }
        NotificationKind::UsageWarning {
            workspace_name,
            usage_label,
            formatted_limit,
            usage_item,
        } => EmailContent {
            from: USAGE_WARNING_FROM_EMAIL.to_string(),
            subject: format!(
                "Usage warning: {} reached {} \u{2013} {}",
                usage_label, formatted_limit, workspace_name
            ),
            html: render_usage_warning_email(
                workspace_name,
                *workspace_id,
                usage_item,
                formatted_limit,
                usage_label,
            ),
        },
    }
}

// ── Alert email ──

/// Human-readable severity label for an alert notification severity level.
fn severity_label(severity: u8) -> &'static str {
    match severity {
        0 => "Info",
        1 => "Warning",
        2 => "Critical",
        _ => "Unknown",
    }
}

/// Hex color matching the severity dot used in the Slack message.
fn severity_color(severity: u8) -> &'static str {
    match severity {
        0 => "#10b981", // green
        1 => "#f59e0b", // orange
        2 => "#ef4444", // red
        _ => "#9ca3af",
    }
}

/// Render an HTML email for an alert notification.
fn render_alert_email(
    event_name: &str,
    attributes: &serde_json::Value,
    trace_link: &str,
    project_id: &Uuid,
    signal_id: &Uuid,
    severity: u8,
    alert_name: &str,
    event_id: Option<&Uuid>,
) -> String {
    let severity_label = severity_label(severity);
    let severity_color = severity_color(severity);
    let alert_link = with_utm(
        &format!("https://lmnr.ai/project/{}/settings?tab=alerts", project_id),
        "email",
        "signal_alert",
        "manage_alert",
    );
    let similar_events_part = match event_id {
        Some(eid) => {
            let similar_link = with_utm(
                &format!(
                    "https://lmnr.ai/project/{}/signals/{}?eventCluster={}",
                    project_id, signal_id, eid
                ),
                "email",
                "signal_alert",
                "similar_events",
            );
            format!(
                r#"<span style="vertical-align:middle;">&nbsp;·&nbsp;Similar events: <a href="{link}" style="color:{primary};text-decoration:none;">View</a></span>"#,
                link = similar_link,
                primary = PRIMARY,
            )
        }
        None => String::new(),
    };
    let context_html = format!(
        r##"<div style="text-align:center;margin-top:14px;font-size:12px;color:#9ca3af;line-height:1.6;">
  <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:{severity_color};margin-right:5px;vertical-align:middle;"></span><span style="vertical-align:middle;">{severity_label}</span><span style="vertical-align:middle;">&nbsp;·&nbsp;Alert: <a href="{alert_link}" style="color:{primary};text-decoration:none;">{alert_name}</a></span>{similar_events_part}
</div>"##,
        severity_color = severity_color,
        severity_label = severity_label,
        alert_link = alert_link,
        alert_name = html_escape(alert_name),
        similar_events_part = similar_events_part,
        primary = PRIMARY,
    );

    let attributes_html = if let Some(obj) = attributes.as_object() {
        if obj.is_empty() {
            String::new()
        } else {
            let rows: Vec<String> = obj
                .iter()
                .map(|(key, value)| {
                    let formatted_value = match value {
                        serde_json::Value::String(s) => html_escape(s),
                        serde_json::Value::Null => String::new(),
                        _ => html_escape(
                            &serde_json::to_string_pretty(value).unwrap_or_default(),
                        ),
                    };
                    format!(
                        r#"<tr>
  <td style="padding:6px 0;font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6;vertical-align:top;">{key}</td>
  <td style="padding:6px 0 6px 12px;font-size:13px;color:#111827;border-bottom:1px solid #f3f4f6;">{value}</td>
</tr>"#,
                        key = html_escape(key),
                        value = formatted_value,
                    )
                })
                .collect();
            format!(
                r#"<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:20px;">
  <h3 style="margin:0 0 12px;font-size:14px;font-weight:600;color:#6b7280;">Details</h3>
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    {}
  </table>
</div>"#,
                rows.join("\n    ")
            )
        }
    } else {
        String::new()
    };

    let manage_prefs_link = with_utm(
        &format!("https://lmnr.ai/project/{}/settings?tab=alerts", project_id),
        "email",
        "signal_alert",
        "manage_preferences",
    );

    format!(
        r##"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>{event_name}: {severity_label} event</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:640px;margin:0 auto;padding:24px 16px;">

  <div style="background:#0A0A0A;border-radius:10px;padding:28px 24px;margin-bottom:20px;">
    <img src="cid:laminar-logo" alt="Laminar" width="120" height="21" style="display:block;margin-bottom:16px;" />
    <p style="margin:0 0 6px;font-size:13px;color:#9ca3af;">New event for signal</p>
    <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">{event_name}</h1>
  </div>

  <div style="background:#ffffff;border-radius:10px;border:1px solid #e5e7eb;padding:24px;margin-bottom:20px;">
    {attributes_html}
    <div style="text-align:center;padding-top:8px;">
      <a href="{trace_link}" style="display:inline-block;background:#D0754E;color:#ffffff;text-decoration:none;padding:10px 24px;border-radius:6px;font-size:14px;font-weight:600;">View Trace</a>
    </div>
    {context_html}
  </div>

  <div style="text-align:center;padding:16px 0;">
    <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">This alert was generated automatically by <a href="https://www.lmnr.ai" style="color:#D0754E;text-decoration:none;">Laminar</a>.</p>
    <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">You are receiving this because you are subscribed to alerts for this project.</p>
    <p style="margin:0;font-size:12px;color:#9ca3af;"><a href="{manage_prefs_link}" style="color:#D0754E;text-decoration:none;">Manage alert preferences</a></p>
  </div>

</div>
</body>
</html>"##,
        event_name = html_escape(event_name),
        severity_label = severity_label,
        attributes_html = attributes_html,
        trace_link = trace_link,
        manage_prefs_link = manage_prefs_link,
        context_html = context_html,
    )
}

/// Render an HTML email for a usage warning notification.
fn render_usage_warning_email(
    workspace_name: &str,
    workspace_id: Uuid,
    usage_item: &str,
    formatted_limit: &str,
    usage_label: &str,
) -> String {
    let meter_description = match usage_item {
        "bytes" => "data ingested",
        "signal_runs" => "signal runs used",
        _ => "usage",
    };

    let view_usage_link = with_utm(
        &format!("https://lmnr.ai/workspace/{}?tab=usage", workspace_id),
        "email",
        "usage_warning",
        "view_usage",
    );
    let manage_thresholds_link = with_utm(
        &format!("https://lmnr.ai/workspace/{}?tab=usage", workspace_id),
        "email",
        "usage_warning",
        "manage_thresholds",
    );

    format!(
        r##"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Usage Warning – {workspace_name}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:640px;margin:0 auto;padding:24px 16px;">

  <!-- Header -->
  <div style="background:#0A0A0A;border-radius:10px;padding:28px 24px;margin-bottom:20px;">
    <img src="cid:laminar-logo" alt="Laminar" width="120" height="21" style="display:block;margin-bottom:16px;" />
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;">Usage Warning</h1>
    <p style="margin:0;font-size:16px;color:#D0754E;">{usage_label} threshold reached</p>
  </div>

  <!-- Content -->
  <div style="background:#ffffff;border-radius:10px;border:1px solid #e5e7eb;padding:24px;margin-bottom:20px;">
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
      Your workspace <strong>{workspace_name}</strong> has reached <strong>{formatted_limit}</strong> of {meter_description} in the current billing cycle.
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
      This is a warning notification you configured. No action is required unless you want to adjust your usage or limits.
    </p>
    <div style="text-align:center;padding-top:8px;">
      <a href="{view_usage_link}" style="display:inline-block;background:#D0754E;color:#ffffff;text-decoration:none;padding:10px 24px;border-radius:6px;font-size:14px;font-weight:600;">View Usage</a>
    </div>
  </div>

  <!-- Footer -->
  <div style="text-align:center;padding:16px 0;">
    <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">This notification was generated automatically by <a href="https://www.lmnr.ai" style="color:#D0754E;text-decoration:none;">Laminar</a>.</p>
    <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">You are receiving this because you are the owner of the {workspace_name} workspace.</p>
    <p style="margin:0;font-size:12px;color:#9ca3af;"><a href="{manage_thresholds_link}" style="color:#D0754E;text-decoration:none;">Manage warning thresholds</a></p>
  </div>

</div>
</body>
</html>"##,
        workspace_name = html_escape(workspace_name),
        usage_label = html_escape(usage_label),
        formatted_limit = html_escape(formatted_limit),
        meter_description = meter_description,
        view_usage_link = view_usage_link,
        manage_thresholds_link = manage_thresholds_link,
    )
}

/// Render an HTML email for a signals report notification.
fn render_report_email(data: &ReportData) -> String {
    let mut projects_html = String::new();

    for project in &data.projects {
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

                let trace_link = with_utm(
                    &format!(
                        "https://lmnr.ai/project/{}/traces/{}?chat=true",
                        project.project_id,
                        html_escape(&event.trace_id),
                    ),
                    "email",
                    "signals_report",
                    "view_trace",
                );
                events_html.push_str(&format!(
                    r##"<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px;margin-bottom:8px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:4px;"><tr>
    <td style="font-size:12px;color:#6b7280;" align="left">{signal_name} &middot; {timestamp}</td>
    <td style="font-size:12px;" align="right"><a href="{trace_link}" style="color:{primary};text-decoration:none;">View trace &rarr;</a></td>
  </tr></table>{summary}
</div>"##,
                    signal_name = html_escape(&event.signal_name),
                    timestamp = html_escape(&event.timestamp),
                    trace_link = trace_link,
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

    let unsubscribe_link = with_utm(
        &format!(
            "https://lmnr.ai/workspace/{}?tab=reports",
            data.workspace_id
        ),
        "email",
        "signals_report",
        "unsubscribe",
    );

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
    <p style="margin:0;font-size:12px;color:#9ca3af;"><a href="{unsubscribe_link}" style="color:{primary};text-decoration:none;">Unsubscribe</a></p>
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
        logo_cid = LAMINAR_LOGO_CID,
        unsubscribe_link = unsubscribe_link,
    )
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#x27;")
}
