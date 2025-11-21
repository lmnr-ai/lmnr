use actix_web::{HttpResponse, Result as ActixResult, web::Bytes};
use dashmap::DashMap;
use futures_util::stream::Stream;
use serde::{Deserialize, Serialize};
use std::{
    pin::Pin,
    sync::Arc,
    task::{Context, Poll},
    time::Duration,
};
use tokio::sync::mpsc;
use uuid::Uuid;

/// Connection with unique ID for tracking
#[derive(Clone)]
pub struct SseConnection {
    pub id: Uuid,
    pub sender: mpsc::UnboundedSender<SseMessage>,
}

/// Subscription key that identifies what messages a client wants to receive
/// Examples: "traces", "trace_123e4567-e89b-12d3-a456-426614174000"
pub type SubscriptionKey = String;

/// Global storage for SSE connections mapped by (project_id, subscription_key) tuple
pub type SseConnectionMap = Arc<DashMap<(Uuid, SubscriptionKey), Vec<SseConnection>>>;

/// SSE message receiver
pub type SseReceiver = mpsc::UnboundedReceiver<SseMessage>;

/// Message types for SSE
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SseMessage {
    pub event_type: String,
    pub data: serde_json::Value,
}

pub struct SseStream {
    receiver: SseReceiver,
    heartbeat_interval: tokio::time::Interval,
    project_id: Uuid,
    connection_id: Uuid,
    subscription_key: SubscriptionKey,
    connections: SseConnectionMap,
}

impl SseStream {
    pub fn new(
        receiver: SseReceiver,
        project_id: Uuid,
        connection_id: Uuid,
        subscription_key: SubscriptionKey,
        connections: SseConnectionMap,
    ) -> Self {
        // Set heartbeat to 30 seconds - well within AWS ALB's 60s default idle timeout
        let mut heartbeat_interval = tokio::time::interval(Duration::from_secs(30));
        heartbeat_interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        Self {
            receiver,
            heartbeat_interval,
            project_id,
            connection_id,
            subscription_key,
            connections,
        }
    }
}

impl Stream for SseStream {
    type Item = Result<Bytes, actix_web::Error>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        // ALWAYS check for messages first - they take priority over heartbeat
        // This ensures span updates are never delayed by heartbeat timing
        match self.receiver.poll_recv(cx) {
            Poll::Ready(Some(message)) => {
                let json_data = serde_json::to_string(&message.data).unwrap_or_default();
                let sse_data = format!("event: {}\ndata: {}\n\n", message.event_type, json_data);
                Poll::Ready(Some(Ok(Bytes::from(sse_data))))
            }
            Poll::Ready(None) => {
                log::info!("SSE receiver closed for project: {}", self.project_id);
                Poll::Ready(None)
            }
            Poll::Pending => {
                // No messages available, check if heartbeat is due
                // This keeps ALB connection alive during idle periods
                if self.heartbeat_interval.poll_tick(cx).is_ready() {
                    let heartbeat = Bytes::from(": heartbeat\n\n");
                    return Poll::Ready(Some(Ok(heartbeat)));
                }

                // No messages and heartbeat not ready - stay pending
                Poll::Pending
            }
        }
    }
}

impl Drop for SseStream {
    fn drop(&mut self) {
        log::info!(
            "SSE stream dropped for project: {} key: {} (connection: {})",
            self.project_id,
            self.subscription_key,
            self.connection_id
        );

        // Remove this specific connection from the connections map
        let key = (self.project_id, self.subscription_key.clone());

        if let Some(mut connections) = self.connections.get_mut(&key) {
            connections.retain(|conn| conn.id != self.connection_id);

            let remaining = connections.len();

            if remaining == 0 {
                drop(connections);
                self.connections.remove(&key);
                log::info!(
                    "Removed empty SSE connection entry for project {} key {}",
                    self.project_id,
                    self.subscription_key
                );
            } else {
                log::info!(
                    "Removed connection {} for project {} key {}, {} connections remaining",
                    self.connection_id,
                    self.project_id,
                    self.subscription_key,
                    remaining
                );
            }
        }
    }
}

