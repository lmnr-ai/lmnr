//! This module reads report triggers from RabbitMQ and processes them: fetches signal event
//! samples from ClickHouse, generates an AI summary via the LLM service, generates an HTML
//! report, and pushes email notifications to the notification queue.

use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;

use async_trait::async_trait;
use chrono::{DateTime, Datelike, Duration, Utc};
use tracing::instrument;
use uuid::Uuid;

use super::ReportTriggerMessage;
use super::email_template::{
    ProjectReportData, ReportData, SignalEventSample, render_report_email,
};
use crate::ch::signal_events::{get_signal_event_counts, get_signal_event_samples};
use crate::db::DB;
use crate::db::projects::get_projects_for_workspace;
use crate::db::reports::{get_report_target_emails, get_signals_for_workspace};
use crate::db::workspaces::get_workspace;
use crate::mq::MessageQueue;
use crate::notifications::{
    EmailPayload, NotificationMessage, NotificationType, push_to_notification_queue,
};
use crate::signals::llm_model;
use crate::signals::provider::{
    LanguageModelClient, ProviderClient, ProviderContent, ProviderPart, ProviderRequest,
};
use crate::worker::{HandlerError, MessageHandler};

const MAX_SAMPLES_PER_SIGNAL: u64 = 5;
const REPORT_FROM_EMAIL: &str = "Laminar <reports@lmnr.ai>";

/// Report type identifier for signal events summary reports.
const REPORT_TYPE_SIGNAL_EVENTS_SUMMARY: &str = "SIGNAL_EVENTS_SUMMARY";
/// Human-readable name for signal events summary reports.
const REPORT_NAME_SIGNAL_EVENTS_SUMMARY: &str = "Signal Events Summary";

pub struct ReportsGenerator {
    pub db: Arc<DB>,
    pub clickhouse: clickhouse::Client,
    pub queue: Arc<MessageQueue>,
    pub llm_client: Option<Arc<ProviderClient>>,
}

#[async_trait]
impl MessageHandler for ReportsGenerator {
    type Message = ReportTriggerMessage;

    async fn handle(&self, message: Self::Message) -> Result<(), HandlerError> {
        process_report_trigger(
            message,
            self.db.clone(),
            self.clickhouse.clone(),
            self.queue.clone(),
            self.llm_client.clone(),
        )
        .await
    }
}

