use std::collections::HashMap;
use std::env;
use std::sync::Arc;

use async_trait::async_trait;
use backoff::ExponentialBackoffBuilder;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{TRACE_SUMMARY_EXCHANGE, TRACE_SUMMARY_ROUTING_KEY};
use crate::db;
use crate::features::{Feature, is_feature_enabled};
use crate::mq::{MessageQueue, MessageQueueTrait};
use crate::notifications::{
    self, EventIdentificationPayload, NotificationType, SlackMessagePayload,
};
use crate::traces::clustering;
use crate::worker::{HandlerError, MessageHandler};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TraceSummaryMessage {
    pub trace_id: Uuid,
    pub project_id: Uuid,
    pub trigger_span_id: Uuid,
    pub event_definition: Option<crate::db::summary_trigger_spans::EventDefinition>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TraceSummaryResponse {
    pub summary: String,
    pub status: String,
    pub analysis: String,
    pub analysis_preview: String,
    pub span_ids_map: HashMap<String, String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ExtractedEventInformation {
    pub is_event_present: bool,
    pub extracted_information: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EventIdentificationResponse {
    pub success: bool,
    pub event: ExtractedEventInformation,
    pub error: Option<String>,
}

/// Push a trace completion message to the trace summary queue
pub async fn push_to_trace_summary_queue(
    trace_id: Uuid,
    project_id: Uuid,
    trigger_span_id: Uuid,
    event_definition: Option<crate::db::summary_trigger_spans::EventDefinition>,
    queue: Arc<MessageQueue>,
) -> anyhow::Result<()> {
    let message = TraceSummaryMessage {
        trace_id,
        project_id,
        trigger_span_id,
        event_definition: event_definition.clone(),
    };

    let serialized = serde_json::to_vec(&message)?;

    queue
        .publish(
            &serialized,
            TRACE_SUMMARY_EXCHANGE,
            TRACE_SUMMARY_ROUTING_KEY,
        )
        .await?;

    log::debug!(
        "Pushed trace summary message to queue: trace_id={}, project_id={}, trigger_span_id={}, event={:?}",
        trace_id,
        project_id,
        trigger_span_id,
        event_definition.as_ref().map(|e| &e.name)
    );

    Ok(())
}

/// Handler for trace summary messages
pub struct TraceSummaryHandler {
    db: Arc<db::DB>,
    queue: Arc<MessageQueue>,
    client: reqwest::Client,
}

impl TraceSummaryHandler {
    pub fn new(db: Arc<db::DB>, queue: Arc<MessageQueue>, client: reqwest::Client) -> Self {
        Self { db, queue, client }
    }
}

#[async_trait]
impl MessageHandler for TraceSummaryHandler {
    type Message = TraceSummaryMessage;

    async fn handle(&self, message: Self::Message) -> Result<(), HandlerError> {
        // Route to appropriate service based on whether event_definition is present
        let result = if message.event_definition.is_some() {
            process_event_identification(&self.client, message, self.db.clone(), self.queue.clone())
                .await
        } else {
            process_trace_summary(&self.client, self.db.clone(), self.queue.clone(), message).await
        };

        result.map_err(Into::into)
    }
}

/// Process trace summary generation (without event definition)
async fn process_trace_summary(
    client: &reqwest::Client,
    db: Arc<db::DB>,
    queue: Arc<MessageQueue>,
    message: TraceSummaryMessage,
) -> anyhow::Result<()> {
    let service_url = env::var("TRACE_SUMMARIZER_URL")
        .map_err(|_| anyhow::anyhow!("TRACE_SUMMARIZER_URL environment variable not set"))?;

    let auth_token = env::var("TRACE_SUMMARIZER_SECRET_KEY")
        .map_err(|_| anyhow::anyhow!("TRACE_SUMMARIZER_SECRET_KEY environment variable not set"))?;

    let request_body = serde_json::json!({
        "project_id": message.project_id.to_string(),
        "trace_id": message.trace_id.to_string(),
        "trigger_span_id": message.trigger_span_id.to_string(),
    });

    let response_text =
        call_service_with_retry(client, &service_url, &auth_token, &request_body, &message).await?;
    let response = serde_json::from_str::<TraceSummaryResponse>(&response_text)?;

    // Check if status is error or warning and push to notification queue
    let event_name = match response.status.as_str() {
        "error" => Some("error_trace_analysis"),
        "warning" => Some("warning_trace_analysis"),
        _ => None,
    };

    if let Some(event_name) = event_name {
        // Get all channels configured for this event
        let channels = db::slack_channel_to_events::get_channels_for_event(
            &db.pool,
            message.project_id,
            event_name,
        )
        .await?;

        // Push a notification for each configured channel
        for channel in channels {
            let payload = notifications::TraceAnalysisPayload {
                summary: response.summary.clone(),
                analysis: response.analysis.clone(),
                analysis_preview: response.analysis_preview.clone(),
                status: response.status.clone(),
                span_ids_map: response.span_ids_map.clone(),
                channel_id: channel.channel_id.clone(),
                integration_id: channel.integration_id,
            };

            let notification_message = notifications::NotificationMessage {
                project_id: message.project_id,
                trace_id: message.trace_id,
                span_id: message.trigger_span_id,
                notification_type: NotificationType::Slack,
                event_name: event_name.to_string(),
                payload: serde_json::to_value(SlackMessagePayload::TraceAnalysis(payload))?,
            };

            if let Err(e) =
                notifications::push_to_notification_queue(notification_message, queue.clone()).await
            {
                log::error!(
                    "Failed to push to notification queue for channel {}: {:?}",
                    channel.channel_id,
                    e
                );
            }
        }
    }

    // Push to clustering queue if status is error only if clustering is enabled
    if response.status == "error" && is_feature_enabled(Feature::Clustering) {
        if let Err(e) = clustering::push_to_clustering_queue(
            message.trace_id,
            message.project_id,
            response.analysis_preview.clone(),
            queue.clone(),
        )
        .await
        {
            log::error!(
                "Failed to push to clustering queue for trace_id={}, project_id={}: {:?}",
                message.trace_id,
                message.project_id,
                e
            );
        }
    }

    Ok(())
}

/// Process event identification (with event definition)
async fn process_event_identification(
    client: &reqwest::Client,
    message: TraceSummaryMessage,
    db: Arc<db::DB>,
    queue: Arc<MessageQueue>,
) -> anyhow::Result<()> {
    let event_definition = message
        .event_definition
        .as_ref()
        .expect("event_definition should be Some");

    let service_url = env::var("TRACE_EVENT_IDENTIFIER_URL")
        .map_err(|_| anyhow::anyhow!("TRACE_EVENT_IDENTIFIER_URL environment variable not set"))?;

    let auth_token = env::var("TRACE_SUMMARIZER_SECRET_KEY")
        .map_err(|_| anyhow::anyhow!("TRACE_SUMMARIZER_SECRET_KEY environment variable not set"))?;

    let request_body = serde_json::json!({
        "project_id": message.project_id.to_string(),
        "trace_id": message.trace_id.to_string(),
        "trigger_span_id": message.trigger_span_id.to_string(),
        "event_definition": serde_json::to_value(event_definition).unwrap(),
    });

    let response_text =
        call_service_with_retry(client, &service_url, &auth_token, &request_body, &message).await?;
    let response = serde_json::from_str::<EventIdentificationResponse>(&response_text)?;

    if !response.success {
        return Err(anyhow::anyhow!(
            "Event identification failed: {:?}",
            response.error
        ));
    }

    if response.event.is_event_present {
        let channels = db::slack_channel_to_events::get_channels_for_event(
            &db.pool,
            message.project_id,
            event_definition.name.as_str(),
        )
        .await?;

        if !channels.is_empty() {
            // Push a notification for each configured channel
            for channel in channels {
                let payload = EventIdentificationPayload {
                    event_name: event_definition.name.clone(),
                    extracted_information: response.event.extracted_information.clone(),
                    channel_id: channel.channel_id.clone(),
                    integration_id: channel.integration_id,
                };

                let notification_message = notifications::NotificationMessage {
                    project_id: message.project_id,
                    trace_id: message.trace_id,
                    span_id: message.trigger_span_id,
                    notification_type: NotificationType::Slack,
                    event_name: event_definition.name.clone(),
                    payload: serde_json::to_value(SlackMessagePayload::EventIdentification(
                        payload,
                    ))?,
                };

                if let Err(e) =
                    notifications::push_to_notification_queue(notification_message, queue.clone())
                        .await
                {
                    log::error!(
                        "Failed to push to notification queue for channel {}: {:?}",
                        channel.channel_id,
                        e
                    );
                }
            }
        }
    }

    Ok(())
}

/// Helper function to call service with retry logic
/// Returns the response text on success, or an error on failure
async fn call_service_with_retry(
    client: &reqwest::Client,
    service_url: &str,
    auth_token: &str,
    request_body: &serde_json::Value,
    message: &TraceSummaryMessage,
) -> anyhow::Result<String> {
    let call_service = || async {
        let response = client
            .post(service_url)
            .header("Authorization", format!("Bearer {}", auth_token))
            .header("Content-Type", "application/json")
            .json(request_body)
            .send()
            .await
            .map_err(|e| {
                log::warn!("Failed to call service: {:?}", e);
                backoff::Error::transient(anyhow::Error::from(e))
            })?;

        if response.status().is_success() {
            let response_text = response.text().await.unwrap_or_default();
            log::debug!(
                "Service response for trace_id={}, project_id={}: {}",
                message.trace_id,
                message.project_id,
                response_text
            );
            Ok(response_text)
        } else {
            let status = response.status();
            let response_text = response.text().await.unwrap_or_default();
            log::warn!(
                "Service returned error status: {}, Response: {}",
                status,
                response_text
            );
            Err(backoff::Error::transient(anyhow::anyhow!(
                "Service error: {}, Response: {}",
                status,
                response_text
            )))
        }
    };

    let backoff = ExponentialBackoffBuilder::new()
        .with_initial_interval(std::time::Duration::from_millis(500))
        .with_max_interval(std::time::Duration::from_secs(30))
        .with_max_elapsed_time(Some(std::time::Duration::from_secs(60))) // 1 minute max
        .build();

    backoff::future::retry(backoff, call_service)
        .await
        .map_err(Into::into)
}
