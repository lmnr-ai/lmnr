use actix_web::{HttpResponse, Result as ActixResult, web::Bytes};
use async_stream::stream;
use dashmap::DashMap;
use futures_util::stream::Stream;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::{Arc, LazyLock};
use tokio::sync::mpsc;
use url::Url;
use uuid::Uuid;

use crate::pubsub::{PubSub, PubSubTrait, SseChannel, keys::SSE_CHANNEL_PATTERN};

/// Origins permitted to open SSE connections. The frontend origin
/// (`NEXT_PUBLIC_URL`) is always included; additional origins come from the
/// comma-separated `SSE_ALLOWED_ORIGINS`. Each value is reduced to its origin
/// (`scheme://host[:port]`) so it compares equal to the browser's `Origin`
/// header regardless of a trailing slash or path component.
static ALLOWED_SSE_ORIGINS: LazyLock<HashSet<String>> = LazyLock::new(|| {
    let frontend = std::env::var(crate::env::notifications::NEXT_PUBLIC_URL).unwrap_or_default();
    let extra = std::env::var(crate::env::server::SSE_ALLOWED_ORIGINS).unwrap_or_default();
    build_allowed_origins(&frontend, &extra)
});

/// Reduce a configured URL to the origin form a browser sends in the `Origin`
/// header: `scheme://host[:port]`, with no trailing slash or path. So a value
/// like `https://app.example.com/path` is canonicalized to
/// `https://app.example.com` and still matches. Falls back to a trailing-slash
/// trim when the value can't be parsed as an absolute URL (or has an opaque
/// origin), preserving the previous best-effort behaviour.
fn canonicalize_origin(raw: &str) -> String {
    Url::parse(raw)
        .ok()
        .map(|url| url.origin().ascii_serialization())
        .filter(|origin| origin != "null")
        .unwrap_or_else(|| raw.trim_end_matches('/').to_string())
}

/// Build the allow-list from the frontend origin plus a comma-separated list.
/// Each entry is canonicalized to a bare origin and blanks dropped so the set
/// holds values comparable to a browser `Origin` header. Pure so the parsing
/// is unit-testable without env state.
fn build_allowed_origins(frontend_url: &str, extra_csv: &str) -> HashSet<String> {
    std::iter::once(frontend_url)
        .chain(extra_csv.split(','))
        .map(str::trim)
        .filter(|raw| !raw.is_empty())
        .map(canonicalize_origin)
        .filter(|origin| !origin.is_empty())
        .collect()
}

/// Echo the request's `Origin` back only when it is on the allow-list.
/// Returns `None` (no `Access-Control-Allow-Origin` header) otherwise — the
/// SSE endpoint must never reply with a wildcard `*`, which would let any site
/// read a project's realtime trace data.
fn resolve_cors_origin(request_origin: Option<&str>) -> Option<String> {
    match_allowed_origin(request_origin, &ALLOWED_SSE_ORIGINS)
}

/// Pure matcher: returns the original origin string when its canonicalized
/// form is in `allowed`. Split out from `resolve_cors_origin` so the matching
/// rule can be tested without touching the env-backed global allow-list.
fn match_allowed_origin(request_origin: Option<&str>, allowed: &HashSet<String>) -> Option<String> {
    let origin = request_origin?;
    if allowed.contains(&canonicalize_origin(origin)) {
        Some(origin.to_string())
    } else {
        None
    }
}

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

/// Create SSE response stream - simply forwards messages from the receiver
/// Stream ends when the browser closes the connection (HTTP connection drops)
fn create_sse_stream(
    mut receiver: SseReceiver,
) -> impl Stream<Item = Result<Bytes, actix_web::Error>> {
    stream! {
        // Simply forward messages as they arrive
        while let Some(message) = receiver.recv().await {
            let json_data = serde_json::to_string(&message.data).unwrap_or_default();
            let sse_data = format!("event: {}\ndata: {}\n\n", message.event_type, json_data);
            yield Ok(Bytes::from(sse_data));
        }
    }
}

