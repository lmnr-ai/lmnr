//! Process-wide graceful shutdown: stop taking new work, finish what's in flight.
//!
//! Why this exists (LAM-2219). The servers stop on SIGTERM, but the stream
//! readers and queue workers are runtime TASKS, and the process exits the moment
//! the server threads' `block_on` returns — killing those tasks wherever they
//! happen to be. One of the places they can be is between "the ClickHouse insert
//! returned Ok" and "the offset store / ack that records it landed", and that is
//! exactly how a pod rotation duplicates spans: the successor resumes from the
//! last stored offset (or gets the unacked delivery redelivered) and writes the
//! same batch a second time.
//!
//! So a graceful shutdown is two separate signals here:
//!
//! 1. [`request`] / [`cancelled`] — *stop taking new work.* Every loop that
//!    pulls records/deliveries selects on it and leaves at the next opportunity.
//! 2. [`register_drain`] / [`wait_drained`] — *everything already in flight has
//!    finished.* `main` waits on this before returning, which is what turns the
//!    pod's grace period into a guarantee rather than a hope.
//!
//! Draining means "finish what you started", NOT "flush what you are holding".
//! Records batched but never flushed replay from the last stored offset (or are
//! redelivered) and are written exactly once, whereas flushing them on the way
//! out double-writes them whenever the offset store behind that flush fails —
//! see the `mq/stream/reader.rs` module header for the full argument. The drain
//! therefore only ever removes duplicates; it cannot add any.

use std::sync::LazyLock;
use std::time::Duration;

use tokio::sync::watch;

use super::wait_stop_signal;

/// Coordinates one process's shutdown. A struct rather than bare statics so tests
/// can drive an isolated instance — [`request`] is deliberately irreversible, so
/// a test touching the global would leak into every other test in the binary.
pub struct Shutdown {
    /// Set once, never cleared: a shutdown is not something we recover from.
    requested: watch::Sender<bool>,
    /// Live [`DrainGuard`] count. A `watch` rather than an atomic + `Notify`
    /// because the waiter must not be able to miss the last decrement:
    /// `wait_for` inspects the CURRENT value before it ever suspends.
    in_flight: watch::Sender<usize>,
}

impl Shutdown {
    pub fn new() -> Self {
        // Only the senders are kept: `subscribe()` mints receivers on demand, and
        // `send_replace`/`send_modify` update the value whether or not any
        // receiver exists.
        Self {
            requested: watch::channel(false).0,
            in_flight: watch::channel(0).0,
        }
    }

    /// Ask every drainable task to stop taking new work. Idempotent.
    pub fn request(&self) {
        if !self.requested.send_replace(true) {
            log::info!("Graceful shutdown requested: no new work will be taken");
        }
    }

    pub fn is_requested(&self) -> bool {
        *self.requested.borrow()
    }

    /// Resolves once [`Shutdown::request`] has been called — immediately if it
    /// already has. Use as a `tokio::select!` arm in any loop that takes new work.
    pub async fn cancelled(&self) {
        let mut requested = self.requested.subscribe();
        // `wait_for` evaluates the CURRENT value before suspending, so a request
        // landing between the subscribe and the await cannot be missed.
        let _ = requested.wait_for(|requested| *requested).await;
    }

    /// Register work that must finish before the process exits.
    pub fn register_drain(&self) -> DrainGuard<'_> {
        self.in_flight.send_modify(|count| *count += 1);
        DrainGuard { shutdown: self }
    }

    /// Wait until every [`DrainGuard`] is gone, or `limit` elapses. Returns
    /// whether the drain completed.
    ///
    /// Bounded because the flush retries behind those guards are unbounded by
    /// design (a ClickHouse outage must not drop spans), so an unbounded wait
    /// would just hand the shutdown over to the kubelet's SIGKILL — the very
    /// thing this path exists to avoid.
    pub async fn wait_drained(&self, limit: Duration) -> bool {
        let mut in_flight = self.in_flight.subscribe();
        let pending = *in_flight.borrow();
        if pending == 0 {
            return true;
        }

        log::info!(
            "Waiting up to {:?} for {} task(s) to finish what they were flushing",
            limit,
            pending
        );
        let drained = tokio::time::timeout(limit, async {
            let _ = in_flight.wait_for(|count| *count == 0).await;
        })
        .await
        .is_ok();

        if drained {
            log::info!("All tasks drained; exiting");
        } else {
            log::warn!(
                "Drain deadline of {:?} elapsed with {} task(s) still running - they are being cut short, so whatever they had already written may be written again on replay",
                limit,
                *self.in_flight.borrow()
            );
        }
        drained
    }
}

impl Default for Shutdown {
    fn default() -> Self {
        Self::new()
    }
}

