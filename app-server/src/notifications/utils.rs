use uuid::Uuid;

use super::NotificationKind;
use crate::reports::email_template::{ProjectReportData, ReportData};

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
