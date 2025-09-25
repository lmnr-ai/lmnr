//! This module handles trace summary generation
//! It reads trace completion messages from RabbitMQ and generates summaries via internal API

use std::env;
use std::sync::Arc;

use backoff::ExponentialBackoffBuilder;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{TRACE_SUMMARY_EXCHANGE, TRACE_SUMMARY_QUEUE, TRACE_SUMMARY_ROUTING_KEY};
use crate::{
    db::DB,
    mq::{
        MessageQueue, MessageQueueAcker, MessageQueueDeliveryTrait, MessageQueueReceiverTrait,
        MessageQueueTrait,
    },
};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TraceSummaryMessage {
    pub trace_id: Uuid,
    pub project_id: Uuid,
    pub trace_start_time: chrono::DateTime<chrono::Utc>,
    pub trace_end_time: chrono::DateTime<chrono::Utc>,
}

/// Push a trace completion message to the trace summary queue
pub async fn push_to_trace_summary_queue(
    trace_id: Uuid,
    project_id: Uuid,
    trace_start_time: chrono::DateTime<chrono::Utc>,
    trace_end_time: chrono::DateTime<chrono::Utc>,
    queue: Arc<MessageQueue>,
) -> anyhow::Result<()> {
    let message = TraceSummaryMessage {
        trace_id,
        project_id,
        trace_start_time,
        trace_end_time,
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
        "Pushed trace summary message to queue: trace_id={}, project_id={}",
        trace_id,
        project_id
    );

    Ok(())
}

/// Main worker function to process trace summary messages
pub async fn process_trace_summaries(_db: Arc<DB>, queue: Arc<MessageQueue>) {
    loop {
        inner_process_trace_summaries(_db.clone(), queue.clone()).await;
        log::warn!("Trace summary listener exited. Rebinding queue connection...");
    }
}

async fn inner_process_trace_summaries(_db: Arc<DB>, queue: Arc<MessageQueue>) {
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

    // Get the internal API base URL - this should be the internal service URL
    let internal_api_base_url =
        env::var("INTERNAL_API_BASE_URL").unwrap_or_else(|_| "http://localhost:3000".to_string());

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
            &internal_api_base_url,
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
    internal_api_base_url: &str,
    message: TraceSummaryMessage,
    acker: MessageQueueAcker,
) -> anyhow::Result<()> {
    let url = format!("{}/api/traces/summary", internal_api_base_url);

    // Use format instead of to_rfc3339 to ensure compatibility with Zod
    let start_time_str = message
        .trace_start_time
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string();
    let end_time_str = message
        .trace_end_time
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string();

    let request_body = serde_json::json!({
        "projectId": message.project_id.to_string(),
        "traceId": message.trace_id.to_string(),
        "traceStartTime": start_time_str,
        "traceEndTime": end_time_str
    });

    let call_internal_api = || async {
        let response = client
            .post(&url)
            .json(&request_body)
            .send()
            .await
            .map_err(|e| {
                log::warn!("Failed to call internal API for trace summary: {:?}", e);
                backoff::Error::transient(anyhow::Error::from(e))
            })?;

        if response.status().is_success() {
            Ok(response)
        } else {
            let status = response.status();
            let response_text = response.text().await.unwrap_or_default();
            log::warn!(
                "Internal API returned error status for trace summary: {}, Response: {}",
                status,
                response_text
            );
            Err(backoff::Error::transient(anyhow::anyhow!(
                "Internal API error: {}, Response: {}",
                status,
                response_text
            )))
        }
    };

    let backoff = ExponentialBackoffBuilder::new()
        .with_initial_interval(std::time::Duration::from_millis(500))
        .with_max_interval(std::time::Duration::from_secs(30))
        .with_max_elapsed_time(Some(std::time::Duration::from_secs(60 * 5))) // 5 minutes max
        .build();

    match backoff::future::retry(backoff, call_internal_api).await {
        Ok(_response) => {
            if let Err(e) = acker.ack().await {
                log::error!("Failed to ack trace summary message: {:?}", e);
            }
        }
        Err(e) => {
            log::error!(
                "Failed to generate trace summary after retries: trace_id={}, project_id={}, error={:?}",
                message.trace_id,
                message.project_id,
                e
            );
            if let Err(e) = acker.reject(false).await {
                log::error!("Failed to reject trace summary message: {:?}", e);
            }
        }
    }

    Ok(())
}
