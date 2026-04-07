//! Email rendering for all notification types.
//!
//! All email HTML generation lives here on the consumer side.

use uuid::Uuid;

use super::{EventIdentificationPayload, UsageWarningPayload};
use crate::db::usage_warnings::UsageItem;
use crate::reports::email_template::{
    ReportData, html_escape, render_report_email as render_report_email_template,
};

/// Render a simple HTML email for an alert notification.
pub fn render_alert_email(payload: &EventIdentificationPayload) -> String {
    let trace_link = format!(
        "https://lmnr.ai/project/{}/traces/{}?chat=true",
        payload.project_id, payload.trace_id
    );

    let attributes_html = if let Some(ref attributes) = payload.extracted_information {
        if let Some(obj) = attributes.as_object() {
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
        event_name = html_escape(&payload.event_name),
        attributes_html = attributes_html,
        trace_link = trace_link,
    )
}

/// Render an HTML email for a signals report.
/// Delegates to the existing report email template.
pub fn render_report_email(report_data: &ReportData) -> String {
    render_report_email_template(report_data)
}

/// Render an HTML email for a usage warning notification.
pub fn render_usage_warning_email(payload: &UsageWarningPayload, workspace_id: Uuid) -> String {
    let meter_description = match payload.usage_item {
        UsageItem::Bytes => "data ingested",
        UsageItem::SignalRuns => "signal runs used",
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
        workspace_name = html_escape(&payload.workspace_name),
        workspace_id = workspace_id,
        usage_label = html_escape(&payload.usage_label),
        formatted_limit = html_escape(&payload.formatted_limit),
        meter_description = meter_description,
    )
}
