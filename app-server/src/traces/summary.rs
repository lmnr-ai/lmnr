use std::collections::HashMap;
use std::env;
use std::sync::Arc;

use backoff::ExponentialBackoffBuilder;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{TRACE_SUMMARY_EXCHANGE, TRACE_SUMMARY_QUEUE, TRACE_SUMMARY_ROUTING_KEY};
use crate::db;
use crate::mq::{
    MessageQueue, MessageQueueAcker, MessageQueueDeliveryTrait, MessageQueueReceiverTrait,
    MessageQueueTrait,
};
use crate::notifications;

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

/// Main worker function to process trace summary messages
pub async fn process_trace_summaries(db: Arc<db::DB>, queue: Arc<MessageQueue>) {
    loop {
        inner_process_trace_summaries(db.clone(), queue.clone()).await;
        log::warn!("Trace summary listener exited. Rebinding queue connection...");
    }
}

async fn inner_process_trace_summaries(db: Arc<db::DB>, queue: Arc<MessageQueue>) {
    // Add retry logic with exponential backoff for connection failures
    let get_receiver = || async {
        queue
            .get_receiver(
                TRACE_SUMMARY_QUEUE,
                TRACE_SUMMARY_EXCHANGE,
                TRACE_SUMMARY_ROUTING_KEY,
            )
            .await
            .map_err(|e| {
                log::error!("Failed to get receiver from trace summary queue: {:?}", e);
                backoff::Error::transient(e)
            })
    };

    let backoff = ExponentialBackoffBuilder::new()
        .with_initial_interval(std::time::Duration::from_secs(1))
        .with_max_interval(std::time::Duration::from_secs(60))
        .with_max_elapsed_time(Some(std::time::Duration::from_secs(300))) // 5 minutes max
        .build();

    let mut receiver = match backoff::future::retry(backoff, get_receiver).await {
        Ok(receiver) => {
            log::info!("Successfully connected to trace summary queue");
            receiver
        }
        Err(e) => {
            log::error!(
                "Failed to connect to trace summary queue after retries: {:?}",
                e
            );
            return;
        }
    };

    log::info!("Started processing trace summaries from queue");

    let client = reqwest::Client::new();

    while let Some(delivery) = receiver.receive().await {
        if let Err(e) = delivery {
            log::error!(
                "Failed to receive message from trace summary queue: {:?}",
                e
            );
            continue;
        }
        let delivery = delivery.unwrap();
        let acker = delivery.acker();
        let trace_summary_message =
            match serde_json::from_slice::<TraceSummaryMessage>(&delivery.data()) {
                Ok(message) => message,
                Err(e) => {
                    log::error!("Failed to deserialize trace summary message: {:?}", e);
                    let _ = acker.reject(false).await;
                    continue;
                }
            };

        // Process the trace summary generation
        if let Err(e) = process_single_trace_summary(
            &client,
            db.clone(),
            queue.clone(),
            trace_summary_message,
            acker,
        )
        .await
        {
            log::error!("Failed to process trace summary: {:?}", e);
        }
    }

    log::warn!("Trace summary queue closed connection. Shutting down trace summary listener");
}

async fn process_single_trace_summary(
    client: &reqwest::Client,
    db: Arc<db::DB>,
    queue: Arc<MessageQueue>,
    message: TraceSummaryMessage,
    acker: MessageQueueAcker,
) -> anyhow::Result<()> {
    // Route to appropriate service based on whether event_definition is present
    if message.event_definition.is_some() {
        process_event_identification(client, message, acker).await
    } else {
        process_trace_summary(client, db, queue, message, acker).await
    }
}

