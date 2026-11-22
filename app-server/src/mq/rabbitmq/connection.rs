use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, LazyLock};
use std::time::Duration;

use arc_swap::ArcSwap;
use backon::Retryable;
use dashmap::DashSet;
use futures_util::future::BoxFuture;
use lapin::{
    Channel, Connection, ConnectionProperties,
    protocol::{AMQPHardError, constants::REPLY_SUCCESS},
};
use tokio::sync::{Notify, Semaphore, SemaphorePermit};
use tokio_util::sync::CancellationToken;

use crate::utils::retry;

/// Declares the exchanges, queues and bindings the app relies on. Runs on every
/// new connection, not just at boot, so a broker that lost its definitions (a
/// wiped data dir, a rebuilt cluster) gets them back on the next reconnect.
pub type DeclareTopology = for<'a> fn(&'a Channel) -> BoxFuture<'a, anyhow::Result<()>>;

/// Bounds the AMQP handshake (and the topology declaration after it), so a
/// broker that accepts TCP but never finishes the handshake can't wedge the
/// supervisor.
static DIAL_TIMEOUT: LazyLock<Duration> =
    LazyLock::new(|| Duration::from_secs(crate::env::mq::DIAL_TIMEOUT_SECS.get()));

/// A condemned connection is closed on a best-effort basis; a wedged broker may
/// never answer `connection.close`, and the supervisor must not wait on it.
static CLOSE_TIMEOUT: LazyLock<Duration> =
    LazyLock::new(|| Duration::from_secs(crate::env::mq::CLOSE_TIMEOUT_SECS.get()));

/// lapin flips the state to `Error` itself when the socket or heartbeat dies;
/// this is how often the supervisor looks. Clamped above zero because
/// `tokio::time::interval` panics on a zero period.
static HEALTH_CHECK_INTERVAL: LazyLock<Duration> =
    LazyLock::new(|| Duration::from_millis(crate::env::mq::HEALTH_CHECK_INTERVAL_MS.get().max(1)));

static SETUP_CONCURRENCY: LazyLock<usize> =
    LazyLock::new(|| crate::env::mq::CONSUMER_SETUP_CONCURRENCY.get().max(1));

static SETUP_TIMEOUTS_BEFORE_RECONNECT: LazyLock<u32> =
    LazyLock::new(|| crate::env::mq::SETUP_TIMEOUTS_BEFORE_RECONNECT.get().max(1));

/// Self-healing wrapper around a lapin `Connection`, the AMQP counterpart of
/// `ResilientRedisConnection`.
///
/// lapin's own auto-recovery is deliberately NOT used: it replays every channel
/// one after another with no timeout, after the connection already reports
/// `Connected`, so one stuck replay silently stalls every consumer behind it,
/// and one failing replay restarts the whole connection forever. Here a dead
/// connection is replaced instead: its consumers get an error from lapin, and
/// each worker rebuilds its own channel through `get_receiver`, bounded by a
/// timeout and gated by [`Self::setup_permit`].
pub struct ResilientRabbitConnection {
    current: ArcSwap<Generation>,
    uri: String,
    label: &'static str,
    declare_topology: Option<DeclareTopology>,
    reconnect_notify: Notify,
    setup_permits: Semaphore,
}

/// One connection's lifetime. The id goes up on every replacement, so anything
/// that reports a failure says which connection it saw fail, and a late report
/// about a replaced connection can't condemn its successor.
pub struct Generation {
    pub id: u64,
    pub connection: Connection,
    condemned: AtomicBool,
    retired: CancellationToken,
    setup_timeouts: SetupTimeouts,
    bindings: DashSet<Binding>,
}

/// A queue-to-exchange binding, as `get_receiver` asks for it.
#[derive(Clone, PartialEq, Eq, Hash)]
pub struct Binding {
    pub queue: String,
    pub exchange: String,
    pub routing_key: String,
}

impl Generation {
    fn new(id: u64, connection: Connection) -> Self {
        Self {
            id,
            connection,
            condemned: AtomicBool::new(false),
            retired: CancellationToken::new(),
            setup_timeouts: SetupTimeouts::default(),
            bindings: DashSet::new(),
        }
    }

