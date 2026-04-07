//! This module reads report triggers from RabbitMQ and processes them: fetches signal event
//! samples from ClickHouse, generates per-project AI summaries via the LLM service with tool
//! calling, builds report data, and pushes a single notification to the notification queue.
//! The notification consumer handles formatting and delivery to all targets.

use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;

use async_trait::async_trait;
use chrono::{DateTime, Datelike, Duration, Utc};
use tracing::instrument;
use uuid::Uuid;

use super::ReportTriggerMessage;
use super::email_template::{NoteworthyEvent, ProjectReportData, ReportData};
use crate::ch::signal_events::{get_signal_event_counts, get_signal_events_for_summary};
use crate::db::DB;
use crate::db::projects::get_projects_for_workspace;
use crate::db::reports::get_signals_for_workspace;
use crate::db::workspaces::get_workspace;
use crate::mq::MessageQueue;
use crate::mq::utils::mq_max_payload;
use crate::notifications::{
    NotificationKind, NotificationMessage, SignalReportPayload, push_to_notification_queue,
};
use crate::signals::llm_model;
use crate::signals::provider::models::{
    ProviderFunctionDeclaration, ProviderGenerationConfig, ProviderTool,
};
use crate::signals::provider::{
    LanguageModelClient, ProviderClient, ProviderContent, ProviderPart, ProviderRequest,
};
use crate::worker::{HandlerError, MessageHandler};

const MAX_EVENTS_FOR_SUMMARY: u64 = 128;

/// Report type identifier for signal events summary reports.
const REPORT_TYPE_SIGNAL_EVENTS_SUMMARY: &str = "SIGNAL_EVENTS_SUMMARY";
/// Human-readable name for signal events summary reports.
const REPORT_NAME_SIGNAL_EVENTS_SUMMARY: &str = "Signal Events Summary";

/// Name of the tool the LLM must call to produce its summary.
const SUMMARY_TOOL_NAME: &str = "submit_report_summary";

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
    let report_type = &message.r#type;

    log::info!(
        "[Reports Generator] Processing report trigger for workspace {}, type: {}",
        workspace_id,
        report_type
    );

    // Use the trigger timestamp from the scheduler (not Utc::now()) so that the
    // report period is computed correctly even if message processing is delayed.
    let triggered_at = DateTime::from_timestamp(message.triggered_at, 0).unwrap_or_else(Utc::now);
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

        if signal_event_counts.is_empty() {
            continue;
        }

        // Only count events for projects that actually appear in the report
        total_events += signal_event_counts.values().sum::<u64>();

        // Fetch up to 128 recent events for LLM summary context
        let summary_context_events = get_signal_events_for_summary(
            &clickhouse,
            &project.id,
            &signal_ids,
            start_ts,
            end_ts,
            MAX_EVENTS_FOR_SUMMARY,
        )
        .await
        .map_err(|e| HandlerError::transient(e))?;

        // Generate per-project AI summary with tool calling
        let (ai_summary, noteworthy_event_ids) = if let Some(ref client) = llm_client {
            generate_project_summary(
                client,
                &project.name,
                &signal_name_map,
                &signal_event_counts,
                &summary_context_events,
            )
            .await
            .unwrap_or_else(|e| {
                log::warn!(
                    "[Reports Generator] Failed to generate AI summary for project {} in workspace {}: {:?}",
                    project.name,
                    workspace_id,
                    e
                );
                (String::new(), Vec::new())
            })
        } else {
            log::warn!(
                "[Reports Generator] LLM client not configured, skipping AI summary for project {} in workspace {}",
                project.name,
                workspace_id
            );
            (String::new(), Vec::new())
        };

        // Build noteworthy events from the IDs returned by the LLM
        let noteworthy_events = build_noteworthy_events(
            &noteworthy_event_ids,
            &summary_context_events,
            &signal_name_map,
        );

        project_reports.push(ProjectReportData {
            project_name: project.name.clone(),
            project_id: project.id,
            signal_event_counts,
            ai_summary,
            noteworthy_events,
        });
    }

    if total_events == 0 {
        log::info!(
            "[Reports Generator] No signal events found for workspace {}, in period",
            workspace_id
        );
        return Ok(());
    }

    // Build the report data
    let report_data = ReportData {
        workspace_id,
        workspace_name: workspace_name.clone(),
        period_label: report_name.clone(),
        period_start: period_start.format("%b %d, %Y").to_string(),
        period_end: period_end.format("%b %d, %Y").to_string(),
        projects: project_reports,
        total_events,
    };

    let title = format!("{} – {}", report_name, workspace_name);

    // Push a single notification message with the report data.
    // The consumer handles fetching targets, formatting, and delivery.
    let notification_message = NotificationMessage {
        workspace_id,
        payload: NotificationKind::SignalReport(SignalReportPayload {
            report_id: message.id,
            report: report_data,
            title,
        }),
    };

    let serialized_size = serde_json::to_vec(&notification_message)
        .map(|v| v.len())
        .unwrap_or(0);
    if serialized_size >= mq_max_payload() {
        return Err(HandlerError::permanent(anyhow::anyhow!(
            "[Reports Generator] MQ payload limit exceeded. payload size: [{}]",
            serialized_size,
        )));
    }

    if let Err(e) = push_to_notification_queue(notification_message, queue.clone()).await {
        return Err(HandlerError::transient(anyhow::anyhow!(
            "Failed to push report notification for workspace {}: {:?}",
            workspace_id,
            e
        )));
    }

    log::info!(
        "[Reports Generator] Report notification pushed to queue for workspace {}",
        workspace_id,
    );

    Ok(())
}

