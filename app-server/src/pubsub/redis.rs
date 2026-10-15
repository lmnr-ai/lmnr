use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;

use backon::BackoffBuilder;
use futures_util::StreamExt;
use redis::AsyncCommands;

use crate::cache::connection::ResilientRedisConnection;
use crate::utils::retry;

use super::{PubSubError, PubSubTrait};

/// Redis Pub/Sub uses a dedicated socket, so a dropped stream must be replaced
/// independently of the multiplexed connection used for ordinary commands.
/// This is intentionally an unbounded retry with a capped, jittered delay:
/// losing the subscriber loses realtime delivery for the whole pod, while
/// giving up would require a process restart to recover it.
const SUBSCRIBE_RETRY_MIN_DELAY: Duration = Duration::from_millis(200);
const SUBSCRIBE_RETRY_MAX_DELAY: Duration = Duration::from_secs(10);

type SubscribeAttemptFuture<'a> = Pin<Box<dyn Future<Output = redis::RedisResult<()>> + Send + 'a>>;

trait SubscribeAttempt {
    fn run<'a>(&'a mut self) -> SubscribeAttemptFuture<'a>;
}

/// A Redis error that indicates a broken or temporarily unavailable
/// connection. Authentication, ACL, malformed-command, and clearly identified
/// client-configuration failures remain terminal. Redis-rs maps both malformed
/// RESP and a socket closed midway through a response to `ErrorKind::Parse`,
/// so parse errors must retry: the subscriber must survive a truncated
/// AUTH/SELECT response during connection setup. Retries use a capped delay
/// and keep logging the failure, making persistent endpoint mistakes visible.
fn is_reconnectable(error: &redis::RedisError) -> bool {
    use redis::{ErrorKind, ServerErrorKind};

    match error.kind() {
        ErrorKind::Io => !is_permanent_io_error(error),
        // redis-rs also represents a truncated frame at EOF as Parse. Since it
        // does not expose enough information here to reliably distinguish that
        // transient setup disconnect from a wrong endpoint, retry both with the
        // supervisor's capped backoff rather than permanently losing updates.
        ErrorKind::Parse => true,
        ErrorKind::ClusterConnectionNotFound => true,
        ErrorKind::Server(kind) => matches!(
            kind,
            ServerErrorKind::BusyLoading
                | ServerErrorKind::TryAgain
                | ServerErrorKind::ClusterDown
                | ServerErrorKind::MasterDown
                | ServerErrorKind::ReadOnly
        ),
        _ => false,
    }
}

fn is_permanent_io_error(error: &redis::RedisError) -> bool {
    use std::error::Error as _;
    use std::io::ErrorKind;

    let source = error.source();
    let io_error = source
        .and_then(|source| source.downcast_ref::<std::io::Error>())
        .or_else(|| {
            source
                .and_then(|source| {
                    source.downcast_ref::<Arc<dyn std::error::Error + Send + Sync>>()
                })
                .and_then(|source| source.downcast_ref::<std::io::Error>())
        });
    if let Some(source) = io_error {
        return matches!(
            source.kind(),
            // Tokio-rustls maps all TLS packet-processing errors to InvalidData,
            // including peer alerts during an otherwise transient handshake.
            // Treat those as reconnectable; the other kinds below are stronger
            // evidence of local configuration or permission errors.
            ErrorKind::InvalidInput | ErrorKind::PermissionDenied | ErrorKind::Unsupported
        );
    }

    if source.is_some() {
        // A non-I/O source (for example an invalid TLS server name) is also a
        // configuration failure, not a broken socket worth reconnecting.
        return true;
    }

    // A source-less I/O error does not establish that a failure is permanent.
    // In particular, TLS handshake/peer alerts may occur during failover.
    false
}

/// Keep a Redis subscription alive until the task is cancelled or Redis
/// returns a known permanent/configuration error.
///
/// A clean end-of-stream is treated as a disconnect. Redis-rs exposes the
/// Pub/Sub stream as `Option<Msg>`, so EOF has no error value to propagate; the
/// supervisor must explicitly reconnect or the first socket loss permanently
/// disables realtime updates for this process.
async fn run_subscribe_supervisor<A>(mut attempt: A) -> Result<(), PubSubError>
where
    A: SubscribeAttempt,
{
    let mut backoff =
        retry::unbounded(SUBSCRIBE_RETRY_MIN_DELAY, SUBSCRIBE_RETRY_MAX_DELAY).build();

    loop {
        match attempt.run().await {
            Ok(()) => {
                log::warn!("Redis Pub/Sub stream ended; reconnecting");
            }
            Err(error) if is_reconnectable(&error) => {
                log::warn!("Redis Pub/Sub connection failed; retrying: {}", error);
            }
            Err(error) => {
                log::error!(
                    "Redis Pub/Sub subscription stopped on a permanent error: {}",
                    error
                );
                return Err(PubSubError::InternalError(anyhow::Error::from(error)));
            }
        }

        // `retry::unbounded` has no attempt cap, while its max delay bounds the
        // outage's retry pressure. Awaiting the timer directly also means a
        // task abort/shutdown cancels the pending reconnect without spawning a
        // detached sleeper.
        let delay = backoff
            .next()
            .expect("unbounded Redis Pub/Sub backoff must never be exhausted");
        log::debug!("Retrying Redis Pub/Sub subscription in {:?}", delay);
        tokio::time::sleep(delay).await;
    }
}

