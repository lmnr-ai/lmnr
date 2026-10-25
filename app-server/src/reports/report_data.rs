//! Shared report data model. Built by `reports::generator` and rendered by both
//! the email templates (`notifications::email`) and the Slack report formatter
//! (`notifications::slack::report`), so it lives here rather than in either renderer.

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
    /// 0 = Info, 1 = Warning, 2 = Critical. `serde(default)` so report messages
    /// queued before this field existed still deserialize (default 0 = Info).
    #[serde(default)]
    pub severity: u8,
}

/// One time bucket in a signal's events chart.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct ReportChartBucket {
    pub label: String,
    pub value: u64,
}

/// Current and previous-period counts for a named cluster.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ReportClusterData {
    pub id: Uuid,
    pub name: String,
    pub count: u64,
    pub previous_count: u64,
}

/// Data needed to render one signal card in the email report.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SignalReportData {
    pub signal_id: Uuid,
    pub signal_name: String,
    pub current_count: u64,
    pub previous_count: u64,
    #[serde(default)]
    pub summary: String,
    pub buckets: Vec<ReportChartBucket>,
    pub clusters: Vec<ReportClusterData>,
}

impl SignalReportData {
    /// Clusters worth listing in a report, shared by the email and Slack renderers:
    /// at least 5 events across both periods, recurring clusters ranked by how far
    /// they moved before brand-new ones, at most 5.
    pub fn notable_clusters(&self) -> Vec<&ReportClusterData> {
        let mut clusters: Vec<_> = self
            .clusters
            .iter()
            .filter(|row| row.count + row.previous_count >= 5)
            .collect();
        clusters.sort_by(
            |a, b| match (a.previous_count == 0, b.previous_count == 0) {
                (true, false) => std::cmp::Ordering::Greater,
                (false, true) => std::cmp::Ordering::Less,
                _ => b
                    .change_score()
                    .partial_cmp(&a.change_score())
                    .unwrap_or(std::cmp::Ordering::Equal),
            },
        );
        clusters.truncate(5);
        clusters
    }

    /// The signal's AI summary, or a count-only sentence when the summary is missing.
    pub fn summary_or_default(&self) -> String {
        if self.summary.is_empty() {
            format!(
                "{} events were detected during this period.",
                self.current_count
            )
        } else {
            self.summary.clone()
        }
    }
}

impl ReportClusterData {
    fn change_score(&self) -> f64 {
        ((self.count as f64 - self.previous_count as f64)
            / ((self.count + self.previous_count) as f64).sqrt())
        .abs()
    }
}

/// Data for a single project section in the report
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProjectReportData {
    pub project_name: String,
    pub project_id: Uuid,
    /// Map of signal_name -> total event count in period
    pub signal_event_counts: BTreeMap<String, u64>,
    /// Per-signal chart and cluster data. Empty for legacy queued reports.
    #[serde(default)]
    pub signals: Vec<SignalReportData>,
    /// Legacy project-level AI summary retained for queued-report compatibility.
    #[serde(default)]
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

impl ReportData {
    /// Every project's signals, busiest first: the order both renderers list them in.
    pub fn signals_by_volume(&self) -> Vec<(&ProjectReportData, &SignalReportData)> {
        let mut signals: Vec<_> = self
            .projects
            .iter()
            .flat_map(|project| project.signals.iter().map(move |signal| (project, signal)))
            .collect();
        signals.sort_by(|(_, a), (_, b)| b.current_count.cmp(&a.current_count));
        signals
    }
}
