//! This module traces the app-server itself with OpenTelemetry tracing
//! and using the tracing crate for instrumentation.
//!
//! This is not to be confused with the `traces` module, which refers to
//! and processes the traces and spans sent to the app-server from clients.
//!
//! # Two independent trace trees
//!
//! We run two separate OTEL tracer providers behind two per-layer-filtered
//! `tracing-opentelemetry` layers, so that Sentry tracing and Laminar's own
//! internal (self-)tracing never share a trace and never corrupt each other's
//! span context:
//!
//! * **Sentry provider** — owns the `SentrySpanProcessor` and stays the global
//!   tracer provider. It receives every span that is *not* marked internal.
//!   Behaviour is identical to before this module grew a second provider.
//! * **Internal provider** — a dedicated provider exporting over OTLP, built
//!   only when [`INTERNAL_TRACING_ENDPOINT_ENV`] is set. It receives *only*
//!   spans marked internal and is deliberately never registered as the global
//!   provider, so internal spans cannot leak into Sentry and Sentry spans
//!   cannot become parents of internal spans.
//!
//! Because the two layers carry disjoint per-layer filters (`is_internal` vs
//! `!is_internal`), every span's `OtelData` extension is written by exactly one
//! layer — there is no extension-key collision despite both layers being stock
//! `tracing_opentelemetry::layer()` instances.
//!
//! # Emitting internal spans
//!
//! Mark any span or event as internal by setting its `target` to
//! [`INTERNAL_TRACING_TARGET`]:
//!
//! ```ignore
//! #[tracing::instrument(target = "lmnr::internal", skip_all)]
//! async fn do_work() { /* ... */ }
//! ```
//!
//! Set arbitrary attributes at runtime via
//! `tracing_opentelemetry::OpenTelemetrySpanExt::set_attribute`, or record
//! `#[instrument(fields(...))]` fields as usual — both end up on the exported
//! OTEL span.
//!
//! For a span that should start a brand-new internal trace (rather than nest
//! under whatever internal span happens to be active), also pass
//! `parent = None` so the bridge roots it with a fresh context.

use opentelemetry::global;
use opentelemetry::trace::TracerProvider;
use opentelemetry_otlp::WithExportConfig;
use opentelemetry_sdk::trace::SdkTracerProvider;
use sentry::integrations::tracing::EventFilter;
use tracing::Metadata;
use tracing_subscriber::{
    EnvFilter, Layer, filter::FilterFn, layer::SubscriberExt, util::SubscriberInitExt,
};

/// `target` that marks a span or event as Laminar-internal self-tracing.
/// Internal spans are routed to the dedicated internal OTEL provider and are
/// never sent to Sentry.
pub const INTERNAL_TRACING_TARGET: &str = "lmnr::internal";

/// Env var holding the OTLP (gRPC) endpoint for internal self-tracing, e.g.
/// `http://localhost:4317`. When unset or empty, the internal provider is not
/// built and internal spans are dropped — zero behaviour change from the
/// previous Sentry-only setup.
const INTERNAL_TRACING_ENDPOINT_ENV: &str = "LMNR_INTERNAL_TRACING_ENDPOINT";

/// Whether a span/event belongs to Laminar's internal self-tracing tree.
fn is_internal(metadata: &Metadata<'_>) -> bool {
    metadata.target().starts_with(INTERNAL_TRACING_TARGET)
}

/// Sets up logging and the two OTEL trace trees (Sentry + internal).
///
/// Returns the internal tracer provider when one was built; the caller must
/// keep it alive for the lifetime of the process so the batch exporter keeps
/// flushing. Returns `None` when OTEL is disabled or no internal endpoint is
/// configured.
///
/// `runtime_handle` is required because this runs before `main` enters the
/// tokio runtime, while the internal OTLP batch exporter needs a runtime for
/// its background gRPC export.
#[must_use = "keep the returned provider alive so internal spans are flushed"]
pub fn setup_tracing_and_logging(
    enable_otel: bool,
    runtime_handle: &tokio::runtime::Handle,
) -> Option<SdkTracerProvider> {
    let env_filter = if std::env::var("RUST_LOG").is_ok_and(|s| !s.is_empty()) {
        EnvFilter::from_default_env()
    } else {
        EnvFilter::new("info")
    };

    let sentry_dsn_set = std::env::var("SENTRY_DSN").is_ok_and(|s| !s.is_empty());

    // Sentry's tracing layer only forwards ERROR-level events, and never any
    // internal ones.
    let sentry_layer = (enable_otel && sentry_dsn_set).then(|| {
        sentry::integrations::tracing::layer()
            .event_filter(|md| match *md.level() {
                tracing::Level::ERROR => EventFilter::Event,
                _ => EventFilter::Ignore,
            })
            .with_filter(FilterFn::new(|md: &Metadata<'_>| !is_internal(md)))
    });

    // Alternative: direct send logs to sentry Logs. This is slightly easier to read all logs, but is
    // - harder to configure alerting
    // - comes at additional cost
    // This requires enable_logs = true on sentry ClientOptions, and cargo add sentry -F logs
    // let sentry_layer = (enable_otel && sentry_dsn_set)
    //     .then(|| sentry::integrations::tracing::layer().with_filter(LevelFilter::ERROR));

    let registry = tracing_subscriber::registry()
        .with(env_filter)
        .with(tracing_subscriber::fmt::layer())
        .with(sentry_layer);

    if !enable_otel {
        registry.init();
        return None;
    }

    // == Provider A: Sentry ==
    // Receives every NON-internal span. Stays the global provider so the
    // SentrySpanProcessor sees the same context Sentry's own integration uses.
    let mut sentry_provider_builder = SdkTracerProvider::builder();
    if sentry_dsn_set {
        sentry_provider_builder = sentry_provider_builder
            .with_span_processor(sentry::integrations::opentelemetry::SentrySpanProcessor::new());
    }
    let sentry_provider = sentry_provider_builder.build();
    let sentry_tracer = sentry_provider.tracer("app-server");
    global::set_tracer_provider(sentry_provider);

    let otel_sentry_layer = tracing_opentelemetry::layer()
        .with_tracer(sentry_tracer)
        .with_filter(FilterFn::new(|md: &Metadata<'_>| !is_internal(md)));

    // == Provider B: internal self-tracing ==
    // Built only when an OTLP endpoint is configured. Deliberately NOT set as
    // the global provider, so its trace tree stays fully independent of Sentry.
    let internal_endpoint = std::env::var(INTERNAL_TRACING_ENDPOINT_ENV)
        .ok()
        .filter(|s| !s.is_empty());

    let (internal_provider, otel_internal_layer) = match internal_endpoint {
        None => (None, None),
        Some(endpoint) => {
            // The OTLP batch exporter needs a tokio runtime for its background
            // gRPC export; we run before main enters the runtime, so enter it.
            let _guard = runtime_handle.enter();
            let exporter = opentelemetry_otlp::SpanExporter::builder()
                .with_tonic()
                .with_endpoint(endpoint)
                .build()
                .expect("failed to build internal OTLP span exporter");
            let provider = SdkTracerProvider::builder()
                .with_batch_exporter(exporter)
                .build();
            let internal_tracer = provider.tracer("app-server-internal");
            let layer = tracing_opentelemetry::layer()
                .with_tracer(internal_tracer)
                .with_filter(FilterFn::new(|md: &Metadata<'_>| is_internal(md)));
            (Some(provider), Some(layer))
        }
    };

    registry
        .with(otel_sentry_layer)
        .with(otel_internal_layer)
        .init();

    internal_provider
}
