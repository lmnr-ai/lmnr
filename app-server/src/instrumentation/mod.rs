//! Self-tracing for app-server (distinct from the `traces` module, which handles client spans).
//!
//! Two independent OTEL tracer providers sit behind two per-layer-filtered
//! `tracing-opentelemetry` layers so Sentry tracing and Laminar's internal self-tracing never share
//! a trace or corrupt each other's span context:
//! - **Sentry** — owns `SentrySpanProcessor`, stays the global provider, receives non-internal spans.
//! - **Internal** — dedicated provider whose batch exporter is the in-process
//!   [`InProcessInternalExporter`]; built only when internal tracing is enabled, never global.
//!
//! The filters are disjoint (`is_internal` vs `!is_internal`), so each span's `OtelData` is written
//! by exactly one layer and the two trees can't leak into or parent each other.
//!
//! Emit an internal span by setting its `target` to [`INTERNAL_TRACING_TARGET`]; set attributes via
//! `OpenTelemetrySpanExt::set_attribute`. Pass `parent = None` to root a fresh internal trace.
//! ```ignore
//! #[tracing::instrument(target = "lmnr::internal", skip_all)]
//! async fn do_work() { /* ... */ }
//! ```

pub mod internal_exporter;
// Shared internal-span builder. `allow(dead_code)`: the checkpoints pipeline consumes most of it,
// but a few helpers (`event_name` / `run_id` / `set_metadata_i64`) are only used by the
// `signals`-gated consumer that lives in the private fork.
#[allow(dead_code)]
pub mod spans;

use opentelemetry::global;
use opentelemetry::trace::TracerProvider;
use opentelemetry_sdk::trace::SdkTracerProvider;
use sentry::integrations::tracing::EventFilter;
use tracing::Metadata;
use tracing_subscriber::{
    EnvFilter, Layer, filter::FilterFn, layer::SubscriberExt, util::SubscriberInitExt,
};

use internal_exporter::{InProcessInternalExporter, SharedIngestDeps};

/// `target` marking a span/event as Laminar-internal; routes it to the internal provider, never Sentry.
pub const INTERNAL_TRACING_TARGET: &str = "lmnr::internal";

/// Per-span destination project UUID. The exporter routes by it and strips it before ingest, so one
/// exporter can fan internal spans out to different projects.
pub const INTERNAL_PROJECT_ID_ATTR: &str = "lmnr.internal.project_id";

/// Whether a span/event belongs to the internal self-tracing tree.
fn is_internal(metadata: &Metadata<'_>) -> bool {
    metadata.target().starts_with(INTERNAL_TRACING_TARGET)
}

/// Sets up logging and the two OTEL trace trees (Sentry + internal).
///
/// Both trees are gated on `enable_otel` (`Feature::Tracing`); the returned provider is `None` when
/// it's `false`. Caller must keep the provider alive (batch exporter) and fill the returned
/// [`SharedIngestDeps`] once the queue/DB/cache exist. `runtime_handle` is the runtime the in-process
/// exporter drives ingest on.
#[must_use = "keep the returned provider alive and populate the ingest deps so internal spans are flushed"]
pub fn setup_tracing_and_logging(
    enable_otel: bool,
    runtime_handle: &tokio::runtime::Handle,
) -> (Option<SdkTracerProvider>, SharedIngestDeps) {
    // Built fresh per layer (`EnvFilter` isn't `Clone`); applied to both the fmt logger and the
    // Sentry OTEL layer so neither bridges TRACE/DEBUG library spans.
    let build_env_filter = || {
        if std::env::var("RUST_LOG").is_ok_and(|s| !s.is_empty()) {
            EnvFilter::from_default_env()
        } else {
            EnvFilter::new("info")
        }
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

    // Alternative: send logs to Sentry Logs (enable_logs on ClientOptions + sentry -F logs):
    // let sentry_layer = (enable_otel && sentry_dsn_set)
    //     .then(|| sentry::integrations::tracing::layer().with_filter(LevelFilter::ERROR));

    // PER-LAYER, not global: a global filter would short-circuit the whole stack, so a module-scoped
    // `RUST_LOG` could starve the internal export layer. `!is_internal` keeps internal events
    // (e.g. `record_error`'s exception event) off stderr.
    let fmt_layer = tracing_subscriber::fmt::layer()
        .with_filter(build_env_filter())
        .with_filter(FilterFn::new(|md: &Metadata<'_>| !is_internal(md)));

    let registry = tracing_subscriber::registry()
        .with(fmt_layer)
        .with(sentry_layer);

    // == Provider A: Sentry == receives non-internal spans, stays the global provider. Gated on
    // `enable_otel` (`Feature::Tracing`); the internal tree below does NOT depend on it.
    let otel_sentry_layer = enable_otel.then(|| {
        let mut sentry_provider_builder = SdkTracerProvider::builder();
        if sentry_dsn_set {
            sentry_provider_builder = sentry_provider_builder.with_span_processor(
                sentry::integrations::opentelemetry::SentrySpanProcessor::new(),
            );
        }
        let sentry_provider = sentry_provider_builder.build();
        let sentry_tracer = sentry_provider.tracer("app-server");
        global::set_tracer_provider(sentry_provider);

        // Level gate is REQUIRED: without it this layer bridges every non-internal span at every
        // level into Sentry, flooding it with TRACE/DEBUG library spans (tower/hyper `poll_ready`).
        tracing_opentelemetry::layer()
            .with_tracer(sentry_tracer)
            .with_filter(build_env_filter())
            .with_filter(FilterFn::new(|md: &Metadata<'_>| !is_internal(md)))
    });

    // == Provider B: internal self-tracing == gated on `enable_otel`, never the global provider.
    // The exporter needs the queue/DB/cache, so it holds a `SharedIngestDeps` slot `main` fills later.
    let ingest_deps: SharedIngestDeps = std::sync::Arc::new(std::sync::OnceLock::new());

    let (internal_provider, otel_internal_layer) = if enable_otel {
        let exporter = InProcessInternalExporter::new(ingest_deps.clone(), runtime_handle.clone());
        let provider = SdkTracerProvider::builder()
            .with_batch_exporter(exporter)
            .build();
        let internal_tracer = provider.tracer("app-server-internal");
        let layer = tracing_opentelemetry::layer()
            .with_tracer(internal_tracer)
            .with_filter(FilterFn::new(|md: &Metadata<'_>| is_internal(md)));
        (Some(provider), Some(layer))
    } else {
        (None, None)
    };

    registry
        .with(otel_sentry_layer)
        .with(otel_internal_layer)
        .init();

    (internal_provider, ingest_deps)
}
