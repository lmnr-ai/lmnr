use std::collections::HashMap;
use std::env;
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::batch_worker::config::BatchingConfig;
use crate::batch_worker::message_handler::{BatchMessageHandler, HandlerResult, MessageDelivery};
use crate::cache::{Cache, CacheTrait, keys};
use crate::clustering::{ClusteringBatchMessage, ClusteringMessage};
use crate::utils::call_service_with_retry_config;
use crate::worker::HandlerError;

#[derive(Serialize, Deserialize, Debug, Clone)]
struct ClusterResponse {
    success: bool,
}

/// Handler for clustering batch messages that rebatches by project_id.
///
/// Messages arriving on the batch queue are already grouped by (project_id, signal_id).
/// This handler accumulates them further by project_id so that a single lock acquisition
/// can cover multiple signal_ids for the same project, dramatically reducing lock contention
/// and avoiding the 30-minute RabbitMQ ack timeout.
pub struct ClusteringHandler {
    cache: Arc<Cache>,
    client: reqwest::Client,
    config: BatchingConfig,
}

impl ClusteringHandler {
    pub fn new(cache: Arc<Cache>, client: reqwest::Client, config: BatchingConfig) -> Self {
        Self {
            cache,
            client,
            config,
        }
    }

    /// Flush all deliveries for a single project_id: acquire lock once, call the
    /// downstream endpoint for each signal_id, release lock.
    async fn flush_project(
        &self,
        project_id: Uuid,
        deliveries: Vec<MessageDelivery<ClusteringBatchMessage>>,
    ) -> Result<
        Vec<MessageDelivery<ClusteringBatchMessage>>,
        (Vec<MessageDelivery<ClusteringBatchMessage>>, HandlerError),
    > {
        let result = self
            .process_project(project_id, &deliveries)
            .await;

        match result {
            Ok(()) => Ok(deliveries),
            Err(e) => Err((deliveries, e)),
        }
    }

    /// Process all deliveries for a project under a single lock hold.
    async fn process_project(
        &self,
        project_id: Uuid,
        deliveries: &[MessageDelivery<ClusteringBatchMessage>],
    ) -> Result<(), HandlerError> {
        let lock_key = format!("{}-{}", keys::CLUSTERING_LOCK_CACHE_KEY, project_id);
        let start_time = tokio::time::Instant::now();

        // Try to acquire lock, wait if already locked (with timeout)
        loop {
            if start_time.elapsed() >= CLUSTERING_LOCK_WAIT {
                log::warn!(
                    "Timeout waiting for clustering lock for project_id={}, requeuing",
                    project_id
                );
                return Err(HandlerError::transient(anyhow::anyhow!("Lock timeout")));
            }

            match self
                .cache
                .try_acquire_lock(&lock_key, CLUSTERING_LOCK_TTL_SECS)
                .await
            {
                Ok(true) => {
                    log::debug!("Acquired clustering lock for project_id={}", project_id);
                    break;
                }
                Ok(false) => {
                    tokio::time::sleep(Duration::from_millis(500)).await;
                    continue;
                }
                Err(e) => {
                    log::error!("Failed to acquire clustering lock: {:?}", e);
                    return Err(HandlerError::permanent(e));
                }
            }
        }

        // Group all events across deliveries by signal_id
        let mut by_signal: HashMap<Uuid, Vec<&ClusteringMessage>> = HashMap::new();
        for delivery in deliveries {
            for event in &delivery.message.events {
                by_signal
                    .entry(event.signal_id)
                    .or_default()
                    .push(event);
            }
        }

        // Call the downstream endpoint once per signal_id (under the same lock)
        let mut had_error = false;
        for (signal_id, events) in &by_signal {
            match call_clustering_endpoint(&self.client, project_id, *signal_id, events).await {
                Ok(success) => {
                    if success {
                        log::info!(
                            "Successfully clustered {} events for project_id={}, signal_id={}",
                            events.len(),
                            project_id,
                            signal_id
                        );
                    } else {
                        log::warn!(
                            "Clustering endpoint returned success=false for project_id={}, signal_id={}",
                            project_id,
                            signal_id
                        );
                    }
                }
                Err(e) => {
                    log::error!(
                        "Failed to call clustering endpoint for project_id={}, signal_id={}: {:?}",
                        project_id,
                        signal_id,
                        e
                    );
                    had_error = true;
                    // Continue processing other signal_ids rather than failing the whole batch.
                    // The events for this signal_id will be lost (not requeued), but we avoid
                    // blocking all other signals for the same project.
                }
            }
        }

        // Always release lock
        if let Err(e) = self.cache.release_lock(&lock_key).await {
            log::error!("Failed to release clustering lock: {:?}", e);
        } else {
            log::debug!("Released clustering lock for project_id={}", project_id);
        }

        if had_error {
            // We still ack the deliveries — partial failures within one lock hold should not
            // cause the entire batch to be requeued. The downstream is not idempotent, and
            // replaying already-succeeded signal_ids would be incorrect.
            // Individual signal_id failures are logged above.
            log::warn!(
                "Some signal_ids failed for project_id={}, but acking deliveries to avoid replay of succeeded signal_ids",
                project_id,
            );
        }

        Ok(())
    }
}