/// Create SSE response for a project with a subscription key
pub fn create_sse_response(
    project_id: Uuid,
    subscription_key: SubscriptionKey,
    connections: SseConnectionMap,
) -> ActixResult<HttpResponse> {
    let (sender, receiver) = mpsc::unbounded_channel();
    let connection_id = Uuid::new_v4();

    // Add connection to the global map
    let connection = SseConnection {
        id: connection_id,
        sender,
    };

    let key = (project_id, subscription_key.clone());

    connections
        .entry(key)
        .or_insert_with(Vec::new)
        .push(connection);

    log::info!(
        "New SSE connection established for project: {} key: {} (connection: {})",
        project_id,
        subscription_key,
        connection_id,
    );

    let stream = SseStream::new(
        receiver,
        project_id,
        connection_id,
        subscription_key,
        connections.clone(),
    );

    Ok(HttpResponse::Ok()
        .insert_header(("Content-Type", "text/event-stream"))
        .insert_header(("Cache-Control", "no-cache"))
        .insert_header(("Connection", "keep-alive"))
        .insert_header(("X-Accel-Buffering", "no"))
        .insert_header(("Access-Control-Allow-Origin", "*"))
        .insert_header(("Access-Control-Allow-Headers", "Cache-Control"))
        .streaming(stream))
}

/// Send message to all SSE connections for a specific project and subscription key
pub fn send_to_key(
    connections: &SseConnectionMap,
    project_id: &Uuid,
    subscription_key: &str,
    message: SseMessage,
) {
    let key = (*project_id, subscription_key.to_string());

    if let Some(mut conns) = connections.get_mut(&key) {
        let initial_count = conns.len();

        // Remove closed connections while sending
        conns.retain(|conn| match conn.sender.send(message.clone()) {
            Ok(_) => true,
            Err(e) => {
                log::warn!(
                    "Failed to send SSE message to connection {}: {:?}",
                    conn.id,
                    e
                );
                false
            }
        });

        let final_count = conns.len();
        if final_count < initial_count {
            log::info!(
                "Cleaned up {} closed SSE connections for project {} key {}",
                initial_count - final_count,
                project_id,
                subscription_key
            );
        }

        // Remove entry if no active connections
        if conns.is_empty() {
            drop(conns);
            connections.remove(&key);
            log::info!(
                "Removed empty SSE connection entry for project {} key {}",
                project_id,
                subscription_key
            );
        }
    } else {
        log::debug!(
            "No SSE connections found for project {} key {} (event: {})",
            project_id,
            subscription_key,
            message.event_type
        );
    }
}

/// Periodically clean up closed SSE connections
pub async fn cleanup_closed_connections(connections: SseConnectionMap) {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(60 * 60)); // Clean up every hour

    loop {
        interval.tick().await;

        // First collect all keys
        let all_keys: Vec<_> = connections
            .iter()
            .map(|entry| entry.key().clone())
            .collect();

        let mut keys_to_remove = Vec::new();

        // Check each connection
        for key in all_keys {
            if let Some(mut conns) = connections.get_mut(&key) {
                let (project_id, subscription_key) = &key;
                let initial_count = conns.len();

                // Test each connection by checking if sender is closed
                conns.retain(|conn| !conn.sender.is_closed());

                let final_count = conns.len();
                let cleaned = initial_count - final_count;

                if cleaned > 0 {
                    log::info!(
                        "Periodic cleanup: removed {} closed connections for project {} key {}",
                        cleaned,
                        project_id,
                        subscription_key
                    );
                }

                if conns.is_empty() {
                    keys_to_remove.push(key.clone());
                }
            }
        }

        // Remove empty entries
        for key in keys_to_remove {
            connections.remove(&key);
        }
    }
}
