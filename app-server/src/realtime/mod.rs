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

/// Global storage for SSE connections mapped by project_id
pub type SseConnectionMap = Arc<DashMap<Uuid, Vec<SseSender>>>;

/// SSE message sender
pub type SseSender = mpsc::UnboundedSender<SseMessage>;

/// SSE message receiver
pub type SseReceiver = mpsc::UnboundedReceiver<SseMessage>;

/// Message types for SSE
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SseMessage {
    pub event_type: String,
    pub data: serde_json::Value,
}

/// SSE stream wrapper
pub struct SseStream {
    receiver: SseReceiver,
    heartbeat_interval: tokio::time::Interval,
}

impl SseStream {
    pub fn new(receiver: SseReceiver) -> Self {
        let mut heartbeat_interval = interval(Duration::from_secs(30));
        heartbeat_interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        Self {
            receiver,
            heartbeat_interval,
        }
    }
}

impl Stream for SseStream {
    type Item = Result<Bytes, actix_web::Error>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        // Check for heartbeat
        if self.heartbeat_interval.poll_tick(cx).is_ready() {
            let heartbeat = Bytes::from("data: {\"type\":\"heartbeat\"}\n\n");
            return Poll::Ready(Some(Ok(heartbeat)));
        }

        // Check for messages
        match self.receiver.poll_recv(cx) {
            Poll::Ready(Some(message)) => {
                let json_data = serde_json::to_string(&message.data).unwrap_or_default();
                let sse_data = format!("event: {}\ndata: {}\n\n", message.event_type, json_data);
                Poll::Ready(Some(Ok(Bytes::from(sse_data))))
            }
            Poll::Ready(None) => Poll::Ready(None),
            Poll::Pending => Poll::Pending,
        }
    }
}

/// Create SSE response for a project
pub fn create_sse_response(
    project_id: Uuid,
    connections: SseConnectionMap,
) -> ActixResult<HttpResponse> {
    let (sender, receiver) = mpsc::unbounded_channel();

    // Add sender to the global map
    connections
        .entry(project_id)
        .or_insert_with(Vec::new)
        .push(sender);

    let stream = SseStream::new(receiver);

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
    if let Some(mut senders) = connections.get_mut(project_id) {
        let initial_count = senders.len();

        // Remove closed connections while sending
        senders.retain(|sender| sender.send(message.clone()).is_ok());

        let final_count = senders.len();
        if final_count < initial_count {
            log::debug!(
                "Cleaned up {} closed SSE connections for project {}",
                initial_count - final_count,
                project_id
            );
        }

        // Remove entry if no active connections
        if senders.is_empty() {
            drop(senders);
            connections.remove(project_id);
            log::debug!(
                "Removed empty SSE connection entry for project {}",
                project_id
            );
        }
    }
}

/// Periodically clean up closed SSE connections
pub async fn cleanup_closed_connections(connections: SseConnectionMap) {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(60)); // Clean up every minute

    loop {
        interval.tick().await;

        let mut projects_to_remove = Vec::new();
        let mut total_cleaned = 0;

        // Check all projects for closed connections
        for mut entry in connections.iter_mut() {
            let project_id = *entry.key();
            let senders = entry.value_mut();
            let initial_count = senders.len();

            // Test each connection by sending a heartbeat-like message
            senders.retain(|sender| !sender.is_closed());

            let final_count = senders.len();
            let cleaned = initial_count - final_count;
            total_cleaned += cleaned;

            if cleaned > 0 {
                log::debug!(
                    "Cleaned up {} closed connections for project {}",
                    cleaned,
                    project_id
                );
            }

            if senders.is_empty() {
                projects_to_remove.push(project_id);
            }
        }

        // Remove empty project entries
        for project_id in projects_to_remove {
            connections.remove(&project_id);
            log::debug!("Removed empty connection entry for project {}", project_id);
        }

        if total_cleaned > 0 {
            log::info!(
                "Periodic cleanup: removed {} closed SSE connections",
                total_cleaned
            );
        }
    }
}
