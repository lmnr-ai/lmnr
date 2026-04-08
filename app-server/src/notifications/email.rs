//! Email formatting for all notification types.
//!
//! This module is responsible for rendering HTML emails on the consumer side,
//! based on the structured `NotificationKind` data. When a delivery message
//! contains multiple notifications (e.g. a report with per-project entries),
//! they are combined into a single email.

use uuid::Uuid;

use super::NotificationKind;
use crate::reports::email_template::{self, html_escape};

const REPORT_FROM_EMAIL: &str = "Laminar <reports@mail.lmnr.ai>";
const ALERT_FROM_EMAIL: &str = "Laminar <alerts@mail.lmnr.ai>";
const USAGE_WARNING_FROM_EMAIL: &str = "Laminar <usage@mail.lmnr.ai>";

/// Format an email (from, subject, html) for a batch of notifications.
///
/// For single-element batches this behaves identically to the old per-notification
/// rendering. For multi-element batches (e.g. reports with per-project data) all
/// entries are combined into one email body.
pub fn format_email_batch(
    notifications: &[NotificationKind],
    workspace_id: &Uuid,
) -> (String, String, String) {
    // Single notification — delegate to the type-specific renderer.
    if notifications.len() == 1 {
        return format_single_email(&notifications[0], workspace_id);
    }

    // Multi-notification batch. Currently only reports produce multi-element
    // batches so we combine them into a single report email.
    // Collect all report data entries into one combined ReportData.
    let mut combined_report_data: Option<email_template::ReportData> = None;
    let mut title = String::new();

    for kind in notifications {
        if let NotificationKind::SignalsReport {
            report_data,
            title: t,
        } = kind
        {
            match combined_report_data.as_mut() {
                None => {
                    combined_report_data = Some(report_data.clone());
                    title = t.clone();
                }
                Some(existing) => {
                    // Merge project data from this report into the combined one.
                    existing.projects.extend(report_data.projects.clone());
                    existing.total_events += report_data.total_events;
                }
            }
        }
    }

    if let Some(report_data) = combined_report_data {
        let html = email_template::render_report_email(&report_data);
        return (REPORT_FROM_EMAIL.to_string(), title, html);
    }

    // Fallback: render only the first notification.
    format_single_email(&notifications[0], workspace_id)
}

/// Format an email for a single notification kind.
fn format_single_email(kind: &NotificationKind, workspace_id: &Uuid) -> (String, String, String) {
    match kind {
        NotificationKind::EventIdentification {
            project_id,
            trace_id,
            event_name,
            extracted_information,
        } => {
            let trace_link = format!(
                "https://lmnr.ai/project/{}/traces/{}?chat=true",
                project_id, trace_id
            );
            let subject = format!("Alert: {}", event_name);
            let attributes = extracted_information
                .clone()
                .unwrap_or(serde_json::Value::Object(Default::default()));
            let html = render_alert_email(event_name, &attributes, &trace_link);
            (ALERT_FROM_EMAIL.to_string(), subject, html)
        }
        NotificationKind::SignalsReport { report_data, title } => {
            let html = email_template::render_report_email(report_data);
            (REPORT_FROM_EMAIL.to_string(), title.clone(), html)
        }
        NotificationKind::UsageWarning {
            workspace_name,
            usage_label,
            formatted_limit,
            usage_item,
        } => {
            let subject = format!(
                "Usage warning: {} reached {} \u{2013} {}",
                usage_label, formatted_limit, workspace_name
            );
            let html = render_usage_warning_email(
                workspace_name,
                *workspace_id,
                usage_item,
                formatted_limit,
                usage_label,
            );
            (USAGE_WARNING_FROM_EMAIL.to_string(), subject, html)
        }
    }
}

// ── Alert email ──

/// Render a simple HTML email for an alert notification.
pub fn render_alert_email(
    event_name: &str,
    attributes: &serde_json::Value,
    trace_link: &str,
) -> String {
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
  <h3 style="margin:0 0 12px;font-size:14px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Details</h3>
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

    format!(
        r##"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Alert: {event_name}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:640px;margin:0 auto;padding:24px 16px;">

  <div style="background:#0A0A0A;border-radius:10px;padding:28px 24px;margin-bottom:20px;">
    <img src="cid:laminar-logo" alt="Laminar" width="120" height="21" style="display:block;margin-bottom:16px;" />
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;">Signal Event Alert</h1>
    <p style="margin:0;font-size:16px;color:#D0754E;">{event_name}</p>
  </div>

  <div style="background:#ffffff;border-radius:10px;border:1px solid #e5e7eb;padding:24px;margin-bottom:20px;">
    {attributes_html}
    <div style="text-align:center;padding-top:8px;">
      <a href="{trace_link}" style="display:inline-block;background:#D0754E;color:#ffffff;text-decoration:none;padding:10px 24px;border-radius:6px;font-size:14px;font-weight:600;">View Trace</a>
    </div>
  </div>

  <div style="text-align:center;padding:16px 0;">
    <p style="margin:0;font-size:12px;color:#9ca3af;">This alert was generated automatically by <a href="https://www.lmnr.ai" style="color:#D0754E;text-decoration:none;">Laminar</a>.</p>
  </div>

</div>
</body>
</html>"##,
        event_name = html_escape(event_name),
        attributes_html = attributes_html,
        trace_link = trace_link,
    )
}

// ── Usage warning email ──

/// Render an HTML email for a usage warning notification.
pub fn render_usage_warning_email(
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
      <a href="https://lmnr.ai/workspace/{workspace_id}?tab=usage" style="display:inline-block;background:#D0754E;color:#ffffff;text-decoration:none;padding:10px 24px;border-radius:6px;font-size:14px;font-weight:600;">View Usage</a>
    </div>
  </div>

  <!-- Footer -->
  <div style="text-align:center;padding:16px 0;">
    <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">This notification was generated automatically by <a href="https://www.lmnr.ai" style="color:#D0754E;text-decoration:none;">Laminar</a>.</p>
    <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">You are receiving this because you are the owner of the {workspace_name} workspace.</p>
    <p style="margin:0;font-size:12px;color:#9ca3af;"><a href="https://lmnr.ai/workspace/{workspace_id}?tab=usage" style="color:#D0754E;text-decoration:none;">Manage warning thresholds</a></p>
  </div>

</div>
</body>
</html>"##,
        workspace_name = html_escape(workspace_name),
        workspace_id = workspace_id,
        usage_label = html_escape(usage_label),
        formatted_limit = html_escape(formatted_limit),
        meter_description = meter_description,
    )
}