/// Create SSE response for a project with a subscription key
pub fn create_sse_response(
    project_id: Uuid,
    subscription_key: SubscriptionKey,
    connections: SseConnectionMap,
    initial_message: Option<SseMessage>,
    request_origin: Option<String>,
) -> ActixResult<HttpResponse> {
    let (sender, receiver) = mpsc::unbounded_channel();
    let connection_id = Uuid::new_v4();

    // Send initial message if provided - this will be buffered until stream starts
    if let Some(msg) = initial_message {
        let _ = sender.send(msg); // Safe to ignore error, channel just created
    }

    // Add connection to the global map
    let connection = SseConnection {
        id: connection_id,
        sender: sender.clone(),
    };

    let key = (project_id, subscription_key.clone());

    connections
        .entry(key.clone())
        .or_insert_with(Vec::new)
        .push(connection);

    log::info!(
        "New SSE connection established for project: {} key: {} (connection: {})",
        project_id,
        subscription_key,
        connection_id,
    );

    // Spawn per-connection heartbeat task
    // This task will detect when the browser closes the connection and clean up
    let connections_clone = connections.clone();
    let subscription_key_clone = subscription_key.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(5));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        loop {
            interval.tick().await;

            let heartbeat = SseMessage {
                event_type: "heartbeat".to_string(),
                data: serde_json::json!({}),
            };

            // Try to send heartbeat - if it fails, connection is dead
            if sender.send(heartbeat).is_err() {
                log::info!(
                    "Heartbeat failed for connection {} (browser closed), cleaning up",
                    connection_id
                );

                // Remove this connection from the map
                let key = (project_id, subscription_key_clone.clone());
                if let Some(mut conns) = connections_clone.get_mut(&key) {
                    conns.retain(|conn| conn.id != connection_id);
                    let remaining = conns.len();

                    if remaining == 0 {
                        drop(conns);
                        connections_clone.remove(&key);
                        log::info!(
                            "Removed empty SSE connection entry for project {} key {}",
                            project_id,
                            subscription_key_clone
                        );
                    } else {
                        log::info!(
                            "Removed connection {} for project {} key {}, {} remaining",
                            connection_id,
                            project_id,
                            subscription_key_clone,
                            remaining
                        );
                    }
                }

                // Exit the heartbeat task
                break;
            }
        }
    });

    let stream = create_sse_stream(receiver);

    let mut response = HttpResponse::Ok();
    response
        .insert_header(("Content-Type", "text/event-stream"))
        .insert_header(("Cache-Control", "no-cache"))
        .insert_header(("Connection", "keep-alive"))
        .insert_header(("X-Accel-Buffering", "no"))
        .insert_header(("Access-Control-Allow-Headers", "Cache-Control"))
        // Response varies by Origin since the ACAO header is reflected per-origin.
        .insert_header(("Vary", "Origin"));

    if let Some(allowed_origin) = resolve_cors_origin(request_origin.as_deref()) {
        response.insert_header(("Access-Control-Allow-Origin", allowed_origin));
    }

    Ok(response.streaming(stream))
}

