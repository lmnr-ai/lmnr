use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A noteworthy signal event highlighted by the AI summary, shown with full details.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct NoteworthyEvent {
    pub signal_event_id: String,
    pub signal_name: String,
    pub summary: String,
    pub timestamp: String,
    pub trace_id: String,
}

/// Data for a single project section in the report
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProjectReportData {
    pub project_name: String,
    pub project_id: Uuid,
    /// Map of signal_name -> total event count in period
    pub signal_event_counts: BTreeMap<String, u64>,
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