/// Maximum time to wait for the distributed lock before requeuing.
const CLUSTERING_LOCK_WAIT: Duration = Duration::from_secs(120);

/// TTL for the distributed lock itself (so it auto-expires if the holder crashes).
const CLUSTERING_LOCK_TTL_SECS: u64 = 300;

/// Per-request timeout for the clustering HTTP call.
const CLUSTERING_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

/// Total retry budget for the clustering HTTP call (across all attempts).
const CLUSTERING_RETRY_BUDGET: Duration = Duration::from_secs(60);

/// State: deliveries accumulated per project_id, waiting to be flushed.
pub type ClusteringState = HashMap<Uuid, Vec<MessageDelivery<ClusteringBatchMessage>>>;

#[async_trait]
impl BatchMessageHandler for ClusteringHandler {
    type Message = ClusteringBatchMessage;
    type State = ClusteringState;

    fn interval(&self) -> Duration {
        self.config.flush_interval / 2
    }

    fn initial_state(&self) -> Self::State {
        HashMap::new()
    }

    async fn handle_message(
        &self,
        delivery: MessageDelivery<Self::Message>,
        state: &mut Self::State,
    ) -> HandlerResult<Self::Message> {
        // Extract project_id from the first event in the batch
        let project_id = match delivery.message.events.first() {
            Some(event) => event.project_id,
            None => {
                // Empty batch — just ack immediately
                return HandlerResult::ack(vec![delivery]);
            }
        };

        state
            .entry(project_id)
            .or_default()
            .push(delivery);

        let batch_len: usize = state.values().map(|v| v.len()).sum();
        log::debug!(
            "Clustering rebatch state: {} projects, {} total deliveries",
            state.len(),
            batch_len
        );

        // Flush if total number of accumulated deliveries reaches batch size
        if batch_len >= self.config.size {
            return self.flush_all(state).await;
        }

        HandlerResult::empty()
    }

    async fn handle_interval(&self, state: &mut Self::State) -> HandlerResult<Self::Message> {
        if state.is_empty() {
            return HandlerResult::empty();
        }

        log::debug!(
            "Clustering interval flush: {} projects, {} total deliveries",
            state.len(),
            state.values().map(|v| v.len()).sum::<usize>()
        );

        self.flush_all(state).await
    }
}

impl ClusteringHandler {
    /// Flush all projects in state, returning combined results.
    async fn flush_all(
        &self,
        state: &mut ClusteringState,
    ) -> HandlerResult<ClusteringBatchMessage> {
        let mut to_ack = Vec::new();
        let mut to_reject = Vec::new();
        let mut to_requeue = Vec::new();

        // Drain state
        let projects: HashMap<Uuid, Vec<MessageDelivery<ClusteringBatchMessage>>> =
            std::mem::take(state);

        for (project_id, deliveries) in projects {
            match self.flush_project(project_id, deliveries).await {
                Ok(acked) => to_ack.extend(acked),
                Err((failed, error)) => {
                    if error.should_requeue() {
                        to_requeue.extend(failed);
                    } else {
                        to_reject.extend(failed);
                    }
                }
            }
        }

        HandlerResult {
            to_ack,
            to_reject,
            to_requeue,
        }
    }
}

async fn call_clustering_endpoint(
    client: &reqwest::Client,
    project_id: Uuid,
    signal_id: Uuid,
    events: &[&ClusteringMessage],
) -> anyhow::Result<bool> {
    let cluster_endpoint = env::var("CLUSTERING_SERVICE_URL")
        .map_err(|_| anyhow::anyhow!("CLUSTERING_SERVICE_URL environment variable not set"))?;

    let cluster_endpoint_key = env::var("CLUSTERING_SERVICE_SECRET_KEY").map_err(|_| {
        anyhow::anyhow!("CLUSTERING_SERVICE_SECRET_KEY environment variable not set")
    })?;

    let events_json: Vec<serde_json::Value> = events
        .iter()
        .map(|msg| {
            serde_json::json!({
                "signal_event_id": msg.event_id.to_string(),
                "content": msg.content,
            })
        })
        .collect();

    let request_body = serde_json::json!({
        "project_id": project_id.to_string(),
        "signal_id": signal_id.to_string(),
        "signal_events": events_json,
    });

    let cluster_response: ClusterResponse = call_service_with_retry_config(
        client,
        &cluster_endpoint,
        &cluster_endpoint_key,
        &request_body,
        CLUSTERING_RETRY_BUDGET,
        CLUSTERING_REQUEST_TIMEOUT,
    )
    .await?;

    Ok(cluster_response.success)
}
