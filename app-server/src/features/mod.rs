/// This module contains feature flags that can be used to enable or disable certain features in the application.
// TODO: consider https://doc.rust-lang.org/reference/conditional-compilation.html instead
use crate::env;

const PRODUCER: &str = "producer";
const CONSUMER: &str = "consumer";

#[derive(Clone, Copy)]
pub enum Feature {
    UsageLimit,
    /// Remote storage, such as S3
    Storage,
    /// Build all containers. If false, only lite part is used: app-server, postgres, frontend
    FullBuild,
    RabbitMQ,
    ClickhouseReadOnly,
    /// Sentry self-tracing tree. Requires a Sentry DSN.
    Tracing,
    #[cfg_attr(not(feature = "signals"), allow(dead_code))]
    Clustering,
    /// Laminar internal self-tracing tree. Independent of Sentry — gated only
    /// on `ENABLE_TRACING` so it works without a Sentry DSN.
    InternalTracing,
    Signals,
    /// Ingestion-time user-task extraction (LAM-1880). Shares the
    /// LLM-provider condition with `Signals` but stays a separate flag —
    /// features are fine-grained so gating can diverge later.
    InputExtraction,
    Reports,
    /// Checkpoints / agent-versioning pipeline (LAM-1987). Temporarily
    /// gated behind `CHECKPOINTS_ENABLED`, default off.
    Checkpoints,
    /// v2 static system-prompt extraction: per-agent prompt windows +
    /// line-level version detection replacing the skeleton-hash keying.
    /// Gated behind `SP_VERSIONING_ENABLED`, default off.
    SystemPromptVersioning,
    /// Signals resolve static prompts through the v2 version registry rather
    /// than the legacy per-naive-signature regex cache. Separate from
    /// `SystemPromptVersioning` so versioning can run (and be inspected) for a
    /// while before summarization consumes it; needs BOTH switches on.
    #[cfg_attr(not(feature = "signals"), allow(dead_code))]
    SignalsVersionedPrompts,
    /// User-task extraction keys its regexes by prompt version instead of the
    /// legacy agent-hash + tag-fingerprint pair. Needs BOTH switches on, and
    /// `InputExtraction` for the pipeline to run at all.
    VersionedInputExtraction,
    RateLimiter,
    /// Per-project data-ingestion rate limit (gRPC + HTTP OTLP traces).
    IngestionRateLimiter,
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
        Feature::ClickhouseReadOnly => {
            std::env::var(env::clickhouse::RO_USER).is_ok()
                && std::env::var(env::clickhouse::RO_PASSWORD).is_ok()
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
        Feature::Signals => has_llm_provider(),
        Feature::InputExtraction => has_llm_provider(),
        Feature::Reports => {
            std::env::var(env::observability::ENABLE_REPORTS).is_ok_and(|s| s == "true")
                && std::env::var(env::secrets::RESEND_API_KEY).is_ok_and(|s| !s.is_empty())
        }
        Feature::Checkpoints => env::checkpoints::ENABLED.get(),
        Feature::SystemPromptVersioning => env::static_sp::V2_ENABLED.get(),
        Feature::SignalsVersionedPrompts => {
            is_feature_enabled(Feature::SystemPromptVersioning)
                && env::static_sp::SIGNALS_ENABLED.get()
        }
        Feature::VersionedInputExtraction => {
            is_feature_enabled(Feature::SystemPromptVersioning)
                && env::static_sp::INPUT_EXTRACTION_ENABLED.get()
        }
        Feature::RateLimiter => {
            std::env::var(env::connections::REDIS_URL).is_ok()
                && std::env::var(env::rate_limit::HTTP_LIMIT).is_ok()
                && std::env::var(env::rate_limit::HTTP_PERIOD_SECS).is_ok()
        }
        Feature::IngestionRateLimiter => {
            std::env::var(env::connections::REDIS_URL).is_ok()
                && std::env::var(env::rate_limit::INGESTION_LIMIT).is_ok()
                && std::env::var(env::rate_limit::INGESTION_PERIOD_SECS).is_ok()
        }
        Feature::PiiRedaction => {
            std::env::var(env::connections::PII_REDACTOR_URL).is_ok_and(|s| !s.is_empty())
        }
    }
}

/// Mirrors the credential checks in `LlmClient::new` so LLM-backed
/// feature flags are true exactly when the client would construct.
fn has_llm_provider() -> bool {
    let provider = std::env::var(env::llm::PROVIDER)
        .ok()
        .map(|s| s.trim().to_lowercase())
        .unwrap_or_default();
    let has_llm_api_key = std::env::var(env::llm::API_KEY).is_ok_and(|s| !s.is_empty());
    let has_aws = std::env::var(env::secrets::AWS_ACCESS_KEY_ID).is_ok_and(|s| !s.is_empty())
        && std::env::var(env::secrets::AWS_SECRET_ACCESS_KEY).is_ok_and(|s| !s.is_empty())
        && std::env::var(env::secrets::AWS_REGION).is_ok_and(|s| !s.is_empty());
    match provider.as_str() {
        "gemini" | "openai" | "openai_responses" => has_llm_api_key,
        "bedrock" => has_aws,
        "mock" => true,
        _ => false,
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
