//! This module traces the app-server itself with OpenTelemetry tracing
//! and using the tracing crate for instrumentation.
//!
//! This is not to be confused with the `traces` module, which refers to
//! and processes the traces and spans sent to the app-server from clients.

use opentelemetry::global;
use opentelemetry::trace::TracerProvider;
use opentelemetry_sdk::trace::SdkTracerProvider;
use sentry::integrations::tracing::EventFilter;
use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

pub fn setup_tracing_and_logging(enable_otel: bool) {
    let env_filter = if std::env::var("RUST_LOG").is_ok_and(|s| !s.is_empty()) {
        EnvFilter::from_default_env()
    } else {
        EnvFilter::new("info")
    };

    let sentry_dsn_set = std::env::var("SENTRY_DSN").is_ok();

    let sentry_layer = (enable_otel && sentry_dsn_set).then(|| {
        sentry::integrations::tracing::layer().event_filter(|md| match *md.level() {
            tracing::Level::ERROR => EventFilter::Event,
            _ => EventFilter::Ignore,
        })
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

    if enable_otel {
        let mut provider_builder = SdkTracerProvider::builder();

        if sentry_dsn_set {
            provider_builder = provider_builder.with_span_processor(
                sentry::integrations::opentelemetry::SentrySpanProcessor::new(),
            );
        }

        let tracer_provider = provider_builder.build();
        let tracer = tracer_provider.tracer("app-server");

        global::set_tracer_provider(tracer_provider);

        let otel_layer = tracing_opentelemetry::layer().with_tracer(tracer);

        registry.with(otel_layer).init();
    } else {
        registry.init();
    }
}