/// Build the tool definition for the report summary LLM call.
/// The LLM must always call this tool to produce its output.
fn build_summary_tool() -> ProviderTool {
    ProviderTool {
        function_declarations: vec![ProviderFunctionDeclaration {
            name: SUMMARY_TOOL_NAME.to_string(),
            description: "REQUIRED: Submit the summary of signal events for this project. \
                You MUST always call this tool with your analysis. Never respond with plain text."
                .to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "summary": {
                        "type": "string",
                        "description": "A concise 2-4 sentence summary of the signal events for this project. Highlight the most important trends, notable spikes, and actionable insights. Do not use markdown formatting. Write in plain text only."
                    },
                    "event_ids": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "Array of event IDs (UUIDs from [Event ID: ...]) that are particularly interesting or worth investigating. These events will be highlighted in the email report with links to their traces. Select the most noteworthy events that the recipient should review."
                    }
                },
                "required": ["summary", "event_ids"]
            }),
        }],
    }
}

/// Build a prompt context string from the signal events fetched for summary generation.
fn build_summary_context(
    project_name: &str,
    signal_name_map: &HashMap<Uuid, String>,
    signal_event_counts: &BTreeMap<String, u64>,
    events: &[crate::ch::signal_events::SignalEventContextRow],
) -> String {
    let mut context = format!("Project: {project_name}\n\nSignal event counts:\n");
    for (name, count) in signal_event_counts {
        context.push_str(&format!("  - {name}: {count} events\n"));
    }
    context.push_str("\nRecent signal events (id, signal_name, summary, payload):\n");

    for event in events {
        let signal_name = signal_name_map
            .get(&event.signal_id)
            .cloned()
            .unwrap_or_else(|| "Unknown".to_string());

        // Truncate payload for context to avoid exceeding token limits
        let payload_display = match event.payload.char_indices().nth(500) {
            Some((idx, _)) => format!("{}...", &event.payload[..idx]),
            None => event.payload.clone(),
        };

        context.push_str(&format!(
            "\n[Event ID: {}]\nSignal: {}\nSummary: {}\nPayload: {}\n",
            event.id, signal_name, event.summary, payload_display,
        ));
    }

    context
}

