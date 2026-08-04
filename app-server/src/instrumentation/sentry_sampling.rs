//! Duration- and status-aware sampling of Sentry transactions.
//!
//! Sentry bills by span volume, but we use it for errors and latency. So the
//! interesting transactions are the ones that FAILED or were SLOW; the bulk of
//! the bill is fast, successful traffic that nobody looks at.
//!
//! Decision per transaction (see [`should_send`]):
//! 1. any span (or the transaction itself) has an error status → keep
//! 2. duration >= `SENTRY_MIN_SAMPLED_DURATION_SECS` → keep
//! 3. otherwise keep with probability `EXTERNAL_TRACING_SAMPLE_RATE`
//!
//! ## Why a transport wrapper and not `traces_sampler`
//!
//! `traces_sampler` runs at transaction START, where neither the duration nor
//! the final status is known yet — it can only implement rule 3. The Rust SDK
//! has no `before_send_transaction` hook (`before_send` covers ERROR events
//! only), so the last place that sees a completed transaction is the
//! [`Transport`]. Filtering there is why the heuristic can use duration/status
//! at all.
//!
//! Sampling whole transactions (not individual spans) keeps every kept trace
//! internally complete — dropping a subset of a transaction's spans would leave
//! orphaned children and broken timings in the Sentry UI.

use std::sync::Arc;
use std::time::Duration;

use sentry::protocol::{Envelope, EnvelopeItem, SpanStatus, Transaction};
use sentry::{ClientOptions, Transport, TransportFactory};

/// A [`TransportFactory`] that wraps the SDK's real transport and drops
/// uninteresting transactions before they are sent.
pub struct SamplingTransportFactory {
    inner: Arc<dyn TransportFactory>,
    sample_rate: f64,
    min_duration_secs: f64,
}

impl SamplingTransportFactory {
    /// Wraps `inner`, reading both thresholds from the environment once.
    pub fn new(inner: Arc<dyn TransportFactory>) -> Self {
        Self {
            inner,
            sample_rate: crate::env::sentry_sampling::sample_rate(),
            min_duration_secs: crate::env::sentry_sampling::min_sampled_duration_secs(),
        }
    }
}

impl TransportFactory for SamplingTransportFactory {
    fn create_transport(&self, options: &ClientOptions) -> Arc<dyn Transport> {
        Arc::new(SamplingTransport {
            inner: self.inner.create_transport(options),
            sample_rate: self.sample_rate,
            min_duration_secs: self.min_duration_secs,
        })
    }
}

struct SamplingTransport {
    inner: Arc<dyn Transport>,
    sample_rate: f64,
    min_duration_secs: f64,
}

impl Transport for SamplingTransport {
    fn send_envelope(&self, envelope: Envelope) {
        // Only transaction items are filtered; error events, sessions, and
        // everything else pass through untouched.
        //
        // The `&EnvelopeItem` annotation is load-bearing: sentry-types 0.48.5+
        // takes an `EnvelopeFilter` trait here instead of a bare `FnMut` bound,
        // and without the explicit type the closure infers a by-value parameter
        // and stops satisfying it.
        let filtered = envelope.filter(|item: &EnvelopeItem| match item {
            EnvelopeItem::Transaction(transaction) => {
                should_send(transaction, self.sample_rate, self.min_duration_secs)
            }
            _ => true,
        });

        if let Some(envelope) = filtered {
            self.inner.send_envelope(envelope);
        }
    }

    fn flush(&self, timeout: Duration) -> bool {
        self.inner.flush(timeout)
    }

    fn shutdown(&self, timeout: Duration) -> bool {
        self.inner.shutdown(timeout)
    }
}

/// Whether a completed transaction should reach Sentry.
///
/// `rand::random_bool` is only reached for fast, non-error transactions, so the
/// per-transaction RNG cost is paid on the path we're trying to make cheap
/// anyway, and errors/slow traces are never subject to chance.
fn should_send(transaction: &Transaction<'_>, sample_rate: f64, min_duration_secs: f64) -> bool {
    if has_error(transaction) {
        return true;
    }

    if duration_secs(transaction).is_some_and(|secs| secs >= min_duration_secs) {
        return true;
    }

    rand::random_bool(sample_rate)
}