/// Process trace summary generation (without event definition)
async fn process_trace_summary(
    client: &reqwest::Client,
    db: Arc<db::DB>,
    queue: Arc<MessageQueue>,
    message: TraceSummaryMessage,
    acker: MessageQueueAcker,
) -> anyhow::Result<()> {
    let service_url = match env::var("TRACE_SUMMARIZER_URL") {
        Ok(url) => url,
        Err(_) => {
            log::error!("TRACE_SUMMARIZER_URL environment variable not set");
            reject_message(&acker).await;
            return Ok(());
        }
    };

    let auth_token = match env::var("TRACE_SUMMARIZER_SECRET_KEY") {
        Ok(token) => token,
        Err(_) => {
            log::error!("TRACE_SUMMARIZER_SECRET_KEY environment variable not set");
            reject_message(&acker).await;
            return Ok(());
        }
    };

    let request_body = serde_json::json!({
        "project_id": message.project_id.to_string(),
        "trace_id": message.trace_id.to_string(),
        "trigger_span_id": message.trigger_span_id.to_string(),
    });

    match call_service_with_retry(client, &service_url, &auth_token, &request_body, &message).await
    {
        Ok(response_text) => {
            let response = serde_json::from_str::<TraceSummaryResponse>(&response_text).unwrap();
            log::info!("Trace summary response: {:?}", response);

            // Check if status is error or warning and push to notification queue
            let event_name = match response.status.as_str() {
                "error" => Some("error_trace_analysis"),
                "warning" => Some("warning_trace_analysis"),
                _ => None,
            };

            if let Some(event_name) = event_name {
                // Get all channels configured for this event
                match db::slack_channel_to_events::get_channels_for_event(
                    &db.pool,
                    message.project_id,
                    event_name,
                )
                .await
                {
                    Ok(channels) => {
                        if channels.is_empty() {
                            log::debug!(
                                "Event {} not configured for project {}",
                                event_name,
                                message.project_id
                            );
                        } else {
                            // Push a notification for each configured channel
                            for channel in channels {
                                let payload = notifications::TraceAnalysisPayload {
                                    summary: response.summary.clone(),
                                    analysis: response.analysis.clone(),
                                    analysis_preview: response.analysis_preview.clone(),
                                    span_ids_map: response.span_ids_map.clone(),
                                    channel_id: channel.channel_id.clone(),
                                    integration_id: channel.integration_id,
                                };

                                let notification_message = notifications::NotificationMessage {
                                    project_id: message.project_id,
                                    trace_id: message.trace_id,
                                    span_id: message.trigger_span_id,
                                    notification_type: "trace_analysis".to_string(),
                                    event_name: event_name.to_string(),
                                    payload: serde_json::to_value(&payload).unwrap(),
                                };

                                if let Err(e) = notifications::push_to_notification_queue(
                                    notification_message,
                                    queue.clone(),
                                )
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
                    Err(e) => {
                        log::error!("Failed to fetch event configuration: {:?}", e);
                    }
                }
            }

            if let Err(e) = acker.ack().await {
                log::error!("Failed to ack trace summary message: {:?}", e);
            }
        }
        Err(e) => {
            log::error!(
                "Failed to process trace summary after retries: trace_id={}, project_id={}, trigger_span_id={}, error={:?}",
                message.trace_id,
                message.project_id,
                message.trigger_span_id,
                e
            );
            reject_message(&acker).await;
        }
    }

    Ok(())
}

/// Process event identification (with event definition)
async fn process_event_identification(
    client: &reqwest::Client,
    message: TraceSummaryMessage,
    acker: MessageQueueAcker,
) -> anyhow::Result<()> {
    let event_definition = message
        .event_definition
        .as_ref()
        .expect("event_definition should be Some");

    let service_url = match env::var("TRACE_EVENT_IDENTIFIER_URL") {
        Ok(url) => url,
        Err(_) => {
            log::error!("TRACE_EVENT_IDENTIFIER_URL environment variable not set");
            reject_message(&acker).await;
            return Ok(());
        }
    };

    let auth_token = match env::var("TRACE_SUMMARIZER_SECRET_KEY") {
        Ok(token) => token,
        Err(_) => {
            log::error!("TRACE_SUMMARIZER_SECRET_KEY environment variable not set");
            reject_message(&acker).await;
            return Ok(());
        }
    };

    let request_body = serde_json::json!({
        "project_id": message.project_id.to_string(),
        "trace_id": message.trace_id.to_string(),
        "trigger_span_id": message.trigger_span_id.to_string(),
        "event_definition": serde_json::to_value(event_definition).unwrap(),
    });

    match call_service_with_retry(client, &service_url, &auth_token, &request_body, &message).await
    {
        Ok(_response_text) => {
            if let Err(e) = acker.ack().await {
                log::error!("Failed to ack event identification message: {:?}", e);
            }
        }
        Err(e) => {
            log::error!(
                "Failed to process event identification after retries: trace_id={}, project_id={}, trigger_span_id={}, error={:?}",
                message.trace_id,
                message.project_id,
                message.trigger_span_id,
                e
            );
            reject_message(&acker).await;
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

/// Helper function to reject a message
async fn reject_message(acker: &MessageQueueAcker) {
    if let Err(e) = acker.reject(false).await {
        log::error!("Failed to reject message: {:?}", e);
    }
}
