//! This module is responsible for postprocessing responses from the signal events.
//!
//! It is responsible for:
//! - Clustering the signal events
//! - Sending notifications to the users (Slack and Email)

use std::sync::Arc;
use uuid::Uuid;

use crate::ch::signal_events::CHSignalEvent;
use crate::clustering::queue::push_to_event_clustering_queue;
use crate::db;
use crate::features::{Feature, is_feature_enabled};
use crate::mq::MessageQueue;
use crate::mq::utils::mq_max_payload;
use crate::notifications::{self, EmailPayload, EventIdentificationPayload, TargetType};
use crate::reports::email_template::html_escape;

const ALERT_FROM_EMAIL: &str = "Laminar <alerts@mail.lmnr.ai>";

/// Process notifications and clustering for an identified signal event
pub async fn process_event_notifications_and_clustering(
    db: Arc<db::DB>,
    queue: Arc<MessageQueue>,
    project_id: Uuid,
    trace_id: Uuid,
    signal_event: CHSignalEvent,
) -> anyhow::Result<()> {
    let event_name = signal_event.name().to_string();
    let attributes = signal_event.payload_value().unwrap_or_default();

    // Fetch all notification targets
    let targets =
        db::alert_targets::get_targets_for_event(&db.pool, project_id, &event_name).await?;

    for target in &targets {
        log::info!(
            "Processing alert target: email: {:?}, channel_id: {:?}, integration_id: {:?}",
            target.email,
            target.channel_id,
            target.integration_id
        );
        let Ok(target_type) = target.r#type.parse::<TargetType>() else {
            log::warn!(
                "Unknown alert target type '{}' for target {}",
                target.r#type,
                target.id
            );
            continue;
        };

        let message_payload = match target_type {
            TargetType::Slack => {
                let (Some(channel_id), Some(integration_id)) =
                    (&target.channel_id, target.integration_id)
                else {
                    continue;
                };
                let payload = EventIdentificationPayload {
                    project_id,
                    trace_id,
                    event_name: event_name.to_string(),
                    extracted_information: Some(attributes.clone()),
                    channel_id: channel_id.clone(),
                    integration_id,
                };
                serde_json::to_value(&payload)?
            }
            TargetType::Email => {
                let Some(ref email) = target.email else {
                    continue;
                };
                let trace_link = format!(
                    "https://laminar.sh/project/{}/traces/{}",
                    project_id, trace_id
                );
                let subject = format!("Alert: {}", event_name);
                let html = render_alert_email(&event_name, &attributes, &trace_link);
                let payload = EmailPayload {
                    from: ALERT_FROM_EMAIL.to_string(),
                    to: vec![email.clone()],
                    subject,
                    html,
                    inline_logo: true,
                };
                serde_json::to_value(&payload)?
            }
        };

        let notification_message = notifications::NotificationMessage {
            notification_type: target_type.into(),
            payload: message_payload,
            project_id,
            workspace_id: target.workspace_id,
            definition_type: "ALERT".to_string(),
            definition_id: target.alert_id,
            target_id: target.id,
            target_type: target_type.to_string(),
        };

        let serialized_size = serde_json::to_vec(&notification_message)
            .map(|v| v.len())
            .unwrap_or(0);
        if serialized_size >= mq_max_payload() {
            log::error!(
                "MQ payload limit exceeded for target {}: payload size [{}]",
                target.id,
                serialized_size,
            );
            continue;
        }

        if let Err(e) =
            notifications::push_to_notification_queue(notification_message, queue.clone()).await
        {
            log::error!(
                "Failed to push to notification queue for target {}: {:?}",
                target.id,
                e
            );
        }
    }

    if is_feature_enabled(Feature::Clustering) {
        // Check for event clustering configuration
        if let Err(e) =
            push_to_event_clustering_queue(project_id, signal_event, queue.clone()).await
        {
            log::error!(
                "Failed to push to event clustering queue for event {}: {:?}",
                event_name,
                e
            );
        }
    }

    Ok(())
}

/// Render a simple HTML email for an alert notification.
fn render_alert_email(
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
