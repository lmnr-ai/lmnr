use std::env;
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::cache::{Cache, CacheTrait, keys::CLUSTERING_LOCK_CACHE_KEY};
use crate::ch::clusters::CHCluster;
use crate::ch::service::ClickhouseService;
use crate::utils::{call_service_with_retry, get_unsigned_env_with_default};
use crate::worker::{HandlerError, MessageHandler};

use crate::clustering::ClusteringBatchMessage;

const DEFAULT_LOCK_TTL_SECONDS: usize = 300;
const DEFAULT_LOCK_MAX_WAIT_SECONDS: usize = 300;

#[derive(Serialize, Deserialize, Debug, Clone)]
struct ClusterResponseItem {
    id: Uuid,
    name: String,
    level: u8,
    parent_id: Option<Uuid>,
    signal_id: Uuid,
    num_signal_events: u32,
    num_children_clusters: u16,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct ClusterResponse {
    success: bool,
    #[serde(default)]
    new_clusters: Vec<ClusterResponseItem>,
}

/// Handler for clustering messages
pub struct ClusteringHandler {
    cache: Arc<Cache>,
    client: reqwest::Client,
    ch_service: Arc<ClickhouseService>,
}

impl ClusteringHandler {
    pub fn new(
        cache: Arc<Cache>,
        client: reqwest::Client,
        ch_service: Arc<ClickhouseService>,
    ) -> Self {
        Self {
            cache,
            client,
            ch_service,
        }
    }
}

#[async_trait]
impl MessageHandler for ClusteringHandler {
    type Message = ClusteringBatchMessage;

    async fn handle(&self, message: Self::Message) -> Result<(), HandlerError> {
        process_clustering_logic(
            message,
            self.cache.clone(),
            self.client.clone(),
            self.ch_service.clone(),
        )
        .await
    }
}

async fn process_clustering_logic(
    message: ClusteringBatchMessage,
    cache: Arc<Cache>,
    client: reqwest::Client,
    ch_service: Arc<ClickhouseService>,
) -> Result<(), HandlerError> {
    // All events in the batch have the same project_id and signal_id
    let first = match message.events.first() {
        Some(event) => event,
        None => return Ok(()),
    };
    let project_id = first.project_id;
    let signal_id = first.signal_id;

    let lock_key = format!("{CLUSTERING_LOCK_CACHE_KEY}-{project_id}-{signal_id}");
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
                "Timeout waiting for clustering lock for project_id={}, signal_id={}. Requeuing",
                project_id,
                signal_id,
            );
            return Err(HandlerError::transient(anyhow::anyhow!("Lock timeout")));
        }

        match cache.try_acquire_lock(&lock_key, lock_ttl as u64).await {
            Ok(true) => {
                // Lock acquired, proceed with clustering
                log::debug!(
                    "Acquired clustering lock for project_id={}, signal_id={}",
                    project_id,
                    signal_id,
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

    let response = match call_clustering_endpoint(&client, project_id, signal_id, &message).await {
        Ok(response) => response,
        Err(e) => {
            log::error!(
                "Failed to call clustering endpoint for project_id={}, signal_id={}: {:?}",
                project_id,
                signal_id,
                e
            );
            if let Err(e) = cache.release_lock(&lock_key).await {
                log::error!("Failed to release clustering lock: {:?}", e);
            }
            return Err(e.into());
        }
    };

    if !response.success {
        log::error!(
            "Clustering endpoint returned success=false for project_id={}, signal_id={}",
            project_id,
            signal_id,
        );
        if let Err(e) = cache.release_lock(&lock_key).await {
            log::error!("Failed to release clustering lock: {:?}", e);
        }
        return Err(HandlerError::permanent(anyhow::anyhow!(
            "Clustering endpoint returned success=false for project_id={}, signal_id={}",
            project_id,
            signal_id,
        )));
    }

    if !response.new_clusters.is_empty() {
        // Insert new clusters into ClickHouse before releasing the lock.
        // Treat CH insert errors as permanent to avoid re-clustering the same events.
        let ch_clusters: Vec<CHCluster> = response
            .new_clusters
            .iter()
            .map(|c| {
                CHCluster::new(
                    c.id,
                    project_id,
                    c.signal_id,
                    c.name.clone(),
                    c.level,
                    c.parent_id,
                    c.num_signal_events,
                    c.num_children_clusters,
                )
            })
            .collect();

        if let Err(e) = ch_service.insert_batch(project_id, &ch_clusters).await {
            log::error!(
                "Failed to insert {} clusters into ClickHouse for project_id={}, signal_id={}: {:?}",
                ch_clusters.len(),
                project_id,
                signal_id,
                e
            );
            if let Err(e) = cache.release_lock(&lock_key).await {
                log::error!("Failed to release clustering lock: {:?}", e);
            }
            return Err(HandlerError::permanent(e));
        }

        log::info!(
            "Inserted {} new clusters for project_id={}, signal_id={}",
            ch_clusters.len(),
            project_id,
            signal_id,
        );
    }

    if let Err(e) = cache.release_lock(&lock_key).await {
        log::error!("Failed to release clustering lock: {:?}", e);
    } else {
        log::debug!(
            "Released clustering lock for project_id={}, signal_id={}",
            project_id,
            signal_id,
        );
    }

    Ok(())
}

async fn call_clustering_endpoint(
    client: &reqwest::Client,
    project_id: Uuid,
    signal_id: Uuid,
    message: &ClusteringBatchMessage,
) -> anyhow::Result<ClusterResponse> {
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
            "severity": message.severity,
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

    Ok(cluster_response)
}