#[instrument(skip(message, db, clickhouse, queue, llm_client))]
async fn process_report_trigger(
    message: ReportTriggerMessage,
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    queue: Arc<MessageQueue>,
    llm_client: Option<Arc<ProviderClient>>,
) -> Result<(), HandlerError> {
    let workspace_id = message.workspace_id;
    let report_id = message.id;
    let report_type = &message.r#type;

    log::info!(
        "[Reports Generator] Processing report trigger for workspace {}, type: {}",
        workspace_id,
        report_type
    );

    // Use the trigger timestamp from the scheduler (not Utc::now()) so that the
    // report period is computed correctly even if message processing is delayed.
    let triggered_at = DateTime::from_timestamp(message.triggered_at, 0)
        .unwrap_or_else(Utc::now);
    let (period_start, period_end) = report_period(triggered_at, &message.weekdays, message.hour);

    let report_name = match report_type.as_str() {
        REPORT_TYPE_SIGNAL_EVENTS_SUMMARY => REPORT_NAME_SIGNAL_EVENTS_SUMMARY.to_string(),
        _ => "Report".to_string(),
    };

    let start_ts = period_start.timestamp();
    let end_ts = period_end.timestamp();

    // Get workspace info
    let workspace_name = get_workspace(&db.pool, &workspace_id)
        .await
        .map_err(|e| HandlerError::transient(e))?
        .map(|w| w.name)
        .unwrap_or_else(|| "Unknown Workspace".to_string());

    // Get all projects for this workspace
    let projects = get_projects_for_workspace(&db.pool, &workspace_id)
        .await
        .map_err(|e| HandlerError::transient(e))?;

    if projects.is_empty() {
        log::info!(
            "[Reports Generator] No projects found for workspace {}",
            workspace_id
        );
        return Ok(());
    }

    // Fetch all signals for the workspace in a single query
    let all_signals = get_signals_for_workspace(&db.pool, &workspace_id)
        .await
        .map_err(|e| HandlerError::transient(e))?;

    // Group signals by project_id
    let mut signals_by_project: HashMap<Uuid, Vec<&crate::db::reports::SignalInfo>> =
        HashMap::new();
    for signal in &all_signals {
        signals_by_project
            .entry(signal.project_id)
            .or_default()
            .push(signal);
    }

    let mut project_reports = Vec::new();
    let mut total_events: u64 = 0;

    for project in &projects {
        let signals = match signals_by_project.get(&project.id) {
            Some(s) if !s.is_empty() => s,
            _ => continue,
        };

        let signal_ids: Vec<Uuid> = signals.iter().map(|s| s.id).collect();
        let signal_name_map: HashMap<Uuid, String> =
            signals.iter().map(|s| (s.id, s.name.clone())).collect();

        // Query ClickHouse for event counts per signal
        let counts =
            get_signal_event_counts(&clickhouse, &project.id, &signal_ids, start_ts, end_ts)
                .await
                .map_err(|e| HandlerError::transient(e))?;

        let mut signal_event_counts: BTreeMap<String, u64> = BTreeMap::new();
        for count_row in &counts {
            if let Some(name) = signal_name_map.get(&count_row.signal_id) {
                signal_event_counts.insert(name.clone(), count_row.count);
            }
        }

        // Query ClickHouse for sample events per signal
        let samples = get_signal_event_samples(
            &clickhouse,
            &project.id,
            &signal_ids,
            start_ts,
            end_ts,
            MAX_SAMPLES_PER_SIGNAL,
        )
        .await
        .map_err(|e| HandlerError::transient(e))?;

        let mut signals_map: BTreeMap<String, Vec<SignalEventSample>> = BTreeMap::new();
        for row in samples {
            let signal_name = signal_name_map
                .get(&row.signal_id)
                .cloned()
                .unwrap_or_else(|| "Unknown Signal".to_string());

            let timestamp_secs = row.timestamp / 1_000_000_000;
            let timestamp_str = chrono::DateTime::from_timestamp(timestamp_secs, 0)
                .map(|dt| dt.format("%b %d, %Y %H:%M UTC").to_string())
                .unwrap_or_else(|| "Unknown time".to_string());

            // Truncate payload for display if too long (char-boundary safe)
            let payload_display = match row.payload.char_indices().nth(500) {
                Some((idx, _)) => format!("{}...", &row.payload[..idx]),
                None => row.payload.clone(),
            };

            signals_map
                .entry(signal_name)
                .or_default()
                .push(SignalEventSample {
                    payload: payload_display,
                    summary: row.summary,
                    timestamp: timestamp_str,
                    trace_id: row.trace_id.to_string(),
                });
        }

        if !signals_map.is_empty() {
            // Only count events for projects that actually appear in the report
            total_events += signal_event_counts.values().sum::<u64>();
            project_reports.push(ProjectReportData {
                project_name: project.name.clone(),
                project_id: project.id,
                signals: signals_map,
                signal_event_counts,
            });
        }
    }

    if total_events == 0 {
        log::info!(
            "[Reports Generator] No signal events found for workspace {} in period",
            workspace_id
        );
        return Ok(());
    }

    // Generate AI summary using the LLM service
    let ai_summary = if let Some(ref client) = llm_client {
        generate_ai_summary(
            client,
            &workspace_name,
            &report_name,
            &project_reports,
            total_events,
        )
        .await
        .unwrap_or_else(|e| {
            log::warn!(
                "[Reports Generator] Failed to generate AI summary for workspace {}: {:?}",
                workspace_id,
                e
            );
            String::new()
        })
    } else {
        log::warn!(
            "[Reports Generator] LLM client not configured, skipping AI summary for workspace {}",
            workspace_id
        );
        String::new()
    };

    // Build the report (use report_name without "[Laminar]" prefix for the body,
    // since the email body already displays the Laminar logo and brand name)
    let report_data = ReportData {
        workspace_name: workspace_name.clone(),
        period_label: report_name.clone(),
        period_start: period_start.format("%b %d, %Y").to_string(),
        period_end: period_end.format("%b %d, %Y").to_string(),
        projects: project_reports,
        total_events,
        ai_summary,
    };

    let html = render_report_email(&report_data);

    // Get email targets from report_targets table
    let emails = get_report_target_emails(&db.pool, &report_id, &workspace_id)
        .await
        .map_err(|e| HandlerError::transient(e))?;

    if emails.is_empty() {
        log::info!(
            "[Reports Generator] No email targets found for report {} in workspace {}",
            report_id,
            workspace_id
        );
        return Ok(());
    }

    let subject = format!("{} – {}", report_name, workspace_name);

    // Push email notification to the notification queue
    let email_payload = EmailPayload {
        from: REPORT_FROM_EMAIL.to_string(),
        to: emails,
        subject,
        html,
    };

    let notification_message = NotificationMessage {
        project_id: Uuid::nil(),
        trace_id: Uuid::nil(),
        notification_type: NotificationType::Email,
        event_name: "report_email".to_string(),
        payload: serde_json::to_value(email_payload)
            .map_err(|e| HandlerError::permanent(anyhow::anyhow!(e)))?,
    };

    push_to_notification_queue(notification_message, queue).await?;

    log::info!(
        "[Reports Generator] Report email notification pushed to queue for workspace {}",
        workspace_id
    );

    Ok(())
}

