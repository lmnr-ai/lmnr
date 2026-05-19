use std::sync::Arc;
use std::time::Duration;

use arc_swap::ArcSwap;
use backoff::ExponentialBackoffBuilder;
use futures_util::StreamExt;
use lapin::{Connection, ConnectionProperties, Event};
use tokio::sync::Notify;

/// Self-healing wrapper around a `lapin::Connection`.
///
/// `lapin::Connection` does not auto-reconnect: once the TCP socket drops it
/// stays disconnected forever. We listen on the connection's events stream
/// for `Event::Error` and wake a background supervisor task; the supervisor
/// dials a new connection (with exponential backoff, no time cap) and
/// atomically swaps it in via `ArcSwap`.
///
/// Callers grab the current connection through `current()` and use it as
/// before. They never see the swap; if they hit a stale connection between
/// failure and reconnect, their own retry / backoff loops bridge the gap.
/// External code that observes a channel-level failure can also call
/// `notify_error()` to nudge the supervisor — the next health check will
/// confirm whether the underlying connection is actually dead.
pub struct ResilientConnection {
    inner: ArcSwap<Connection>,
    url: String,
    label: &'static str,
    reconnect_notify: Arc<Notify>,
}

impl ResilientConnection {
    pub async fn connect(url: String, label: &'static str) -> anyhow::Result<Arc<Self>> {
        let initial = dial(&url).await?;
        let reconnect_notify = Arc::new(Notify::new());
        spawn_event_listener(&initial, label, &reconnect_notify);

        let this = Arc::new(Self {
            inner: ArcSwap::from(Arc::new(initial)),
            url,
            label,
            reconnect_notify,
        });

        tokio::spawn(Arc::clone(&this).supervisor_loop());

        log::info!("RabbitMQ {} connection established", label);
        Ok(this)
    }

    /// The latest live (or last-known) connection. Cheap — atomic load.
    pub fn current(&self) -> Arc<Connection> {
        self.inner.load_full()
    }

    pub fn is_connected(&self) -> bool {
        self.current().status().connected()
    }

    /// Caller can nudge the supervisor when it observes a problem the
    /// events listener missed (e.g. a publish or declare error on a connection
    /// whose status hasn't been torn down yet).
    pub fn notify_error(&self) {
        self.reconnect_notify.notify_one();
    }

    async fn supervisor_loop(self: Arc<Self>) {
        loop {
            self.reconnect_notify.notified().await;

            // Coalesce bursts: a still-healthy connection may have emitted a
            // recoverable hiccup. Don't churn.
            if self.is_connected() {
                continue;
            }

            log::warn!("RabbitMQ {} connection lost, reconnecting...", self.label);

            // Never give up — a multi-minute cluster outage should still
            // converge to a healthy connection without a process restart.
            let backoff = ExponentialBackoffBuilder::new()
                .with_initial_interval(Duration::from_millis(500))
                .with_max_interval(Duration::from_secs(30))
                .with_max_elapsed_time(None)
                .build();

            let label = self.label;
            let url = self.url.clone();
            let result = backoff::future::retry(backoff, || {
                let url = url.clone();
                async move {
                    dial(&url).await.map_err(|e| {
                        log::warn!("Failed to redial RabbitMQ ({}): {:?}", label, e);
                        backoff::Error::transient(e)
                    })
                }
            })
            .await;

            match result {
                Ok(conn) => {
                    spawn_event_listener(&conn, self.label, &self.reconnect_notify);
                    self.inner.store(Arc::new(conn));
                    log::info!("RabbitMQ {} connection restored", self.label);
                }
                Err(e) => {
                    // Backoff has no max_elapsed_time set, so this branch is
                    // effectively unreachable; log and re-arm just in case.
                    log::error!(
                        "RabbitMQ {} reconnect supervisor exited unexpectedly: {:?}",
                        self.label,
                        e
                    );
                    self.reconnect_notify.notify_one();
                }
            }
        }
    }
}

async fn dial(url: &str) -> anyhow::Result<Connection> {
    Connection::connect(url, ConnectionProperties::default())
        .await
        .map_err(anyhow::Error::from)
}

fn spawn_event_listener(conn: &Connection, label: &'static str, notify: &Arc<Notify>) {
    let mut events = conn.events_listener();
    let notify = Arc::clone(notify);
    tokio::spawn(async move {
        while let Some(event) = events.next().await {
            match event {
                Event::Error(err) => {
                    log::error!("RabbitMQ {} connection error: {:?}", label, err);
                    notify.notify_one();
                }
                Event::ConnectionBlocked(reason) => {
                    log::warn!("RabbitMQ {} connection blocked: {}", label, reason);
                }
                Event::ConnectionUnblocked => {
                    log::info!("RabbitMQ {} connection unblocked", label);
                }
                Event::Connected => {
                    log::debug!("RabbitMQ {} connected event", label);
                }
                _ => {}
            }
        }
        // Stream ended → the Connection was dropped. The supervisor's own
        // ArcSwap holds the canonical reference, so this happens only after
        // we've already replaced it. No notify needed.
    });
}
