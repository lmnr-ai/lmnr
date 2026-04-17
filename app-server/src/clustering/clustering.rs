use std::env;
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::cache::{Cache, CacheTrait, keys::CLUSTERING_LOCK_CACHE_KEY};
use crate::ch::signal_events;
use crate::db;
use crate::db::DB;
use crate::mq::MessageQueue;
use crate::mq::utils::mq_max_payload;
use crate::notifications::{self, NotificationDefinitionType, NotificationKind};
use crate::utils::{call_service_with_retry, get_unsigned_env_with_default};
use crate::worker::{HandlerError, MessageHandler};

use crate::clustering::ClusteringBatchMessage;

const DEFAULT_LOCK_TTL_SECONDS: usize = 300;
const DEFAULT_LOCK_MAX_WAIT_SECONDS: usize = 300;

#[derive(Serialize, Deserialize, Debug, Clone)]
struct ClusterEventResult {
    signal_event_id: Uuid,
    cluster_id: Uuid,
    cluster_name: String,
    cluster_level: u32,
    is_new_cluster: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct ClusterResponse {
    success: bool,
    #[serde(default)]
    events: Vec<ClusterEventResult>,
}

/// Handler for clustering messages
pub struct ClusteringHandler {
    cache: Arc<Cache>,
    client: reqwest::Client,
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    queue: Arc<MessageQueue>,
}

impl ClusteringHandler {
    pub fn new(
        cache: Arc<Cache>,
        client: reqwest::Client,
        db: Arc<DB>,
        clickhouse: clickhouse::Client,
        queue: Arc<MessageQueue>,
    ) -> Self {
        Self {
            cache,
            client,
            db,
            clickhouse,
            queue,
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
            self.db.clone(),
            self.clickhouse.clone(),
            self.queue.clone(),
        )
        .await
    }
}

async fn process_clustering_logic(
    message: ClusteringBatchMessage,
    cache: Arc<Cache>,
    client: reqwest::Client,
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
    queue: Arc<MessageQueue>,
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

    // Call clustering endpoint
    let result = call_clustering_endpoint(&client, project_id, signal_id, &message).await;

    // Always release lock
    if let Err(e) = cache.release_lock(&lock_key).await {
        log::error!("Failed to release clustering lock: {:?}", e);
    } else {
        log::debug!(
            "Released clustering lock for project_id={}, signal_id={}",
            project_id,
            signal_id,
        );
    }

    let response = match result {
        Ok(response) => {
            if response.success {
                log::info!(
                    "Successfully clustered events for project_id={}, signal_id={}",
                    project_id,
                    signal_id,
                );
            } else {
                log::warn!(
                    "Clustering endpoint returned success=false for project_id={}, signal_id={}",
                    project_id,
                    signal_id,
                );
                return Ok(());
            }
            response
        }
        Err(e) => {
            log::error!(
                "Failed to call clustering endpoint for project_id={}, signal_id={}: {:?}",
                project_id,
                signal_id,
                e
            );
            return Err(e.into());
        }
    };

    // Process new cluster notifications
    process_new_cluster_notifications(&db, &clickhouse, &queue, project_id, signal_id, &response)
        .await;

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

async fn process_new_cluster_notifications(
    db: &Arc<DB>,
    clickhouse: &clickhouse::Client,
    queue: &Arc<MessageQueue>,
    project_id: Uuid,
    signal_id: Uuid,
    response: &ClusterResponse,
) {
    // TODO: remove this
    for event in &response.events {
        println!(
            "==> id: {:?}: new cluster: {:?} - level: {:?} - name: {:?}",
            event.signal_event_id, event.is_new_cluster, event.cluster_level, event.cluster_name,
        );
    }

    let alerts =
        match db::alert_targets::get_alerts_for_signal(&db.pool, project_id, signal_id).await {
            Ok(alerts) => alerts,
            Err(e) => {
                log::error!(
                    "Failed to fetch alerts for signal_id={}: {:?}",
                    signal_id,
                    e
                );
                return;
            }
        };

    if alerts.is_empty() {
        return;
    }

    // First, notify about new L0 clusters for event alerts with skip_similar enabled.
    let new_l0_cluster_events: Vec<&ClusterEventResult> = response
        .events
        .iter()
        // .filter(|e| e.is_new_cluster)
        // .filter(|e| e.cluster_level == 0u32)
        .collect();
    println!("new_l0_cluster_events: {:?}", new_l0_cluster_events.len());

    if new_l0_cluster_events.is_empty() {
        return;
    }

    let event_ids: Vec<Uuid> = new_l0_cluster_events
        .iter()
        .map(|e| e.signal_event_id)
        .collect();

    let ch_events = match signal_events::get_signal_events_by_ids(
        clickhouse,
        &project_id,
        &signal_id,
        &event_ids,
    )
    .await
    {
        Ok(events) => events,
        Err(e) => {
            log::error!(
                "Failed to fetch signal events from ClickHouse for notification: {:?}",
                e
            );
            return;
        }
    };

    for ch_event in &ch_events {
        let attributes = ch_event.payload_value().unwrap_or_default();

        for alert in &alerts {
            if ch_event.severity != alert.metadata.severity() {
                continue;
            }

            // skip_similar means notifications for L0 clusters
            if !alert.metadata.skip_similar() {
                continue;
            }

            let notification_message = notifications::NotificationMessage {
                definition_type: NotificationDefinitionType::Alert,
                definition_id: alert.id,
                workspace_id: alert.workspace_id,
                project_id: Some(project_id),
                notifications: vec![NotificationKind::EventIdentification {
                    project_id,
                    signal_id,
                    trace_id: ch_event.trace_id,
                    event_id: Some(ch_event.id),
                    event_name: ch_event.name.clone(),
                    severity: ch_event.severity,
                    extracted_information: Some(attributes.clone()),
                    alert_name: alert.name.clone(),
                }],
            };

            let serialized_size = serde_json::to_vec(&notification_message)
                .map(|v| v.len())
                .unwrap_or(0);
            if serialized_size >= mq_max_payload() {
                log::error!(
                    "MQ payload limit exceeded for new cluster event {}: payload size [{}]",
                    ch_event.name,
                    serialized_size,
                );
            } else if let Err(e) =
                notifications::push_to_notification_queue(notification_message, queue.clone()).await
            {
                log::error!(
                    "Failed to push notification for new cluster event {}: {:?}",
                    ch_event.name,
                    e
                );
            }
        }
    }

    // Second, notify about new L1+ clusters.
    // TODO: implement this.
}
