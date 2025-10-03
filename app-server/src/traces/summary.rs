use std::env;
use std::sync::Arc;

use backoff::ExponentialBackoffBuilder;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{
    TRACE_SUMMARY_EXCHANGE, TRACE_SUMMARY_QUEUE, TRACE_SUMMARY_ROUTING_KEY,
    eligibility::check_trace_eligibility,
};
use crate::{
    cache::Cache,
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
}

/// Push a trace completion message to the trace summary queue
pub async fn push_to_trace_summary_queue(
    trace_id: Uuid,
    project_id: Uuid,
    queue: Arc<MessageQueue>,
) -> anyhow::Result<()> {
    let message = TraceSummaryMessage {
        trace_id,
        project_id,
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
pub async fn process_trace_summaries(db: Arc<DB>, cache: Arc<Cache>, queue: Arc<MessageQueue>) {
    loop {
        inner_process_trace_summaries(db.clone(), cache.clone(), queue.clone()).await;
        log::warn!("Trace summary listener exited. Rebinding queue connection...");
    }
}

async fn inner_process_trace_summaries(db: Arc<DB>, cache: Arc<Cache>, queue: Arc<MessageQueue>) {
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
            cache.clone(),
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
    db: Arc<DB>,
    cache: Arc<Cache>,
    message: TraceSummaryMessage,
    acker: MessageQueueAcker,
) -> anyhow::Result<()> {
    let eligibility_result = check_trace_eligibility(db, cache, message.project_id).await?;

    if !eligibility_result.is_eligible {
        log::info!(
            "Skipping trace summary generation: trace_id={}, project_id={}, reason={}",
            message.trace_id,
            message.project_id,
            eligibility_result.reason.unwrap_or_default()
        );
        if let Err(e) = acker.ack().await {
            log::error!("Failed to ack trace summary message: {:?}", e);
        }
        return Ok(());
    }

    let summarizer_service_url = env::var("TRACE_SUMMARIZER_URL")
        .map_err(|_| anyhow::anyhow!("TRACE_SUMMARIZER_URL environment variable not set"))?;

    let auth_token = env::var("TRACE_SUMMARIZER_SECRET_KEY")
        .map_err(|_| anyhow::anyhow!("TRACE_SUMMARIZER_SECRET_KEY environment variable not set"))?;

    let request_body = serde_json::json!({
        "projectId": message.project_id.to_string(),
        "traceId": message.trace_id.to_string(),
        "maxRetries": 5
    });

    let call_summarizer_service = || async {
        let response = client
            .post(&summarizer_service_url)
            .header("Authorization", format!("Bearer {}", auth_token))
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .await
            .map_err(|e| {
                log::warn!("Failed to call summarizer service for trace summary: {:?}", e);
                backoff::Error::transient(anyhow::Error::from(e))
            })?;

        if response.status().is_success() {
            let response_text = response.text().await.unwrap_or_default();
            log::debug!(
                "Summarizer service response for trace_id={}, project_id={}: {}",
                message.trace_id,
                message.project_id,
                response_text
            );
            Ok(())
        } else {
            let status = response.status();
            let response_text = response.text().await.unwrap_or_default();
            log::warn!(
                "Summarizer service returned error status for trace summary: {}, Response: {}",
                status,
                response_text
            );
            Err(backoff::Error::transient(anyhow::anyhow!(
                "Summarizer service error: {}, Response: {}",
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

    match backoff::future::retry(backoff, call_summarizer_service).await {
        Ok(_) => {
            log::info!(
                "Successfully generated trace summary: trace_id={}, project_id={}",
                message.trace_id,
                message.project_id
            );
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
