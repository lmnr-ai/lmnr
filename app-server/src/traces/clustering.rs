use std::env;
use std::sync::Arc;
use std::time::Duration;

use backoff::ExponentialBackoffBuilder;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{CLUSTERING_EXCHANGE, CLUSTERING_QUEUE, CLUSTERING_ROUTING_KEY};
use crate::cache::{Cache, CacheTrait, keys};
use crate::db;
use crate::mq::{
    MessageQueue, MessageQueueAcker, MessageQueueDeliveryTrait, MessageQueueReceiverTrait,
    MessageQueueTrait,
};

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

/// Main worker function to process clustering messages
pub async fn process_clustering(db: Arc<db::DB>, cache: Arc<Cache>, queue: Arc<MessageQueue>) {
    loop {
        inner_process_clustering(db.clone(), cache.clone(), queue.clone()).await;
        log::warn!("Clustering listener exited. Rebinding queue connection...");
    }
}

async fn inner_process_clustering(_db: Arc<db::DB>, cache: Arc<Cache>, queue: Arc<MessageQueue>) {
    // Add retry logic with exponential backoff for connection failures
    let get_receiver = || async {
        queue
            .get_receiver(
                CLUSTERING_QUEUE,
                CLUSTERING_EXCHANGE,
                CLUSTERING_ROUTING_KEY,
            )
            .await
            .map_err(|e| {
                log::error!("Failed to get receiver from clustering queue: {:?}", e);
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
            log::info!("Successfully connected to clustering queue");
            receiver
        }
        Err(e) => {
            log::error!(
                "Failed to connect to clustering queue after retries: {:?}",
                e
            );
            return;
        }
    };

    log::info!("Started processing clustering messages from queue");

    let client = reqwest::Client::new();

    while let Some(delivery) = receiver.receive().await {
        if let Err(e) = delivery {
            log::error!("Failed to receive message from clustering queue: {:?}", e);
            continue;
        }
        let delivery = delivery.unwrap();
        let acker = delivery.acker();
        let clustering_message = match serde_json::from_slice::<ClusteringMessage>(&delivery.data())
        {
            Ok(message) => message,
            Err(e) => {
                log::error!("Failed to deserialize clustering message: {:?}", e);
                let _ = acker.reject(false).await;
                continue;
            }
        };

        // Process the clustering message
        if let Err(e) =
            process_single_clustering(&client, cache.clone(), clustering_message, acker).await
        {
            log::error!("Failed to process clustering: {:?}", e);
        }
    }

    log::warn!("Clustering queue closed connection. Shutting down clustering listener");
}

async fn process_single_clustering(
    client: &reqwest::Client,
    cache: Arc<Cache>,
    message: ClusteringMessage,
    acker: MessageQueueAcker,
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
                "Timeout waiting for clustering lock for project_id={}, requeuing message",
                message.project_id
            );
            // Requeue the message to try again later
            let _ = acker.reject(true).await; // true = requeue
            return Ok(());
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
                // Log and continue without clustering
                if let Err(e) = acker.ack().await {
                    log::error!("Failed to ack clustering message: {:?}", e);
                }
                return Ok(());
            }
        }
    }

    // Call clustering endpoint
    let result = call_clustering_endpoint(client, &message).await;

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
            let _ = acker.ack().await;
        }
        Err(e) => {
            log::error!(
                "Failed to call clustering endpoint for trace_id={}, project_id={}: {:?}",
                message.trace_id,
                message.project_id,
                e
            );
            let _ = acker.ack().await;
        }
    }

    Ok(())
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