    pub fn is_usable(&self) -> bool {
        !self.condemned.load(Ordering::Acquire) && self.connection.status().connected()
    }

    /// Whether `queue_bind` still has to run for this binding on this
    /// connection. Bindings are durable broker state, so one successful bind per
    /// connection is enough; re-binding on every consumer setup only adds
    /// metadata-store writes while the broker may be struggling.
    pub fn needs_binding(&self, binding: &Binding) -> bool {
        !self.bindings.contains(binding)
    }

    pub fn record_binding(&self, binding: Binding) {
        self.bindings.insert(binding);
    }

    /// Resolves once the supervisor has given up on this connection. Consumers
    /// race this against their next delivery, because closing a connection does
    /// NOT end its consumers' streams until the broker sends `close-ok`, and a
    /// wedged broker may never send it.
    pub async fn retired(&self) {
        self.retired.cancelled().await
    }
}

impl ResilientRabbitConnection {
    /// Dials the first connection (and declares the topology on it) before
    /// returning, so a broker that is down at boot still fails startup.
    pub async fn connect(
        uri: String,
        label: &'static str,
        declare_topology: Option<DeclareTopology>,
    ) -> anyhow::Result<Arc<Self>> {
        let connection = dial(&uri, declare_topology).await?;

        let this = Arc::new(Self {
            current: ArcSwap::from_pointee(Generation::new(0, connection)),
            uri,
            label,
            declare_topology,
            reconnect_notify: Notify::new(),
            setup_permits: Semaphore::new(*SETUP_CONCURRENCY),
        });

        tokio::spawn(Arc::clone(&this).supervisor_loop());

        log::info!("RabbitMQ {} connection established", label);
        Ok(this)
    }

    pub fn current(&self) -> Arc<Generation> {
        self.current.load_full()
    }

    pub fn is_connected(&self) -> bool {
        self.current().is_usable()
    }

    /// Caps how many consumer setups run against this connection at once.
    /// tokio's semaphore is FIFO, so a worker whose setup timed out and retries
    /// queues behind the ones that haven't had a turn yet.
    pub async fn setup_permit(&self) -> SemaphorePermit<'_> {
        self.setup_permits
            .acquire()
            .await
            .expect("the setup semaphore is never closed")
    }

    pub fn record_setup_success(&self, generation: &Generation) {
        generation.setup_timeouts.record_success();
    }

    /// Consecutive setup timeouts on a connection that still reports
    /// `Connected` mean the connection is wedged rather than the broker merely
    /// being slow for one queue; past the threshold it is replaced.
    pub fn record_setup_timeout(&self, generation: &Generation) {
        if generation
            .setup_timeouts
            .record_timeout(*SETUP_TIMEOUTS_BEFORE_RECONNECT)
        {
            log::warn!(
                "RabbitMQ {}: {} consumer setups in a row timed out on connection generation {}, replacing it",
                self.label,
                *SETUP_TIMEOUTS_BEFORE_RECONNECT,
                generation.id
            );
            self.condemn(generation.id);
        }
    }

    fn condemn(&self, generation_id: u64) {
        let current = self.current();
        if current.id != generation_id {
            return;
        }
        current.condemned.store(true, Ordering::Release);
        self.reconnect_notify.notify_one();
    }

    async fn supervisor_loop(self: Arc<Self>) {
        let mut ticker = tokio::time::interval(*HEALTH_CHECK_INTERVAL);
        loop {
            tokio::select! {
                _ = ticker.tick() => {}
                _ = self.reconnect_notify.notified() => {}
            }

            let old = self.current();
            if old.is_usable() {
                continue;
            }

            log::warn!(
                "RabbitMQ {} connection generation {} lost (status: {:?}, condemned: {}), reconnecting...",
                self.label,
                old.id,
                old.connection.status(),
                old.condemned.load(Ordering::Acquire),
            );

            // Retiring, not closing, is what moves this generation's workers
            // onto the next one: the close below is best-effort and may never
            // complete, and until it does lapin keeps their streams open.
            old.retired.cancel();

            // A condemned connection may still be up; release it broker-side.
            if old.connection.status().connected() {
                let old = Arc::clone(&old);
                tokio::spawn(async move {
                    let close = old.connection.close(
                        AMQPHardError::CONNECTIONFORCED.get_id(),
                        "connection replaced".into(),
                    );
                    if let Ok(Err(e)) = tokio::time::timeout(*CLOSE_TIMEOUT, close).await {
                        log::warn!("Failed to close replaced RabbitMQ connection: {:?}", e);
                    }
                });
            }

            // Never give up: a long broker outage must converge without a pod
            // restart. The jitter keeps a fleet from redialing in lockstep.
            let backoff = retry::unbounded(Duration::from_secs(1), Duration::from_secs(30));
            let label = self.label;
            let connection = (|| dial(&self.uri, self.declare_topology))
                .retry(backoff)
                .notify(|e, _| log::warn!("Failed to redial RabbitMQ ({}): {:?}", label, e))
                .await;

            match connection {
                Ok(connection) => {
                    let id = old.id + 1;
                    self.current
                        .store(Arc::new(Generation::new(id, connection)));
                    log::info!(
                        "RabbitMQ {} connection restored (generation {})",
                        self.label,
                        id
                    );
                }
                Err(e) => {
                    // The backoff is unbounded, so this is effectively
                    // unreachable; the next tick retries.
                    log::error!(
                        "RabbitMQ {} reconnect gave up unexpectedly: {:?}",
                        self.label,
                        e
                    );
                }
            }
        }
    }
}

