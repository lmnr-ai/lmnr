use std::env;
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{CLUSTERING_EXCHANGE, CLUSTERING_ROUTING_KEY};
use crate::cache::{Cache, CacheTrait, keys};
use crate::mq::{MessageQueue, MessageQueueTrait};
use crate::worker::MessageHandler;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ClusteringMessage {
    pub trace_id: Uuid,
    pub project_id: Uuid,
    pub content: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct ClusterRequest {
    project_id: String,
    trace_id: String,
    content: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct ClusterResponse {
    success: bool,
}

/// Push a clustering message to the clustering queue
pub async fn push_to_clustering_queue(
    trace_id: Uuid,
    project_id: Uuid,
    content: String,
    queue: Arc<MessageQueue>,
) -> anyhow::Result<()> {
    let message = ClusteringMessage {
        trace_id,
        project_id,
        content,
    };

    let serialized = serde_json::to_vec(&message)?;

    queue
        .publish(&serialized, CLUSTERING_EXCHANGE, CLUSTERING_ROUTING_KEY)
        .await?;

    log::debug!(
        "Pushed clustering message to queue: trace_id={}, project_id={}",
        trace_id,
        project_id,
    );

    Ok(())
}

/// Handler for clustering messages
pub struct ClusteringHandler {
    pub cache: Arc<Cache>,
}

#[async_trait]
impl MessageHandler for ClusteringHandler {
    type Message = ClusteringMessage;

    async fn handle(&self, message: Self::Message) -> anyhow::Result<()> {
        process_clustering_logic(&self.cache, message).await
    }

    fn on_error(&self, error: &anyhow::Error) -> crate::worker::ErrorAction {
        let error_msg = error.to_string();

        // Requeue on lock timeout - another worker might get the lock next time
        if error_msg.contains("Lock timeout") {
            log::warn!("Clustering lock timeout, requeuing message for retry");
            crate::worker::ErrorAction::Reject { requeue: true }
        } else {
            // Other errors: don't requeue (likely permanent failures)
            crate::worker::ErrorAction::Reject { requeue: false }
        }
    }
}

async fn process_clustering_logic(
    cache: &Arc<Cache>,
    message: ClusteringMessage,
) -> anyhow::Result<()> {
    let lock_key = format!("{}-{}", keys::CLUSTERING_LOCK_CACHE_KEY, message.project_id);
    let lock_ttl = 300; // 5 minutes
    let max_wait_duration = Duration::from_secs(300); // 5 minutes max wait
    let start_time = tokio::time::Instant::now();

    // Try to acquire lock, wait if already locked (with timeout)
    loop {
        // Check if we've exceeded the max wait time
        if start_time.elapsed() >= max_wait_duration {
            log::warn!(
                "Timeout waiting for clustering lock for project_id={}, will retry",
                message.project_id
            );
            return Err(anyhow::anyhow!("Lock timeout")); // Will cause message to be requeued
        }

        match cache.try_acquire_lock(&lock_key, lock_ttl).await {
            Ok(true) => {
                // Lock acquired, proceed with clustering
                log::debug!(
                    "Acquired clustering lock for project_id={}",
                    message.project_id
                );
                break;
            }
            Ok(false) => {
                // Lock already held, wait and retry
                tokio::time::sleep(Duration::from_millis(500)).await;
                continue;
            }
            Err(e) => {
                log::error!("Failed to acquire clustering lock: {:?}", e);
                return Err(e.into());
            }
        }
    }

    let client = reqwest::Client::new();

    // Call clustering endpoint
    let result = call_clustering_endpoint(&client, &message).await;

    // Always release lock
    if let Err(e) = cache.release_lock(&lock_key).await {
        log::error!("Failed to release clustering lock: {:?}", e);
    } else {
        log::debug!(
            "Released clustering lock for project_id={}",
            message.project_id
        );
    }

    match result {
        Ok(success) => {
            if success {
                log::info!(
                    "Successfully clustered trace: trace_id={}, project_id={}",
                    message.trace_id,
                    message.project_id
                );
            } else {
                log::warn!(
                    "Clustering endpoint returned success=false for trace_id={}, project_id={}",
                    message.trace_id,
                    message.project_id
                );
            }
            Ok(())
        }
        Err(e) => {
            log::error!(
                "Failed to call clustering endpoint for trace_id={}, project_id={}: {:?}",
                message.trace_id,
                message.project_id,
                e
            );
            Err(e)
        }
    }
}

async fn call_clustering_endpoint(
    client: &reqwest::Client,
    message: &ClusteringMessage,
) -> anyhow::Result<bool> {
    let cluster_endpoint = env::var("CLUSTER_ENDPOINT")
        .map_err(|_| anyhow::anyhow!("CLUSTER_ENDPOINT environment variable not set"))?;

    let cluster_endpoint_key = env::var("CLUSTER_ENDPOINT_KEY")
        .map_err(|_| anyhow::anyhow!("CLUSTER_ENDPOINT_KEY environment variable not set"))?;

    let request_body = ClusterRequest {
        project_id: message.project_id.to_string(),
        trace_id: message.trace_id.to_string(),
        content: message.content.clone(),
    };

    let response = client
        .post(&cluster_endpoint)
        .header("Authorization", format!("Bearer {}", cluster_endpoint_key))
        .header("Content-Type", "application/json")
        .json(&request_body)
        .timeout(Duration::from_secs(60))
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(anyhow::anyhow!(
            "Clustering endpoint returned error: status={}, body={}",
            status,
            body
        ));
    }

    let cluster_response: ClusterResponse = response.json().await?;
    Ok(cluster_response.success)
}
