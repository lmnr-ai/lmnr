//! This module reads report triggers from RabbitMQ and processes them: fetches signal event
//! samples from ClickHouse, generates an AI summary via the LLM service, generates an HTML
//! report, and pushes email notifications to the notification queue.

use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;

use async_trait::async_trait;
use chrono::{Duration, Utc};
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::instrument;
use uuid::Uuid;

use super::email_template::{
    ProjectReportData, ReportData, SignalEventSample, render_report_email,
};
use super::ReportTriggerMessage;
use crate::db::reports::{
    get_projects_for_workspace, get_report_target_emails, get_signals_for_project,
    get_workspace_name,
};
use crate::db::DB;
use crate::mq::MessageQueue;
use crate::notifications::{
    EmailPayload, NotificationMessage, NotificationType, push_to_notification_queue,
};
use crate::signals::provider::{
    LanguageModelClient, ProviderClient, ProviderContent, ProviderPart, ProviderRequest,
};
use crate::signals::llm_model;
use crate::worker::{HandlerError, MessageHandler};

const MAX_SAMPLES_PER_SIGNAL: u64 = 5;

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

/// ClickHouse row for signal event samples
#[derive(Row, Serialize, Deserialize, Debug)]
struct SignalEventRow {
    #[serde(with = "clickhouse::serde::uuid")]
    pub id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub signal_id: Uuid,
    #[serde(with = "clickhouse::serde::uuid")]
    pub trace_id: Uuid,
    pub name: String,
    pub payload: String,
    pub summary: String,
    pub timestamp: i64,
}

/// ClickHouse row for signal event counts
#[derive(Row, Serialize, Deserialize, Debug)]
struct SignalEventCountRow {
    #[serde(with = "clickhouse::serde::uuid")]
    pub signal_id: Uuid,
    pub count: u64,
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

    // Determine the time window based on report type
    let now = Utc::now();
    let (period_start, period_label) = match report_type.as_str() {
        "weekly" => (now - Duration::days(7), "Weekly Report".to_string()),
        _ => (now - Duration::days(1), "Daily Report".to_string()),
    };

    let start_nanos = period_start.timestamp_nanos_opt().unwrap_or(0);
    let end_nanos = now.timestamp_nanos_opt().unwrap_or(i64::MAX);

    // Get workspace info
    let workspace_name = get_workspace_name(&db.pool, &workspace_id)
        .await
        .map_err(|e| HandlerError::transient(e))?
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

    let mut project_reports = Vec::new();
    let mut total_events: u64 = 0;

    for project in &projects {
        // Get all signals for this project
        let signals = get_signals_for_project(&db.pool, &project.id)
            .await
            .map_err(|e| HandlerError::transient(e))?;

        if signals.is_empty() {
            continue;
        }

        let signal_ids: Vec<Uuid> = signals.iter().map(|s| s.id).collect();
        let signal_name_map: HashMap<Uuid, String> =
            signals.iter().map(|s| (s.id, s.name.clone())).collect();

        // Query ClickHouse for event counts per signal
        let counts = get_signal_event_counts(
            &clickhouse,
            &project.id,
            &signal_ids,
            start_nanos,
            end_nanos,
        )
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
            start_nanos,
            end_nanos,
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
        generate_ai_summary(client, &workspace_name, &period_label, &project_reports, total_events)
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
        log::info!(
            "[Reports Generator] LLM client not configured, skipping AI summary for workspace {}",
            workspace_id
        );
        String::new()
    };

    // Build the report
    let report_data = ReportData {
        workspace_name: workspace_name.clone(),
        period_label: period_label.clone(),
        period_start: period_start.format("%b %d, %Y").to_string(),
        period_end: now.format("%b %d, %Y").to_string(),
        projects: project_reports,
        total_events,
        ai_summary,
    };

    let html = render_report_email(&report_data);

    // Get email targets from report_targets table
    let emails = get_report_target_emails(&db.pool, &report_id)
        .await
        .map_err(|e| HandlerError::transient(e))?;

    if emails.is_empty() {
        log::warn!(
            "[Reports Generator] No email targets found for report {} in workspace {}",
            report_id,
            workspace_id
        );
        return Ok(());
    }

    let subject = format!("{} – {}", period_label, workspace_name);
    let from = "Laminar <reports@lmnr.ai>".to_string();

    // Push email notification to the notification queue
    let email_payload = EmailPayload {
        from,
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
            .map_err(|e| HandlerError::transient(anyhow::anyhow!(e)))?,
    };

    push_to_notification_queue(notification_message, queue)
        .await
        .map_err(|e| HandlerError::transient(e))?;

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

async fn get_signal_event_counts(
    clickhouse: &clickhouse::Client,
    project_id: &Uuid,
    signal_ids: &[Uuid],
    start_nanos: i64,
    end_nanos: i64,
) -> anyhow::Result<Vec<SignalEventCountRow>> {
    if signal_ids.is_empty() {
        return Ok(vec![]);
    }

    let placeholders: Vec<String> = signal_ids.iter().map(|_| "?".to_string()).collect();
    let query_str = format!(
        "SELECT signal_id, count() as count
         FROM signal_events
         WHERE project_id = ?
           AND signal_id IN ({})
           AND timestamp >= ?
           AND timestamp <= ?
         GROUP BY signal_id",
        placeholders.join(",")
    );

    let mut query = clickhouse.query(&query_str).bind(project_id);

    for signal_id in signal_ids {
        query = query.bind(signal_id);
    }

    query = query.bind(start_nanos).bind(end_nanos);

    let rows = query.fetch_all::<SignalEventCountRow>().await?;

    Ok(rows)
}

async fn get_signal_event_samples(
    clickhouse: &clickhouse::Client,
    project_id: &Uuid,
    signal_ids: &[Uuid],
    start_nanos: i64,
    end_nanos: i64,
    limit_per_signal: u64,
) -> anyhow::Result<Vec<SignalEventRow>> {
    if signal_ids.is_empty() {
        return Ok(vec![]);
    }

    let placeholders: Vec<String> = signal_ids.iter().map(|_| "?".to_string()).collect();

    // Use a window function to get the most recent N events per signal
    let query_str = format!(
        "SELECT id, signal_id, trace_id, name, payload, summary, timestamp
         FROM (
             SELECT id, signal_id, trace_id, name, payload, summary, timestamp,
                    row_number() OVER (PARTITION BY signal_id ORDER BY timestamp DESC) as rn
             FROM signal_events
             WHERE project_id = ?
               AND signal_id IN ({})
               AND timestamp >= ?
               AND timestamp <= ?
         )
         WHERE rn <= ?
         ORDER BY signal_id, timestamp DESC",
        placeholders.join(",")
    );

    let mut query = clickhouse.query(&query_str).bind(project_id);

    for signal_id in signal_ids {
        query = query.bind(signal_id);
    }

    query = query.bind(start_nanos).bind(end_nanos).bind(limit_per_signal);

    let rows = query.fetch_all::<SignalEventRow>().await?;

    Ok(rows)
}
