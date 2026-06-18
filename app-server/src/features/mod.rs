/// This module contains feature flags that can be used to enable or disable certain features in the application.
// TODO: consider https://doc.rust-lang.org/reference/conditional-compilation.html instead
use crate::env;

const PRODUCER: &str = "producer";
const CONSUMER: &str = "consumer";

pub enum Feature {
    UsageLimit,
    /// Remote storage, such as S3
    Storage,
    /// Build all containers. If false, only lite part is used: app-server, postgres, frontend
    FullBuild,
    RabbitMQ,
    SqlQueryEngine,
    ClickhouseReadOnly,
    /// Sentry self-tracing tree. Requires a Sentry DSN.
    Tracing,
    #[cfg_attr(not(feature = "signals"), allow(dead_code))]
    Clustering,
    /// Laminar internal self-tracing tree. Independent of Sentry — gated only
    /// on `ENABLE_TRACING` so it works without a Sentry DSN.
    InternalTracing,
    Signals,
    Reports,
    RateLimiter,
    GrpcRateLimiter,
    /// Strip PII from span input/output via the pii-redactor gRPC service,
    /// gated per project by the `projects.settings.removePii` toggle.
    PiiRedaction,
}

pub fn is_feature_enabled(feature: Feature) -> bool {
    match feature {
        Feature::UsageLimit => {
            std::env::var(env::connections::ENVIRONMENT) == Ok("PRODUCTION".to_string())
        }
        Feature::Storage => {
            std::env::var(env::secrets::AWS_ACCESS_KEY_ID).is_ok()
                && std::env::var(env::secrets::AWS_SECRET_ACCESS_KEY).is_ok()
                && std::env::var(env::storage::S3_EXPORTS_BUCKET).is_ok()
        }
        Feature::FullBuild => ["FULL", "PRODUCTION"].contains(
            &std::env::var(env::connections::ENVIRONMENT)
                .expect("ENVIRONMENT must be set")
                .as_str(),
        ),
        Feature::RabbitMQ => std::env::var(env::mq::URL).is_ok(),
        Feature::SqlQueryEngine => std::env::var(env::connections::QUERY_ENGINE_URL).is_ok(),
        Feature::ClickhouseReadOnly => {
            // Enabled whenever ClickHouse is configured. Dedicated read-only
            // credentials (CLICKHOUSE_RO_USER / CLICKHOUSE_RO_PASSWORD) are used
            // when present; otherwise the read-only client falls back to the main
            // ClickHouse credentials (see main.rs), so self-hosted deployments get
            // a working SQL editor and dashboards out of the box.
            std::env::var(env::clickhouse::URL).is_ok()
        }
        Feature::Tracing => {
            std::env::var(env::observability::SENTRY_DSN).is_ok()
                && std::env::var(env::observability::ENABLE_TRACING).is_ok_and(|s| s == "true")
        }
        Feature::InternalTracing => {
            std::env::var(env::observability::ENABLE_TRACING).is_ok_and(|s| s == "true")
        }
        Feature::Clustering => {
            // Kept as a
            // separate flag (rather than aliasing to Signals) so we can
            // extend backend gating later without renaming the variant.
            is_feature_enabled(Feature::Signals)
        }
        Feature::Signals => {
            // Mirrors the credential checks in `LlmClient::new` so this flag
            // is true exactly when the signal worker would actually start.
            let provider = std::env::var(env::llm::PROVIDER)
                .ok()
                .map(|s| s.trim().to_lowercase())
                .unwrap_or_default();
            let has_llm_api_key = std::env::var(env::llm::API_KEY).is_ok_and(|s| !s.is_empty());
            let has_aws = std::env::var(env::secrets::AWS_ACCESS_KEY_ID)
                .is_ok_and(|s| !s.is_empty())
                && std::env::var(env::secrets::AWS_SECRET_ACCESS_KEY).is_ok_and(|s| !s.is_empty())
                && std::env::var(env::secrets::AWS_REGION).is_ok_and(|s| !s.is_empty());
            match provider.as_str() {
                "gemini" | "openai" => has_llm_api_key,
                "bedrock" => has_aws,
                "mock" => true,
                _ => false,
            }
        }
        Feature::Reports => {
            std::env::var(env::observability::ENABLE_REPORTS).is_ok_and(|s| s == "true")
                && std::env::var(env::secrets::RESEND_API_KEY).is_ok_and(|s| !s.is_empty())
        }
        Feature::RateLimiter => {
            std::env::var(env::connections::REDIS_URL).is_ok()
                && std::env::var(env::rate_limit::HTTP_LIMIT).is_ok()
                && std::env::var(env::rate_limit::HTTP_PERIOD_SECS).is_ok()
        }
        Feature::GrpcRateLimiter => {
            std::env::var(env::connections::REDIS_URL).is_ok()
                && std::env::var(env::rate_limit::GRPC_LIMIT).is_ok()
                && std::env::var(env::rate_limit::GRPC_PERIOD_SECS).is_ok()
        }
        Feature::PiiRedaction => {
            std::env::var(env::connections::PII_REDACTOR_URL).is_ok_and(|s| !s.is_empty())
        }
    }
}

pub fn enable_consumer() -> bool {
    match std::env::var(env::connections::OPERATION_MODE) {
        Ok(v) => v.trim().to_lowercase() == CONSUMER,
        Err(_) => true,
    }
}

pub fn enable_producer() -> bool {
    match std::env::var(env::connections::OPERATION_MODE) {
        Ok(v) => v.trim().to_lowercase() == PRODUCER,
        Err(_) => true,
    }
}
