use uuid::Uuid;

use super::NotificationKind;
use crate::reports::email_template::{ProjectReportData, ReportData};

/// Public-facing base URL used to construct user-clickable links in notifications.
/// Reads `NEXT_PUBLIC_URL` (the frontend's public URL) so self-hosted deployments
/// can route users to their own instance. Falls back to the given default when
/// the env var is not set — `https://laminar.sh` is preferred for Slack (short
/// URL) and `https://lmnr.ai` for email.
fn frontend_url_with_default(default: &str) -> String {
    let raw = std::env::var("NEXT_PUBLIC_URL").unwrap_or_else(|_| default.to_string());
    raw.trim_end_matches('/').to_string()
}

/// Public-facing base URL for Slack message links. Defaults to `https://laminar.sh`.
pub(super) fn frontend_url_slack() -> String {
    frontend_url_with_default("https://laminar.sh")
}

/// Public-facing base URL for email links. Defaults to `https://lmnr.ai`.
pub(super) fn frontend_url_email() -> String {
    frontend_url_with_default("https://lmnr.ai")
}

/// Reconstruct a `ReportData` (with title) from a batch of `SignalsReport` notifications.
/// Returns `None` if no `SignalsReport` entries are found.
pub(super) fn build_report_data_from_batch(
    notifications: &[NotificationKind],
    workspace_id: Uuid,
) -> Option<(String, ReportData)> {
    let mut report_data: Option<ReportData> = None;
    let mut title = String::new();

    for kind in notifications {
        if let NotificationKind::SignalsReport {
            workspace_name,
            project_id,
            project_name,
            title: t,
            period_label,
            period_start,
            period_end,
            signal_event_counts,
            ai_summary,
            noteworthy_events,
        } = kind
        {
            let project_events: u64 = signal_event_counts.values().sum();
            let project = ProjectReportData {
                project_name: project_name.clone(),
                project_id: *project_id,
                signal_event_counts: signal_event_counts.clone(),
                ai_summary: ai_summary.clone(),
                noteworthy_events: noteworthy_events.clone(),
            };

            match report_data.as_mut() {
                None => {
                    title = t.clone();
                    report_data = Some(ReportData {
                        workspace_id,
                        workspace_name: workspace_name.clone(),
                        period_label: period_label.clone(),
                        period_start: period_start.clone(),
                        period_end: period_end.clone(),
                        projects: vec![project],
                        total_events: project_events,
                    });
                }
                Some(existing) => {
                    existing.projects.push(project);
                    existing.total_events += project_events;
                }
            }
        }
    }

    report_data.map(|data| (title, data))
}
