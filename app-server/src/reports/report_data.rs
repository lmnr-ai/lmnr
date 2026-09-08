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
    /// AI-generated summary for this project's signals
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
