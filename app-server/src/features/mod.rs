/// This module contains feature flags that can be used to enable or disable certain features in the application.
// TODO: consider https://doc.rust-lang.org/reference/conditional-compilation.html instead
use std::env;

pub enum Feature {
    UsageLimit,
    /// Remote storage, such as S3
    Storage,
    /// Build all containers. If false, only lite part is used: app-server, postgres, frontend
    FullBuild,
    /// Browser agent
    AgentManager,
    /// Evaluators
    Evaluators,
    RabbitMQ,
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
        Feature::AgentManager => {
            env::var("AGENT_MANAGER_URL").is_ok()
            // && env::var("ENVIRONMENT") == Ok("PRODUCTION".to_string())
        }
        Feature::Evaluators => env::var("ONLINE_EVALUATORS_SECRET_KEY").is_ok(),
        Feature::RabbitMQ => env::var("RABBITMQ_URL").is_ok(),
    }
}
