//! This module traces the app-server itself with OpenTelemetry tracing
//! and using the tracing crate for instrumentation.
//!
//! This is not to be confused with the `traces` module, which refers to
//! and processes the traces and spans sent to the app-server from clients.

use opentelemetry::global;
use opentelemetry::trace::TracerProvider;
use opentelemetry_sdk::trace::SdkTracerProvider;
use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

pub fn setup_tracing(enable_otel: bool) {
    let env_filter = if std::env::var("RUST_LOG").is_ok_and(|s| !s.is_empty()) {
        EnvFilter::from_default_env()
    } else {
        EnvFilter::new("info")
    };

    // Capture log events in Sentry when SENTRY_DSN is configured.
    // error-level logs become Sentry events; warn-level become breadcrumbs.
    let sentry_layer = std::env::var("SENTRY_DSN").is_ok().then(|| {
        sentry::integrations::tracing::layer().event_filter(|metadata| {
            match *metadata.level() {
                tracing::Level::ERROR => sentry::integrations::tracing::EventFilter::Event,
                tracing::Level::WARN => sentry::integrations::tracing::EventFilter::Breadcrumb,
                _ => sentry::integrations::tracing::EventFilter::Ignore,
            }
        })
    });

    let registry = tracing_subscriber::registry()
        .with(env_filter)
        .with(tracing_subscriber::fmt::layer())
        .with(sentry_layer);

    if enable_otel {
        let mut provider_builder = SdkTracerProvider::builder();

        if std::env::var("SENTRY_DSN").is_ok() {
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
