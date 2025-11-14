/// This module contains feature flags that can be used to enable or disable certain features in the application.
// TODO: consider https://doc.rust-lang.org/reference/conditional-compilation.html instead
use std::env;

const OPERATION_MODE: &str = "OPERATION_MODE";

const PRODUCER: &str = "producer";
const CONSUMER: &str = "consumer";

pub enum Feature {
    UsageLimit,
    /// Remote storage, such as S3
    Storage,
    /// Build all containers. If false, only lite part is used: app-server, postgres, frontend
    FullBuild,
    /// Evaluators
    Evaluators,
    RabbitMQ,
    SqlQueryEngine,
    ClickhouseReadOnly,
    Tracing,
    AggregateTraces,
    Clustering,
}

pub fn is_feature_enabled(feature: Feature) -> bool {
    match feature {
        Feature::UsageLimit => env::var("ENVIRONMENT") == Ok("PRODUCTION".to_string()),
        Feature::Storage => {
            env::var("AWS_ACCESS_KEY_ID").is_ok()
                && env::var("AWS_SECRET_ACCESS_KEY").is_ok()
                && env::var("S3_TRACE_PAYLOADS_BUCKET").is_ok()
        }
        Feature::FullBuild => ["FULL", "PRODUCTION"].contains(
            &env::var("ENVIRONMENT")
                .expect("ENVIRONMENT must be set")
                .as_str(),
        ),
        Feature::Evaluators => env::var("ONLINE_EVALUATORS_SECRET_KEY").is_ok(),
        Feature::RabbitMQ => env::var("RABBITMQ_URL").is_ok(),
        Feature::SqlQueryEngine => env::var("QUERY_ENGINE_URL").is_ok(),
        Feature::ClickhouseReadOnly => {
            env::var("CLICKHOUSE_RO_USER").is_ok() && env::var("CLICKHOUSE_RO_PASSWORD").is_ok()
        }
        Feature::Tracing => {
            env::var("SENTRY_DSN").is_ok() && env::var("ENABLE_TRACING").is_ok_and(|s| s == "true")
        }
        Feature::AggregateTraces => {
            env::var("AGGREGATE_TRACES").is_ok()
                && env::var("ENVIRONMENT") == Ok("PRODUCTION".to_string())
        }
        Feature::Clustering => {
            env::var("CLUSTER_ENDPOINT").is_ok() && env::var("CLUSTER_ENDPOINT_KEY").is_ok()
        }
    }
}

pub fn enable_consumer() -> bool {
    match env::var(OPERATION_MODE) {
        Ok(v) => v.trim().to_lowercase() == CONSUMER,
        Err(_) => true,
    }
}

pub fn enable_producer() -> bool {
    match env::var(OPERATION_MODE) {
        Ok(v) => v.trim().to_lowercase() == PRODUCER,
        Err(_) => true,
    }
}