/// Generate a per-project AI summary using the LLM with tool calling.
/// Returns (summary_text, noteworthy_signal_event_ids).
async fn generate_project_summary(
    llm_client: &ProviderClient,
    project_name: &str,
    signal_name_map: &HashMap<Uuid, String>,
    signal_event_counts: &BTreeMap<String, u64>,
    events: &[crate::ch::signal_events::SignalEventContextRow],
) -> anyhow::Result<(String, Vec<Uuid>)> {
    let context = build_summary_context(project_name, signal_name_map, signal_event_counts, events);

    let system_instruction = ProviderContent {
        role: None,
        parts: Some(vec![ProviderPart {
            text: Some(
                "You are an expert at analyzing observability data from LLM-powered applications. \
                 You will be given signal event data from a project. Your job is to:\n\
                 1. Write a concise 2-4 sentence summary highlighting the most important trends, \
                    notable spikes, and actionable insights.\n\
                 2. Select the most interesting/noteworthy signal event IDs that are worth \
                    investigating further.\n\n\
                 You MUST respond by calling the submit_report_summary tool. \
                 NEVER respond with plain text. Only function calls are accepted."
                    .to_string(),
            ),
            ..Default::default()
        }]),
    };

    let user_content = ProviderContent {
        role: Some("user".to_string()),
        parts: Some(vec![ProviderPart {
            text: Some(format!(
                "Analyze the following signal events and produce a summary. \
                 Call the submit_report_summary tool with your summary and the IDs of \
                 noteworthy events.\n\n{context}"
            )),
            ..Default::default()
        }]),
    };

    let tool = build_summary_tool();

    let request = ProviderRequest {
        contents: vec![user_content],
        system_instruction: Some(system_instruction),
        tools: Some(vec![tool]),
        generation_config: Some(ProviderGenerationConfig {
            temperature: Some(0.2),
            ..Default::default()
        }),
    };

    let model = llm_model();
    let response = llm_client
        .generate_content(&model, &request)
        .await
        .map_err(|e| anyhow::anyhow!("LLM generate_content failed: {:?}", e))?;

    // Extract the tool call from the response
    let parts = response
        .candidates
        .and_then(|candidates| candidates.into_iter().next())
        .and_then(|candidate| candidate.content)
        .and_then(|content| content.parts)
        .unwrap_or_default();

    for part in &parts {
        if let Some(ref fc) = part.function_call {
            if fc.name == SUMMARY_TOOL_NAME {
                if let Some(ref args) = fc.args {
                    let summary = args
                        .get("summary")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .trim()
                        .to_string();

                    let event_ids: Vec<Uuid> = args
                        .get("event_ids")
                        .and_then(|v| v.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|v| v.as_str())
                                .filter_map(|s| Uuid::parse_str(s).ok())
                                .collect()
                        })
                        .unwrap_or_default();

                    return Ok((summary, event_ids));
                }
            }
        }
    }

    // Fallback: try to extract plain text if the LLM didn't use the tool
    let text = parts
        .into_iter()
        .find_map(|p| p.text)
        .unwrap_or_default()
        .trim()
        .to_string();

    if text.is_empty() {
        Ok((String::new(), Vec::new()))
    } else {
        Ok((text, Vec::new()))
    }
}

/// Build NoteworthyEvent structs from the event IDs returned by the LLM.
fn build_noteworthy_events(
    noteworthy_ids: &[Uuid],
    all_events: &[crate::ch::signal_events::SignalEventContextRow],
    signal_name_map: &HashMap<Uuid, String>,
) -> Vec<NoteworthyEvent> {
    let mut result = Vec::new();

    for id in noteworthy_ids {
        if let Some(event) = all_events.iter().find(|e| &e.id == id) {
            let signal_name = signal_name_map
                .get(&event.signal_id)
                .cloned()
                .unwrap_or_else(|| "Unknown Signal".to_string());

            let timestamp_secs = event.timestamp / 1_000_000_000;
            let timestamp_str = chrono::DateTime::from_timestamp(timestamp_secs, 0)
                .map(|dt| dt.format("%b %d, %Y %H:%M UTC").to_string())
                .unwrap_or_else(|| "Unknown time".to_string());

            result.push(NoteworthyEvent {
                signal_name,
                summary: event.summary.clone(),
                timestamp: timestamp_str,
                trace_id: event.trace_id.to_string(),
            });
        }
    }

    result
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