struct RedisSubscribeAttempt<'a, F> {
    pubsub: &'a RedisPubSub,
    pattern: &'a str,
    callback: &'a mut F,
}

impl<F> SubscribeAttempt for RedisSubscribeAttempt<'_, F>
where
    F: FnMut(String, String) + Send + 'static,
{
    fn run<'a>(&'a mut self) -> SubscribeAttemptFuture<'a> {
        Box::pin(
            self.pubsub
                .subscribe_once(self.pattern, &mut *self.callback),
        )
    }
}

pub struct RedisPubSub {
    client: redis::Client,
    connection: Arc<ResilientRedisConnection>,
}

impl std::fmt::Debug for RedisPubSub {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("RedisPubSub").finish_non_exhaustive()
    }
}

impl RedisPubSub {
    pub fn new(client: redis::Client, connection: Arc<ResilientRedisConnection>) -> Self {
        Self { client, connection }
    }

    async fn subscribe_once<F>(&self, pattern: &str, callback: &mut F) -> redis::RedisResult<()>
    where
        F: FnMut(String, String) + Send,
    {
        let mut pubsub = self.client.get_async_pubsub().await?;
        pubsub.psubscribe(pattern).await?;

        log::info!("Redis Pub/Sub subscribed to pattern: {}", pattern);

        let mut stream = pubsub.on_message();

        while let Some(msg) = stream.next().await {
            // get_channel_name() returns &str directly
            // get_payload() returns Result<String, RedisError>
            let channel = msg.get_channel_name().to_string();
            let payload = match msg.get_payload() {
                Ok(p) => p,
                Err(e) => {
                    log::error!("Failed to get payload: {}", e);
                    continue;
                }
            };

            callback(channel, payload);
        }

        Ok(())
    }
}

impl PubSubTrait for RedisPubSub {
    async fn publish(&self, channel: &str, message: &str) -> Result<(), PubSubError> {
        let mut conn = self.connection.current_clone();
        let result: redis::RedisResult<i32> = conn.publish(channel, message).await;
        match result {
            Ok(_count) => Ok(()),
            Err(e) => {
                log::error!("Redis publish error: {}", e);
                self.connection.notify_error();
                Err(PubSubError::InternalError(anyhow::Error::from(e)))
            }
        }
    }

    async fn subscribe<F>(&self, pattern: &str, mut callback: F) -> Result<(), PubSubError>
    where
        F: FnMut(String, String) + Send + 'static,
    {
        // Pub/Sub uses a dedicated, non-multiplexed connection (Redis pins the
        // subscription state per socket). Recreate that connection after EOF or
        // a transient setup failure; a caller cancellation still cancels this
        // future and does not leave a detached retry task behind.
        run_subscribe_supervisor(RedisSubscribeAttempt {
            pubsub: self,
            pattern,
            callback: &mut callback,
        })
        .await
    }
}

