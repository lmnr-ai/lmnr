//! This module reads report triggers from RabbitMQ and processes them: fetches signal event
//! samples from ClickHouse, generates an HTML report, and sends it via Resend to workspace members.

use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;

use async_trait::async_trait;
use chrono::{Duration, Utc};
use clickhouse::Row;
use resend_rs::types::CreateEmailBaseOptions;
use resend_rs::Resend;
use serde::{Deserialize, Serialize};
use tracing::instrument;
use uuid::Uuid;

use super::email_template::{
    ProjectReportData, ReportData, SignalEventSample, render_report_email,
};
use super::ReportTriggerMessage;
use crate::db::reports::{
    get_projects_for_workspace, get_signals_for_project, get_workspace_member_emails,
    get_workspace_name,
};
use crate::db::DB;
use crate::worker::{HandlerError, MessageHandler};

const MAX_SAMPLES_PER_SIGNAL: u64 = 5;

pub struct ReportsGenerator {
    pub db: Arc<DB>,
    pub clickhouse: clickhouse::Client,
    pub resend: Option<Arc<Resend>>,
}

#[async_trait]
impl MessageHandler for ReportsGenerator {
    type Message = ReportTriggerMessage;

    async fn handle(&self, message: Self::Message) -> Result<(), HandlerError> {
        let resend = match &self.resend {
            Some(r) => r.clone(),
            None => {
                log::warn!(
                    "[Reports Generator] Resend client not configured (RESEND_API_KEY not set), skipping report email"
                );
                return Ok(());
            }
        };
        process_report_trigger(
            message,
            self.db.clone(),
            self.clickhouse.clone(),
            resend,
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

#[instrument(skip(message, db, clickhouse, resend))]
async fn process_report_trigger(
    message: ReportTriggerMessage,
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    resend: Arc<Resend>,
) -> Result<(), HandlerError> {
    let workspace_id = message.workspace_id;
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
        .map_err(|e| HandlerError::permanent(e))?
        .unwrap_or_else(|| "Unknown Workspace".to_string());

    // Get all projects for this workspace
    let projects = get_projects_for_workspace(&db.pool, &workspace_id)
        .await
        .map_err(|e| HandlerError::permanent(e))?;

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
            .map_err(|e| HandlerError::permanent(e))?;

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
        .map_err(|e| HandlerError::permanent(e))?;

        let mut signal_event_counts: BTreeMap<String, u64> = BTreeMap::new();
        for count_row in &counts {
            if let Some(name) = signal_name_map.get(&count_row.signal_id) {
                signal_event_counts.insert(name.clone(), count_row.count);
                total_events += count_row.count;
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
        .map_err(|e| HandlerError::permanent(e))?;

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
            let payload_display = if row.payload.len() > 500 {
                let truncated = match row.payload.char_indices().nth(500) {
                    Some((idx, _)) => &row.payload[..idx],
                    None => &row.payload,
                };
                format!("{}...", truncated)
            } else {
                row.payload.clone()
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

    // Build the report
    let report_data = ReportData {
        workspace_name: workspace_name.clone(),
        period_label: period_label.clone(),
        period_start: period_start.format("%b %d, %Y").to_string(),
        period_end: now.format("%b %d, %Y").to_string(),
        projects: project_reports,
        total_events,
    };

    let html = render_report_email(&report_data);

    // Get workspace member emails
    let members = get_workspace_member_emails(&db.pool, &workspace_id)
        .await
        .map_err(|e| HandlerError::permanent(e))?;

    if members.is_empty() {
        log::warn!(
            "[Reports Generator] No members found for workspace {}",
            workspace_id
        );
        return Ok(());
    }

    let subject = format!("Signal {} – {}", period_label, workspace_name);

    let from = "Laminar <reports@lmnr.ai>";

    // Send individual emails to each member to avoid exposing all addresses in the TO field.
    // Log failures per recipient but continue sending to others to avoid duplicate emails on retry.
    let mut send_failures = 0;
    for member in &members {
        let email =
            CreateEmailBaseOptions::new(from, [member.email.as_str()], &subject).with_html(&html);

        match resend.emails.send(email).await {
            Ok(response) => {
                log::info!(
                    "[Reports Generator] Report email sent to {} for workspace {}. Email ID: {:?}",
                    member.email,
                    workspace_id,
                    response.id
                );
            }
            Err(e) => {
                send_failures += 1;
                log::error!(
                    "[Reports Generator] Failed to send report email to {} for workspace {}: {:?}",
                    member.email,
                    workspace_id,
                    e
                );
            }
        }
    }

    if send_failures == members.len() {
        return Err(HandlerError::transient(anyhow::anyhow!(
            "Failed to send report email to all {} members for workspace {}",
            members.len(),
            workspace_id
        )));
    }

    if send_failures > 0 {
        log::warn!(
            "[Reports Generator] Failed to send report email to {}/{} members for workspace {}",
            send_failures,
            members.len(),
            workspace_id
        );
    }

    Ok(())
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
