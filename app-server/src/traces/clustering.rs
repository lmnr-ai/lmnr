use std::env;
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{EVENT_CLUSTERING_EXCHANGE, EVENT_CLUSTERING_ROUTING_KEY};
use crate::cache::{Cache, CacheTrait, keys};
use crate::db::events::Event;
use crate::mq::{MessageQueue, MessageQueueTrait};
use crate::utils::{call_service_with_retry, render_mustache_template};
use crate::worker::{HandlerError, MessageHandler};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ClusteringMessage {
    pub project_id: Uuid,
    pub event: Event,
    pub value_template: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct ClusterResponse {
    success: bool,
}

/// Push an event clustering message to the event clustering queue
pub async fn push_to_event_clustering_queue(
    project_id: Uuid,
    event: Event,
    value_template: String,
    queue: Arc<MessageQueue>,
) -> anyhow::Result<()> {
    let message = ClusteringMessage {
        project_id,
        event,
        value_template,
    };

    let serialized = serde_json::to_vec(&message)?;

    queue
        .publish(
            &serialized,
            EVENT_CLUSTERING_EXCHANGE,
            EVENT_CLUSTERING_ROUTING_KEY,
        )
        .await?;

    log::debug!(
        "Pushed event clustering message to queue: project_id={}",
        project_id,
    );

    Ok(())
}

/// Handler for clustering messages
pub struct ClusteringHandler {
    cache: Arc<Cache>,
    client: reqwest::Client,
}

impl ClusteringHandler {
    pub fn new(cache: Arc<Cache>, client: reqwest::Client) -> Self {
        Self { cache, client }
    }
}

#[async_trait]
impl MessageHandler for ClusteringHandler {
    type Message = ClusteringMessage;

    async fn handle(&self, message: Self::Message) -> Result<(), HandlerError> {
        process_clustering_logic(message, self.cache.clone(), self.client.clone()).await
    }
}

async fn process_clustering_logic(
    message: ClusteringMessage,
    cache: Arc<Cache>,
    client: reqwest::Client,
) -> Result<(), HandlerError> {
    let lock_key = format!("{}-{}", keys::CLUSTERING_LOCK_CACHE_KEY, message.project_id);
    let lock_ttl = 300; // 5 minutes
    let max_wait_duration = Duration::from_secs(300); // 5 minutes max wait
    let start_time = tokio::time::Instant::now();

    // Try to acquire lock, wait if already locked (with timeout)
    loop {
        // Check if we've exceeded the max wait time
        if start_time.elapsed() >= max_wait_duration {
            log::warn!(
                "Timeout waiting for clustering lock for project_id={}, requeuing",
                message.project_id
            );
            return Err(HandlerError::transient(anyhow::anyhow!("Lock timeout")));
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
                return Err(HandlerError::permanent(e));
            }
        }
    }

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
                    "Successfully clustered event for project_id={}",
                    message.project_id
                );
            } else {
                log::warn!(
                    "Clustering endpoint returned success=false for project_id={}",
                    message.project_id
                );
            }
            Ok(())
        }
        Err(e) => {
            log::error!(
                "Failed to call clustering endpoint for project_id={}: {:?}",
                message.project_id,
                e
            );
            Err(e.into())
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

    // Render the value_template with event attributes
    let content = render_mustache_template(&message.value_template, &message.event.attributes)?;

    let request_body = serde_json::json!({
        "project_id": message.project_id.to_string(),
        "event": message.event,
        "content": content,
    });

    let cluster_response: ClusterResponse = call_service_with_retry(
        client,
        &cluster_endpoint,
        &cluster_endpoint_key,
        &request_body,
    )
    .await?;

    Ok(cluster_response.success)
}