#[cfg(test)]
mod tests {
    use std::collections::VecDeque;
    use std::error::Error as _;
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };

    use super::*;

    struct ScriptedAttempt {
        outcomes: VecDeque<redis::RedisResult<()>>,
        calls: Arc<AtomicUsize>,
    }

    impl SubscribeAttempt for ScriptedAttempt {
        fn run<'a>(&'a mut self) -> SubscribeAttemptFuture<'a> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            let outcome = self
                .outcomes
                .pop_front()
                .expect("test script must contain enough subscription attempts");
            Box::pin(async move { outcome })
        }
    }

    fn io_error() -> redis::RedisError {
        std::io::Error::new(
            std::io::ErrorKind::ConnectionReset,
            "transient connection failure",
        )
        .into()
    }

    fn truncated_setup_response() -> redis::RedisError {
        // redis-rs 1.6 maps an incomplete RESP frame at EOF (including AUTH or
        // SELECT during connection setup) to ErrorKind::Parse.
        (
            redis::ErrorKind::Parse,
            "incomplete RESP frame at EOF while reading setup response",
        )
            .into()
    }

    fn transient_tls_peer_alert() -> redis::RedisError {
        // tokio-rustls 0.26 maps TLS packet-processing errors, including peer
        // alerts during failover, to std::io::ErrorKind::InvalidData.
        std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "received transient TLS peer alert during handshake",
        )
        .into()
    }

    fn permanent_error() -> redis::RedisError {
        (
            redis::ErrorKind::InvalidClientConfig,
            "invalid test configuration",
        )
            .into()
    }

    /// EOF is represented by a successful attempt with no more stream items.
    /// The supervisor must start a fresh attempt instead of returning `Ok(())`
    /// and permanently disabling realtime delivery.
    #[tokio::test(start_paused = true)]
    async fn reconnects_after_stream_eof() {
        let calls = Arc::new(AtomicUsize::new(0));
        let supervisor = run_subscribe_supervisor(ScriptedAttempt {
            outcomes: VecDeque::from([Ok(()), Err(permanent_error())]),
            calls: calls.clone(),
        });
        let handle = tokio::spawn(supervisor);

        tokio::task::yield_now().await;
        assert_eq!(calls.load(Ordering::SeqCst), 1);

        tokio::time::advance(Duration::from_secs(1)).await;
        tokio::task::yield_now().await;

        assert_eq!(calls.load(Ordering::SeqCst), 2);
        assert!(
            handle
                .await
                .expect("permanent error must return, not panic")
                .is_err()
        );
    }

    /// Connection and subscription setup failures are retried with the same
    /// supervisor, while a configuration error is surfaced to the caller.
    #[tokio::test(start_paused = true)]
    async fn retries_setup_disconnects_but_surfaces_permanent_errors() {
        let calls = Arc::new(AtomicUsize::new(0));
        let supervisor = run_subscribe_supervisor(ScriptedAttempt {
            outcomes: VecDeque::from([
                Err(truncated_setup_response()),
                Err(transient_tls_peer_alert()),
                Err(io_error()),
                Ok(()),
                Err(permanent_error()),
            ]),
            calls: calls.clone(),
        });
        let handle = tokio::spawn(supervisor);

        tokio::task::yield_now().await;
        assert_eq!(calls.load(Ordering::SeqCst), 1);

        tokio::time::advance(Duration::from_secs(2)).await;
        tokio::task::yield_now().await;
        assert_eq!(calls.load(Ordering::SeqCst), 2);

        tokio::time::advance(Duration::from_secs(2)).await;
        tokio::task::yield_now().await;
        assert_eq!(calls.load(Ordering::SeqCst), 3);

        tokio::time::advance(Duration::from_secs(2)).await;
        tokio::task::yield_now().await;
        assert_eq!(calls.load(Ordering::SeqCst), 4);

        tokio::time::advance(Duration::from_secs(2)).await;
        tokio::task::yield_now().await;
        assert_eq!(calls.load(Ordering::SeqCst), 5);
        assert!(
            handle
                .await
                .expect("permanent error must return, not panic")
                .is_err()
        );
    }

    #[test]
    fn permanent_errors_are_not_reconnectable() {
        assert!(!is_reconnectable(&permanent_error()));
        assert!(!is_reconnectable(
            &(redis::ErrorKind::AuthenticationFailed, "bad credentials").into()
        ));
        for kind in [
            std::io::ErrorKind::InvalidInput,
            std::io::ErrorKind::PermissionDenied,
            std::io::ErrorKind::Unsupported,
        ] {
            let error: redis::RedisError = std::io::Error::new(kind, "permanent I/O error").into();
            assert!(
                !is_reconnectable(&error),
                "{kind:?} must not retry forever (display={error}; detail={:?}; retry={:?}; sources={:?})",
                error.detail(),
                error.retry_method(),
                std::error::Error::source(&error).map(ToString::to_string)
            );
        }
        assert!(is_reconnectable(&transient_tls_peer_alert()));
        assert!(is_reconnectable(&truncated_setup_response()));
        let transient_io = io_error();
        assert_eq!(transient_io.kind(), redis::ErrorKind::Io);
        assert!(
            is_reconnectable(&transient_io),
            "unexpected I/O error source: {:?}",
            transient_io
                .source()
                .and_then(|source| source.downcast_ref::<std::io::Error>())
                .map(std::io::Error::kind)
        );
        assert!(is_reconnectable(
            &(
                redis::ErrorKind::Server(redis::ServerErrorKind::TryAgain),
                "retry me"
            )
                .into()
        ));
    }

    #[test]
    fn reconnect_backoff_is_jittered_bounded_and_unbounded() {
        let delays: Vec<_> = retry::unbounded(SUBSCRIBE_RETRY_MIN_DELAY, SUBSCRIBE_RETRY_MAX_DELAY)
            .build()
            .take(100)
            .collect();

        assert_eq!(delays.len(), 100, "the supervisor must not hit a retry cap");
        assert!(delays.iter().all(|delay| {
            *delay >= SUBSCRIBE_RETRY_MIN_DELAY && *delay < SUBSCRIBE_RETRY_MAX_DELAY * 2
        }));
        assert!(
            delays
                .iter()
                .any(|delay| *delay > SUBSCRIBE_RETRY_MIN_DELAY),
            "retry delays should include jitter"
        );
    }

    /// The retry timer is awaited by the supervisor itself. Aborting a task
    /// during the backoff therefore completes shutdown without a detached
    /// reconnect loop.
    #[tokio::test(start_paused = true)]
    async fn supervisor_can_be_cancelled_during_backoff() {
        let calls = Arc::new(AtomicUsize::new(0));
        let handle = tokio::spawn(run_subscribe_supervisor(ScriptedAttempt {
            outcomes: VecDeque::from([Ok(())]),
            calls: calls.clone(),
        }));

        tokio::task::yield_now().await;
        assert_eq!(calls.load(Ordering::SeqCst), 1);

        handle.abort();
        let error = handle
            .await
            .expect_err("aborted supervisor must not finish");
        assert!(error.is_cancelled());
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }
}