async fn dial(uri: &str, declare_topology: Option<DeclareTopology>) -> anyhow::Result<Connection> {
    let dial = async {
        // Auto-recovery off: on failure lapin moves the connection to `Error`
        // and errors its consumers, which is what the supervisor and the
        // workers react to.
        let connection = Connection::connect(uri, ConnectionProperties::default()).await?;
        if let Some(declare_topology) = declare_topology {
            let channel = connection.create_channel().await?;
            declare_topology(&channel).await?;
            channel.close(REPLY_SUCCESS, "OK".into()).await?;
        }
        anyhow::Ok(connection)
    };

    match tokio::time::timeout(*DIAL_TIMEOUT, dial).await {
        Ok(result) => result,
        Err(_) => Err(anyhow::anyhow!("RabbitMQ dial timed out")),
    }
}

#[derive(Default)]
struct SetupTimeouts(AtomicU32);

impl SetupTimeouts {
    fn record_success(&self) {
        self.0.store(0, Ordering::Release);
    }

    /// Returns true exactly once, on the timeout that reaches `threshold`.
    fn record_timeout(&self, threshold: u32) -> bool {
        self.0.fetch_add(1, Ordering::AcqRel) + 1 == threshold
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn setup_timeouts_escalate_once_at_the_threshold() {
        let timeouts = SetupTimeouts::default();
        assert!(!timeouts.record_timeout(3));
        assert!(!timeouts.record_timeout(3));
        assert!(timeouts.record_timeout(3));
        // Already condemned; later timeouts on the same connection don't
        // re-trigger a reconnect.
        assert!(!timeouts.record_timeout(3));
    }

    #[test]
    fn a_successful_setup_resets_the_timeout_streak() {
        let timeouts = SetupTimeouts::default();
        assert!(!timeouts.record_timeout(2));
        timeouts.record_success();
        assert!(!timeouts.record_timeout(2));
        assert!(timeouts.record_timeout(2));
    }

    fn binding(queue: &str, exchange: &str, routing_key: &str) -> Binding {
        Binding {
            queue: queue.to_string(),
            exchange: exchange.to_string(),
            routing_key: routing_key.to_string(),
        }
    }

    #[test]
    fn bindings_are_tracked_per_queue_exchange_and_key() {
        let bindings = DashSet::new();
        assert!(!bindings.contains(&binding("q", "ex", "rk")));
        bindings.insert(binding("q", "ex", "rk"));
        assert!(bindings.contains(&binding("q", "ex", "rk")));
        assert!(!bindings.contains(&binding("q", "ex", "other")));
        assert!(!bindings.contains(&binding("other", "ex", "rk")));
    }
}