/// True when the transaction or any of its spans carries a non-OK status.
///
/// The transaction's own status lives in its `trace` context (Sentry's protocol
/// has no top-level status field on a transaction), which is where the OTEL
/// bridge writes the root span's converted status.
fn has_error(transaction: &Transaction<'_>) -> bool {
    let root_status = match transaction.contexts.get("trace") {
        Some(sentry::protocol::Context::Trace(trace)) => trace.status,
        _ => None,
    };

    is_error(root_status) || transaction.spans.iter().any(|span| is_error(span.status))
}

/// A missing status means "not set", which the OTEL bridge maps to `Ok`; only an
/// explicitly non-OK status counts as an error.
fn is_error(status: Option<SpanStatus>) -> bool {
    status.is_some_and(|status| status != SpanStatus::Ok)
}

/// Wall-clock duration in seconds, or `None` for an unfinished transaction
/// (no end timestamp) or a non-monotonic clock reading.
fn duration_secs(transaction: &Transaction<'_>) -> Option<f64> {
    transaction
        .timestamp?
        .duration_since(transaction.start_timestamp)
        .ok()
        .map(|d| d.as_secs_f64())
}

#[cfg(test)]
mod tests {
    use std::time::SystemTime;

    use sentry::protocol::{Context, Span, SpanStatus, TraceContext, Transaction};

    use super::{duration_secs, has_error, should_send};

    /// A transaction lasting `secs`, with no statuses set anywhere.
    fn transaction(secs: f64) -> Transaction<'static> {
        let start = SystemTime::UNIX_EPOCH;
        Transaction {
            start_timestamp: start,
            timestamp: Some(start + std::time::Duration::from_secs_f64(secs)),
            ..Default::default()
        }
    }

    fn with_root_status(mut tx: Transaction<'static>, status: SpanStatus) -> Transaction<'static> {
        tx.contexts.insert(
            "trace".into(),
            Context::Trace(Box::new(TraceContext {
                status: Some(status),
                ..Default::default()
            })),
        );
        tx
    }

    fn with_span_status(mut tx: Transaction<'static>, status: SpanStatus) -> Transaction<'static> {
        tx.spans.push(Span {
            status: Some(status),
            ..Default::default()
        });
        tx
    }

    #[test]
    fn keeps_error_transactions_at_zero_sample_rate() {
        // Sample rate 0 must not be able to drop an error.
        let tx = with_root_status(transaction(0.1), SpanStatus::InternalError);
        assert!(should_send(&tx, 0.0, 5.0));
    }

    #[test]
    fn keeps_transaction_whose_child_span_errored() {
        let tx = with_span_status(transaction(0.1), SpanStatus::NotFound);
        assert!(should_send(&tx, 0.0, 5.0));
    }

    #[test]
    fn keeps_slow_transactions_at_zero_sample_rate() {
        assert!(should_send(&transaction(5.0), 0.0, 5.0));
        assert!(should_send(&transaction(30.0), 0.0, 5.0));
    }

    #[test]
    fn drops_fast_successful_transactions_at_zero_sample_rate() {
        assert!(!should_send(&transaction(0.1), 0.0, 5.0));
        // Just under the threshold is still "fast".
        assert!(!should_send(&transaction(4.999), 0.0, 5.0));
    }

    #[test]
    fn keeps_everything_at_full_sample_rate() {
        assert!(should_send(&transaction(0.001), 1.0, 5.0));
    }

    #[test]
    fn ok_status_is_not_an_error() {
        // The OTEL bridge converts both Unset and Ok to SpanStatus::Ok, so an
        // explicit Ok must not be mistaken for a failure and bypass sampling.
        let tx = with_root_status(transaction(0.1), SpanStatus::Ok);
        assert!(!has_error(&tx));
        assert!(!should_send(&tx, 0.0, 5.0));
    }

    #[test]
    fn missing_status_is_not_an_error() {
        assert!(!has_error(&transaction(0.1)));
    }

    #[test]
    fn unfinished_transaction_has_no_duration() {
        let mut tx = transaction(1.0);
        tx.timestamp = None;
        assert!(duration_secs(&tx).is_none());
        // ...and is therefore subject to probabilistic sampling.
        assert!(!should_send(&tx, 0.0, 5.0));
    }

    #[test]
    fn zero_duration_threshold_keeps_everything() {
        assert!(should_send(&transaction(0.0), 0.0, 0.0));
    }
}
