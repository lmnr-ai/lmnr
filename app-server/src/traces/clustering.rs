use std::env;
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use crate::cache::{Cache, CacheTrait, keys};
use crate::utils::{call_service_with_retry, render_mustache_template};
use crate::worker::{HandlerError, MessageHandler};

use crate::clustering::ClusteringBatchMessage;

#[derive(Serialize, Deserialize, Debug, Clone)]
struct ClusterResponse {
    success: bool,
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
    type Message = ClusteringBatchMessage;

    async fn handle(&self, message: Self::Message) -> Result<(), HandlerError> {
        process_clustering_logic(message, self.cache.clone(), self.client.clone()).await
    }
}

async fn process_clustering_logic(
    message: ClusteringBatchMessage,
    cache: Arc<Cache>,
    client: reqwest::Client,
) -> Result<(), HandlerError> {
    let first = match message.events.first() {
        Some(event) => event,
        None => return Ok(()),
    };
    let project_id = first.project_id;

    let lock_key = format!("{}-{}", keys::CLUSTERING_LOCK_CACHE_KEY, project_id);
    let lock_ttl = 300; // 5 minutes
    let max_wait_duration = Duration::from_secs(300); // 5 minutes max wait
    let start_time = tokio::time::Instant::now();

    // Try to acquire lock, wait if already locked (with timeout)
    loop {
        // Check if we've exceeded the max wait time
        if start_time.elapsed() >= max_wait_duration {
            log::warn!(
                "Timeout waiting for clustering lock for project_id={}, requeuing",
                project_id
            );
            return Err(HandlerError::transient(anyhow::anyhow!("Lock timeout")));
        }

        match cache.try_acquire_lock(&lock_key, lock_ttl).await {
            Ok(true) => {
                // Lock acquired, proceed with clustering
                log::debug!("Acquired clustering lock for project_id={}", project_id);
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
        log::debug!("Released clustering lock for project_id={}", project_id);
    }

    match result {
        Ok(success) => {
            if success {
                log::info!("Successfully clustered event for project_id={}", project_id);
            } else {
                log::warn!(
                    "Clustering endpoint returned success=false for project_id={}",
                    project_id
                );
            }
            Ok(())
        }
        Err(e) => {
            log::error!(
                "Failed to call clustering endpoint for project_id={}: {:?}",
                project_id,
                e
            );
            Err(e.into())
        }
    }
}

async fn call_clustering_endpoint(
    client: &reqwest::Client,
    message: &ClusteringBatchMessage,
) -> anyhow::Result<bool> {
    let cluster_endpoint = env::var("CLUSTERING_SERVICE_URL")
        .map_err(|_| anyhow::anyhow!("CLUSTERING_SERVICE_URL environment variable not set"))?;

    let cluster_endpoint_key = env::var("CLUSTERING_SERVICE_SECRET_KEY").map_err(|_| {
        anyhow::anyhow!("CLUSTERING_SERVICE_SECRET_KEY environment variable not set")
    })?;

    let mut events = Vec::new();
    for message in &message.events {
        // Render the value_template with event attributes
        let attributes = message.signal_event.payload_value().unwrap_or_default();
        let content = render_mustache_template(&message.value_template, &attributes)?;

        let event = serde_json::json!({
            "project_id": message.project_id.to_string(),
            "event_name": message.signal_event.name,
            "event_id": message.signal_event.id.to_string(),
            "content": content,
            "event_source": message.signal_event.source().to_string(),
        });
        events.push(event);
    }

    let request_body = serde_json::json!({
        "events": events,
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
