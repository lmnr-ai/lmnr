use std::sync::Arc;
use std::time::Duration;

use futures_util::StreamExt;
use lapin::{Connection, ConnectionProperties, Event};

/// Thin wrapper around `lapin::Connection`. lapin 4.x's
/// `enable_auto_recover()` keeps the underlying connection healthy across
/// broker blips: TCP redial, channel re-open, and consumer re-establish all
/// happen inside the same `Connection` handle. We don't swap or wrap anymore.
///
/// We keep this type for two reasons:
///   - readiness probe: `is_connected()` reflects lapin's recovery state
///   - structured logging via the events listener
///
/// `notify_error()` survives as a logging hook for call sites that observe a
/// channel-level error lapin's internal recovery hasn't reacted to yet. It no
/// longer drives a supervisor task — there is none — so callers don't need
/// to invoke it for correctness.
pub struct ResilientConnection {
    inner: Arc<Connection>,
    label: &'static str,
}

impl ResilientConnection {
    pub async fn connect(url: String, label: &'static str) -> anyhow::Result<Arc<Self>> {
        let props = ConnectionProperties::default()
            .enable_auto_recover()
            .configure_backoff(|b| {
                b.with_min_delay(Duration::from_millis(500))
                    .with_max_delay(Duration::from_secs(10))
            });
        let conn = Connection::connect(&url, props)
            .await
            .map_err(anyhow::Error::from)?;

        spawn_event_listener(&conn, label);

        log::info!("RabbitMQ {} connection established", label);
        Ok(Arc::new(Self {
            inner: Arc::new(conn),
            label,
        }))
    }

    /// Returns the lapin connection. lapin's auto-recover keeps the same
    /// handle alive across broker restarts, so this never changes for the
    /// lifetime of the wrapper.
    pub fn current(&self) -> Arc<Connection> {
        Arc::clone(&self.inner)
    }

    pub fn is_connected(&self) -> bool {
        self.inner.status().connected()
    }

    /// Logging-only hook for call sites observing a channel-level error.
    /// lapin's internal recovery owns the actual redial, so this is purely
    /// observability.
    pub fn notify_error(&self) {
        log::debug!(
            "RabbitMQ {} channel-level error reported by caller; lapin auto-recover will handle",
            self.label
        );
    }
}

fn spawn_event_listener(conn: &Connection, label: &'static str) {
    let mut events = conn.events_listener();
    tokio::spawn(async move {
        while let Some(event) = events.next().await {
            match event {
                Event::Error(err) => {
                    log::error!("RabbitMQ {} connection error: {:?}", label, err);
                }
                Event::ConnectionBlocked(reason) => {
                    log::warn!("RabbitMQ {} connection blocked: {}", label, reason);
                }
                Event::ConnectionUnblocked => {
                    log::info!("RabbitMQ {} connection unblocked", label);
                }
                Event::Connected => {
                    log::info!("RabbitMQ {} connected event (recovery cycle)", label);
                }
                _ => {}
            }
        }
        log::warn!(
            "RabbitMQ {} events_listener stream ended (no more events)",
            label
        );
    });
}
