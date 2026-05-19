use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use arc_swap::ArcSwap;
use backoff::ExponentialBackoffBuilder;
use redis::aio::MultiplexedConnection;
use tokio::sync::Notify;

/// Self-healing wrapper around a `redis::aio::MultiplexedConnection`.
///
/// `MultiplexedConnection` does not auto-reconnect: once the TCP socket drops,
/// every subsequent command on that handle errors out forever. We track health
/// via an `AtomicBool` and wake a background supervisor task on demand. The
/// supervisor PINGs first to coalesce transient hiccups; if the ping really
/// fails, it dials a new `MultiplexedConnection` (with exponential backoff,
/// no time cap) and atomically swaps it in via `ArcSwap`.
///
/// Two waker paths feed the supervisor:
/// 1. Callers observing an op-level error invoke `notify_error()`.
/// 2. A periodic health-check task PINGs every 30s and notifies on failure.
///
/// Callers grab the current connection through `current()` (or `current_clone()`
/// for a directly usable `MultiplexedConnection`) on every operation. They
/// never see the swap; if they hit a stale handle between failure and
/// reconnect, their own retry / backoff loops bridge the gap.
pub struct ResilientRedisConnection {
    inner: ArcSwap<MultiplexedConnection>,
    client: redis::Client,
    label: &'static str,
    reconnect_notify: Arc<Notify>,
    connected: AtomicBool,
}

impl ResilientRedisConnection {
    pub async fn connect(client: redis::Client, label: &'static str) -> anyhow::Result<Arc<Self>> {
        let initial = dial(&client).await?;
        let reconnect_notify = Arc::new(Notify::new());

        let this = Arc::new(Self {
            inner: ArcSwap::from(Arc::new(initial)),
            client,
            label,
            reconnect_notify,
            connected: AtomicBool::new(true),
        });

        tokio::spawn(Arc::clone(&this).supervisor_loop());
        tokio::spawn(Arc::clone(&this).health_check_loop());

        log::info!("Redis {} connection established", label);
        Ok(this)
    }

    /// The latest live (or last-known) connection. Cheap — atomic load.
    pub fn current(&self) -> Arc<MultiplexedConnection> {
        self.inner.load_full()
    }

    /// Convenience for command call sites: `MultiplexedConnection::clone` is
    /// cheap (it's an internal `Arc`-like handle), and most redis-rs APIs need
    /// `&mut MultiplexedConnection` rather than `&MultiplexedConnection`.
    pub fn current_clone(&self) -> MultiplexedConnection {
        (*self.current()).clone()
    }

    pub fn is_connected(&self) -> bool {
        self.connected.load(Ordering::Acquire)
    }

    /// Caller can nudge the supervisor when it observes a problem (e.g. a
    /// command error from a presumed-broken handle). The supervisor's own
    /// PING decides whether the connection is actually dead before churning.
    pub fn notify_error(&self) {
        self.reconnect_notify.notify_one();
    }

    async fn supervisor_loop(self: Arc<Self>) {
        loop {
            self.reconnect_notify.notified().await;

            // Coalesce bursts: a still-healthy connection may have surfaced a
            // recoverable command error. Don't churn.
            if ping(&mut self.current_clone()).await {
                self.connected.store(true, Ordering::Release);
                continue;
            }

            self.connected.store(false, Ordering::Release);
            log::warn!("Redis {} connection lost, reconnecting...", self.label);

            // Never give up — a multi-minute Redis outage should still
            // converge to a healthy connection without a process restart.
            let backoff = ExponentialBackoffBuilder::new()
                .with_initial_interval(Duration::from_millis(500))
                .with_max_interval(Duration::from_secs(30))
                .with_max_elapsed_time(None)
                .build();

            let label = self.label;
            let client = self.client.clone();
            let result = backoff::future::retry(backoff, || {
                let client = client.clone();
                async move {
                    dial(&client).await.map_err(|e| {
                        log::warn!("Failed to redial Redis ({}): {:?}", label, e);
                        backoff::Error::transient(e)
                    })
                }
            })
            .await;

            match result {
                Ok(conn) => {
                    self.inner.store(Arc::new(conn));
                    self.connected.store(true, Ordering::Release);
                    log::info!("Redis {} connection restored", self.label);
                }
                Err(e) => {
                    // Backoff has no max_elapsed_time set, so this branch is
                    // effectively unreachable; log and re-arm just in case.
                    log::error!(
                        "Redis {} reconnect supervisor exited unexpectedly: {:?}",
                        self.label,
                        e
                    );
                    self.reconnect_notify.notify_one();
                }
            }
        }
    }

    /// Periodic PING — catches silent socket death between command bursts so
    /// `is_connected()` (and hence `/ready`) stays accurate even when no
    /// caller has tripped on a stale handle yet.
    ///
    /// Only writes `false` on detected failure, AND only when the failed PING
    /// was on the current handle. The supervisor is the sole writer of `true`,
    /// so we must not clobber it: if a reconnect swapped `inner` while our
    /// PING was in flight, the failure is on a now-stale handle and the new
    /// one is presumed live (the supervisor's own post-redial PING gates the
    /// `true` write). Pointer-compare the Arc before vs after to detect that.
    async fn health_check_loop(self: Arc<Self>) {
        let mut ticker = tokio::time::interval(Duration::from_secs(30));
        ticker.tick().await; // skip the immediate tick — initial state is known-good
        loop {
            ticker.tick().await;
            let snapshot = self.inner.load_full();
            if ping(&mut (*snapshot).clone()).await {
                continue;
            }
            if !Arc::ptr_eq(&snapshot, &self.inner.load_full()) {
                continue;
            }
            let was = self.connected.swap(false, Ordering::AcqRel);
            if was {
                log::warn!("Redis {} health check failed", self.label);
                self.reconnect_notify.notify_one();
            }
        }
    }
}

async fn dial(client: &redis::Client) -> anyhow::Result<MultiplexedConnection> {
    client
        .get_multiplexed_async_connection()
        .await
        .map_err(anyhow::Error::from)
}

async fn ping(conn: &mut MultiplexedConnection) -> bool {
    redis::cmd("PING")
        .query_async::<String>(conn)
        .await
        .is_ok()
}
