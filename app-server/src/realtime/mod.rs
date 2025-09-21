use actix_web::{HttpResponse, Result as ActixResult, rt::time::interval, web::Bytes};
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

/// Global storage for SSE connections mapped by project_id
pub type SseConnectionMap = Arc<DashMap<Uuid, Vec<SseConnection>>>;

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
    connections: SseConnectionMap,
}

impl SseStream {
    pub fn new(
        receiver: SseReceiver,
        project_id: Uuid,
        connection_id: Uuid,
        connections: SseConnectionMap,
    ) -> Self {
        let mut heartbeat_interval = interval(Duration::from_secs(10));
        heartbeat_interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        Self {
            receiver,
            heartbeat_interval,
            project_id,
            connection_id,
            connections,
        }
    }
}

impl Stream for SseStream {
    type Item = Result<Bytes, actix_web::Error>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        // Check for heartbeat
        if self.heartbeat_interval.poll_tick(cx).is_ready() {
            let heartbeat = Bytes::from(": heartbeat\n\n");
            return Poll::Ready(Some(Ok(heartbeat)));
        }

        // Check for messages
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
            Poll::Pending => Poll::Pending,
        }
    }
}

impl Drop for SseStream {
    fn drop(&mut self) {
        log::info!(
            "SSE stream dropped for project: {} (connection: {})",
            self.project_id,
            self.connection_id
        );

        // Remove this specific connection from the connections map
        if let Some(mut connections_for_project) = self.connections.get_mut(&self.project_id) {
            connections_for_project.retain(|conn| conn.id != self.connection_id);

            if connections_for_project.is_empty() {
                drop(connections_for_project);
                self.connections.remove(&self.project_id);
                log::info!(
                    "Removed empty SSE connection entry for project {}",
                    self.project_id
                );
            } else {
                log::info!(
                    "Removed connection {} for project {}, {} connections remaining",
                    self.connection_id,
                    self.project_id,
                    connections_for_project.len()
                );
            }
        }
    }
}

/// Create SSE response for a project
pub fn create_sse_response(
    project_id: Uuid,
    connections: SseConnectionMap,
) -> ActixResult<HttpResponse> {
    let (sender, receiver) = mpsc::unbounded_channel();
    let connection_id = Uuid::new_v4();

    // Add connection to the global map
    let connection = SseConnection {
        id: connection_id,
        sender,
    };

    connections
        .entry(project_id)
        .or_insert_with(Vec::new)
        .push(connection);

    log::info!(
        "New SSE connection established for project: {} (connection: {})",
        project_id,
        connection_id
    );

    let stream = SseStream::new(receiver, project_id, connection_id, connections.clone());

    Ok(HttpResponse::Ok()
        .insert_header(("Content-Type", "text/event-stream"))
        .insert_header(("Cache-Control", "no-cache"))
        .insert_header(("Connection", "keep-alive"))
        .insert_header(("Access-Control-Allow-Origin", "*"))
        .insert_header(("Access-Control-Allow-Headers", "Cache-Control"))
        .streaming(stream))
}

/// Send message to all SSE connections for a project
pub fn send_to_project_connections(
    connections: &SseConnectionMap,
    project_id: &Uuid,
    message: SseMessage,
) {
    if let Some(mut project_connections) = connections.get_mut(project_id) {
        let initial_count = project_connections.len();

        // Remove closed connections while sending
        project_connections.retain(|conn| conn.sender.send(message.clone()).is_ok());

        let final_count = project_connections.len();
        if final_count < initial_count {
            log::debug!(
                "Cleaned up {} closed SSE connections for project {}",
                initial_count - final_count,
                project_id
            );
        }

        // Remove entry if no active connections
        if project_connections.is_empty() {
            drop(project_connections);
            connections.remove(project_id);
            log::info!(
                "Removed empty SSE connection entry for project {}",
                project_id
            );
        }
    }
}

/// Periodically clean up closed SSE connections
pub async fn cleanup_closed_connections(connections: SseConnectionMap) {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(60 * 60)); // Clean up every hour

    loop {
        interval.tick().await;

        let mut projects_to_remove = Vec::new();

        // Check all projects for closed connections
        for mut entry in connections.iter_mut() {
            let project_id = *entry.key();
            let project_connections = entry.value_mut();
            let initial_count = project_connections.len();

            // Test each connection by trying to send a ping
            project_connections.retain(|conn| !conn.sender.is_closed());

            let final_count = project_connections.len();
            let cleaned = initial_count - final_count;

            if cleaned > 0 {
                log::info!(
                    "Periodic cleanup: removed {} closed connections for project {}",
                    cleaned,
                    project_id
                );
            }

            if project_connections.is_empty() {
                projects_to_remove.push(project_id);
            }
        }

        // Remove empty project entries
        for project_id in projects_to_remove {
            connections.remove(&project_id);
        }
    }
}