/// Build a text summary of report data for the LLM prompt.
fn build_report_summary_prompt(
    workspace_name: &str,
    period_label: &str,
    project_reports: &[ProjectReportData],
    total_events: u64,
) -> String {
    let mut data_summary = format!(
        "Workspace: {workspace_name}\nReport period: {period_label}\nTotal signal events: {total_events}\n\n"
    );

    for project in project_reports {
        data_summary.push_str(&format!("Project: {}\n", project.project_name));
        for (signal_name, count) in &project.signal_event_counts {
            data_summary.push_str(&format!("  - Signal \"{signal_name}\": {count} events\n"));
        }
        for (signal_name, samples) in &project.signals {
            for sample in samples {
                let summary_part = if sample.summary.is_empty() {
                    String::new()
                } else {
                    format!(" | Summary: {}", sample.summary)
                };
                data_summary.push_str(&format!(
                    "  Sample [{signal_name}] {}{}\n",
                    sample.timestamp, summary_part
                ));
            }
        }
        data_summary.push('\n');
    }

    data_summary
}

/// Generate an AI summary of the report data using the LLM service.
async fn generate_ai_summary(
    llm_client: &ProviderClient,
    workspace_name: &str,
    period_label: &str,
    project_reports: &[ProjectReportData],
    total_events: u64,
) -> anyhow::Result<String> {
    let data_summary =
        build_report_summary_prompt(workspace_name, period_label, project_reports, total_events);

    let system_instruction = ProviderContent {
        role: None,
        parts: Some(vec![ProviderPart {
            text: Some(
                "You are an expert at analyzing observability data. \
                 Given signal event data from an LLM observability platform, \
                 write a concise 2-3 sentence summary highlighting the most \
                 important trends, notable spikes, and actionable insights. \
                 Do not use markdown formatting. Write in plain text only."
                    .to_string(),
            ),
            ..Default::default()
        }]),
    };

    let user_content = ProviderContent {
        role: Some("user".to_string()),
        parts: Some(vec![ProviderPart {
            text: Some(format!(
                "Summarize the following signal report data:\n\n{data_summary}"
            )),
            ..Default::default()
        }]),
    };

    let request = ProviderRequest {
        contents: vec![user_content],
        system_instruction: Some(system_instruction),
        tools: None,
        generation_config: None,
    };

    let model = llm_model();
    let response = llm_client
        .generate_content(&model, &request)
        .await
        .map_err(|e| anyhow::anyhow!("LLM generate_content failed: {:?}", e))?;

    let text = response
        .candidates
        .and_then(|candidates| candidates.into_iter().next())
        .and_then(|candidate| candidate.content)
        .and_then(|content| content.parts)
        .and_then(|parts| parts.into_iter().next())
        .and_then(|part| part.text)
        .unwrap_or_default();

    Ok(text.trim().to_string())
}

/// Compute the report period from the schedule's weekdays and hour.
/// Returns (period_start, period_end, label).
/// period_end is today at the given hour, period_start is the previous scheduled weekday at the same hour.
fn report_period(
    now: DateTime<Utc>,
    weekdays: &[i32],
    hour: i32,
) -> (DateTime<Utc>, DateTime<Utc>) {
    let current_weekday = now.weekday().num_days_from_monday() as i32;

    let mut sorted_weekdays = weekdays.to_vec();
    sorted_weekdays.sort();

    let prev_weekday = sorted_weekdays
        .iter()
        .rev()
        .find(|&&d| d < current_weekday)
        .or_else(|| sorted_weekdays.last());

    let days_since_prev = match prev_weekday {
        Some(&prev) if prev < current_weekday => current_weekday - prev,
        Some(&prev) => 7 - prev + current_weekday,
        None => 7,
    };

    let end = now
        .date_naive()
        .and_hms_opt(hour as u32, 0, 0)
        .unwrap()
        .and_utc();
    let start = end - Duration::days(days_since_prev as i64);

    (start, end)
}
