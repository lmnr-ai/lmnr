use std::env;
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::cache::{Cache, CacheTrait, keys::CLUSTERING_LOCK_CACHE_KEY};
use crate::utils::{call_service_with_retry, get_unsigned_env_with_default};
use crate::worker::{HandlerError, MessageHandler};

use crate::clustering::ClusteringBatchMessage;

const DEFAULT_LOCK_TTL_SECONDS: usize = 300;
const DEFAULT_LOCK_MAX_WAIT_SECONDS: usize = 300;

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
    // All events in the batch have the same project_id and signal_id
    let first = match message.events.first() {
        Some(event) => event,
        None => return Ok(()),
    };
    let project_id = first.project_id;
    let signal_id = first.signal_id;

    // legacy lock. Keeping for the time of migration. To be dropped in a follow up release
    let project_lock_key = format!("{CLUSTERING_LOCK_CACHE_KEY}-{project_id}");
    // new, more granular lock
    let signal_lock_key = format!("{CLUSTERING_LOCK_CACHE_KEY}-{project_id}-{signal_id}");
    let lock_ttl =
        get_unsigned_env_with_default("CLUSTERING_LOCK_TTL_SECONDS", DEFAULT_LOCK_TTL_SECONDS);
    let max_wait = get_unsigned_env_with_default(
        "CLUSTERING_LOCK_MAX_WAIT_SECONDS",
        DEFAULT_LOCK_MAX_WAIT_SECONDS,
    );
    let max_wait_duration = Duration::from_secs(max_wait as u64);
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

        match cache
            .try_acquire_lock(&project_lock_key, lock_ttl as u64)
            .await
        {
            Ok(true) => {
                // Project lock acquired, now try to acquire per-signal lock
                match cache
                    .try_acquire_lock(&signal_lock_key, lock_ttl as u64)
                    .await
                {
                    Ok(true) => {
                        log::debug!(
                            "Acquired project and signal clustering locks for project_id={}, signal_id={}. Releasing project lock.",
                            project_id,
                            signal_id
                        );
                        if let Err(e) = cache.release_lock(&project_lock_key).await {
                            log::error!(
                                "Failed to release LEGACY project clustering lock: {:?}",
                                e
                            );
                        }
                        break;
                    }
                    Ok(false) => {
                        // Signal lock already held, release project lock and retry
                        if let Err(e) = cache.release_lock(&project_lock_key).await {
                            log::error!(
                                "Failed to release LEGACY project clustering lock: {:?}",
                                e
                            );
                        }
                        tokio::time::sleep(Duration::from_millis(500)).await;
                        continue;
                    }
                    Err(e) => {
                        log::error!("Failed to acquire signal clustering lock: {:?}", e);
                        let _ = cache.release_lock(&project_lock_key).await;
                        return Err(HandlerError::permanent(e));
                    }
                }
            }
            Ok(false) => {
                // Project lock already held, wait and retry
                tokio::time::sleep(Duration::from_millis(500)).await;
                continue;
            }
            Err(e) => {
                log::error!("Failed to acquire project clustering lock: {:?}", e);
                return Err(HandlerError::permanent(e));
            }
        }
    }

    // Call clustering endpoint
    let result = call_clustering_endpoint(&client, project_id, signal_id, &message).await;

    // Always release signal lock. Project lock was released early.
    if let Err(e) = cache.release_lock(&signal_lock_key).await {
        log::error!("Failed to release signal clustering lock: {:?}", e);
    } else {
        log::debug!(
            "Released signal clustering lock for project_id={}, signal_id={}",
            project_id,
            signal_id
        );
    }

    match result {
        Ok(success) => {
            if success {
                log::info!(
                    "Successfully clustered events for project_id={}",
                    project_id
                );
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
    project_id: Uuid,
    signal_id: Uuid,
    message: &ClusteringBatchMessage,
) -> anyhow::Result<bool> {
    let cluster_endpoint = env::var("CLUSTERING_SERVICE_URL")
        .map_err(|_| anyhow::anyhow!("CLUSTERING_SERVICE_URL environment variable not set"))?;

    let cluster_endpoint_key = env::var("CLUSTERING_SERVICE_SECRET_KEY").map_err(|_| {
        anyhow::anyhow!("CLUSTERING_SERVICE_SECRET_KEY environment variable not set")
    })?;

    let mut events: Vec<serde_json::Value> = Vec::new();
    for message in &message.events {
        let event = serde_json::json!({
            "signal_event_id": message.event_id.to_string(),
            "content": message.content,
        });
        events.push(event);
    }

    let request_body = serde_json::json!({
        "project_id": project_id.to_string(),
        "signal_id": signal_id.to_string(),
        "signal_events": events,
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