/// Keeps the process alive through one task's in-flight work. Hold it for the
/// lifetime of a task whose last steps must not be cut short (a flush and the
/// offset store or ack that records it); dropping it — by returning — reports the
/// task as drained.
pub struct DrainGuard<'a> {
    shutdown: &'a Shutdown,
}

impl Drop for DrainGuard<'_> {
    fn drop(&mut self) {
        self.shutdown
            .in_flight
            .send_modify(|count| *count = count.saturating_sub(1));
    }
}

/// The process's shutdown state. Tests must never call the free functions below:
/// [`Shutdown::request`] is irreversible, so one test flipping the global would
/// make every worker loop in the test binary exit immediately. Build a local
/// [`Shutdown`] instead.
static GLOBAL: LazyLock<Shutdown> = LazyLock::new(Shutdown::new);

pub fn request() {
    GLOBAL.request();
}

pub fn is_requested() -> bool {
    GLOBAL.is_requested()
}

pub async fn cancelled() {
    GLOBAL.cancelled().await;
}

pub fn register_drain() -> DrainGuard<'static> {
    GLOBAL.register_drain()
}

pub async fn wait_drained(limit: Duration) -> bool {
    GLOBAL.wait_drained(limit).await
}

/// Spawn the SIGTERM/SIGINT listener that flips the flag.
///
/// A task of its own rather than something hung off a server's shutdown hook: the
/// drain has to START when the signal arrives, not once actix has finished its
/// own connection shutdown. The consumer server holds long-lived SSE streams, so
/// that alone can burn most of the grace period, and the readers would then be
/// killed mid-flush anyway.
pub fn listen_for_stop_signal(runtime: &tokio::runtime::Handle) {
    runtime.spawn(async {
        wait_stop_signal("background workers").await;
        request();
    });
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;

    #[tokio::test]
    async fn cancelled_resolves_for_a_request_that_already_happened() {
        let shutdown = Shutdown::new();
        assert!(!shutdown.is_requested());

        shutdown.request();

        assert!(shutdown.is_requested());
        // A task reaching its select arm AFTER the signal must still observe it —
        // otherwise a worker that was mid-flush when SIGTERM arrived would go back
        // to pulling new deliveries.
        shutdown.cancelled().await;
    }

    #[tokio::test]
    async fn cancelled_wakes_a_task_already_waiting() {
        let shutdown = Arc::new(Shutdown::new());
        let waiting = shutdown.clone();
        let observer = tokio::spawn(async move { waiting.cancelled().await });

        for _ in 0..8 {
            tokio::task::yield_now().await;
        }
        assert!(!observer.is_finished(), "nothing was requested yet");

        shutdown.request();
        observer.await.expect("observer task panicked");
    }

    #[tokio::test(start_paused = true)]
    async fn wait_drained_returns_immediately_with_nothing_registered() {
        let shutdown = Shutdown::new();
        assert!(shutdown.wait_drained(Duration::from_secs(30)).await);
    }

    #[tokio::test(start_paused = true)]
    async fn wait_drained_waits_for_a_registered_guard() {
        let shutdown = Arc::new(Shutdown::new());
        let guard_holder = shutdown.clone();

        let (release_tx, release_rx) = tokio::sync::oneshot::channel::<()>();
        let task = tokio::spawn(async move {
            let _drain = guard_holder.register_drain();
            let _ = release_rx.await;
        });

        // The whole point: the process must not exit while this task still holds
        // a guard, because it may be between an insert and its offset store.
        let waiter = shutdown.clone();
        let waiting =
            tokio::spawn(async move { waiter.wait_drained(Duration::from_secs(30)).await });
        for _ in 0..8 {
            tokio::task::yield_now().await;
        }
        assert!(
            !waiting.is_finished(),
            "a live guard must hold the shutdown"
        );

        let _ = release_tx.send(());
        task.await.expect("guarded task panicked");
        assert!(
            waiting.await.expect("waiter task panicked"),
            "the drain must report success once the guard is dropped"
        );
    }

    /// The deadline is the backstop for an unbounded transient retry: without it a
    /// ClickHouse outage would park the shutdown until the kubelet SIGKILLs us,
    /// which is strictly worse than cutting the flush short ourselves.
    #[tokio::test(start_paused = true)]
    async fn wait_drained_gives_up_at_the_deadline() {
        let shutdown = Shutdown::new();
        let _stuck = shutdown.register_drain();

        assert!(!shutdown.wait_drained(Duration::from_secs(30)).await);
    }

    #[tokio::test(start_paused = true)]
    async fn guards_are_counted_not_flagged() {
        let shutdown = Shutdown::new();

        let first = shutdown.register_drain();
        let second = shutdown.register_drain();
        drop(first);
        // One task finishing must not release the shutdown while the other is
        // still mid-flush.
        assert!(!shutdown.wait_drained(Duration::from_millis(50)).await);

        drop(second);
        assert!(shutdown.wait_drained(Duration::from_millis(50)).await);
    }
}