/// Send message to local SSE connections only (used by Redis subscriber)
pub fn send_to_local_connections(
    connections: &SseConnectionMap,
    project_id: &Uuid,
    subscription_key: &str,
    message: &SseMessage,
) {
    let key = (*project_id, subscription_key.to_string());

    if let Some(mut conns) = connections.get_mut(&key) {
        let initial_count = conns.len();

        // Remove closed connections while sending
        conns.retain(|conn| match conn.sender.send(message.clone()) {
            Ok(_) => true,
            Err(e) => {
                log::info!(
                    "Removing dead SSE connection {} (send failed: {:?})",
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
    }
}

/// Publish message to Pub/Sub for distribution across pods
/// The subscriber on each pod will forward to its local connections
pub async fn send_to_key(
    pubsub: &PubSub,
    project_id: &Uuid,
    subscription_key: &str,
    message: SseMessage,
) {
    let channel = SseChannel::new(*project_id, subscription_key);
    let channel_str = channel.to_string();
    let payload = match serde_json::to_string(&message) {
        Ok(p) => p,
        Err(e) => {
            log::error!("Failed to serialize SSE message: {:?}", e);
            return;
        }
    };

    if let Err(e) = pubsub.publish(&channel_str, &payload).await {
        log::error!(
            "Failed to publish SSE message for project {} key {}: {:?}",
            project_id,
            subscription_key,
            e
        );
    }
}

/// Start Redis Pub/Sub subscriber that forwards messages to local SSE connections
pub async fn start_redis_subscriber(
    pubsub: Arc<PubSub>,
    connections: SseConnectionMap,
) -> anyhow::Result<()> {
    pubsub
        .as_ref()
        .subscribe(SSE_CHANNEL_PATTERN, move |channel, payload| {
            // Parse channel using strongly typed SseChannel
            let sse_channel = match SseChannel::from_str(&channel) {
                Ok(ch) => ch,
                Err(e) => {
                    log::error!("{}", e);
                    return;
                }
            };

            let message: SseMessage = match serde_json::from_str(&payload) {
                Ok(msg) => msg,
                Err(e) => {
                    log::error!("Failed to deserialize SSE message: {}", e);
                    return;
                }
            };

            // Forward to local connections
            send_to_local_connections(
                &connections,
                &sse_channel.project_id,
                &sse_channel.subscription_key,
                &message,
            );
        })
        .await
        .map_err(|e| anyhow::anyhow!("Redis subscriber failed: {:?}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn allowed() -> HashSet<String> {
        build_allowed_origins(
            "https://app.example.com/",
            "https://dash.example.com, https://extra.example.com/ ,",
        )
    }

    #[test]
    fn build_allowed_origins_normalizes_and_drops_blanks() {
        let set = allowed();
        assert!(set.contains("https://app.example.com")); // trailing slash stripped
        assert!(set.contains("https://dash.example.com")); // whitespace trimmed
        assert!(set.contains("https://extra.example.com")); // slash + whitespace
        assert!(!set.contains("")); // empty trailing csv entry dropped
        assert_eq!(set.len(), 3);
    }

    #[test]
    fn build_allowed_origins_empty_inputs_yield_empty_set() {
        assert!(build_allowed_origins("", "").is_empty());
        assert!(build_allowed_origins("", ",  ,").is_empty());
    }

    #[test]
    fn build_allowed_origins_strips_path_and_port() {
        // A NEXT_PUBLIC_URL with a path must canonicalize to a bare origin so it
        // matches the browser's Origin header (which carries no path).
        let set = build_allowed_origins(
            "https://app.example.com/some/path",
            "https://dash.example.com:8443/x",
        );
        assert!(set.contains("https://app.example.com"));
        assert!(set.contains("https://dash.example.com:8443"));
        // Default port is dropped, matching how browsers send the Origin header.
        let https = build_allowed_origins("https://app.example.com:443", "");
        assert!(https.contains("https://app.example.com"));
    }

    #[test]
    fn match_accepts_origin_when_config_has_path() {
        let set = build_allowed_origins("https://app.example.com/dashboard", "");
        assert_eq!(
            match_allowed_origin(Some("https://app.example.com"), &set),
            Some("https://app.example.com".to_string())
        );
    }

    #[test]
    fn match_reflects_allowed_origin_verbatim() {
        let set = allowed();
        // Reflected with its original (un-normalized) form so the browser's
        // exact Origin is echoed back.
        assert_eq!(
            match_allowed_origin(Some("https://app.example.com"), &set),
            Some("https://app.example.com".to_string())
        );
        assert_eq!(
            match_allowed_origin(Some("https://app.example.com/"), &set),
            Some("https://app.example.com/".to_string())
        );
    }

    #[test]
    fn match_rejects_unlisted_origin() {
        let set = allowed();
        assert_eq!(match_allowed_origin(Some("https://evil.example.com"), &set), None);
        // No wildcard fallback: an absent Origin header yields no ACAO header.
        assert_eq!(match_allowed_origin(None, &set), None);
    }
}
