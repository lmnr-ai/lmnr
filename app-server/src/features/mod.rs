/// This module contains feature flags that can be used to enable or disable certain features in the application.
// TODO: consider https://doc.rust-lang.org/reference/conditional-compilation.html instead
use std::env;

pub enum Feature {
    UsageLimit,
    /// User subscription management
    Subscription,
    /// Remote storage, such as S3
    Storage,
    /// Build all containers. If false, only lite part is used: app-server, postgres, frontend
    FullBuild,
}

pub fn is_feature_enabled(feature: Feature) -> bool {
    match feature {
        Feature::UsageLimit | Feature::Subscription => {
            env::var("ENVIRONMENT") == Ok("PRODUCTION".to_string())
        }
        Feature::Storage => {
            env::var("AWS_ACCESS_KEY_ID").is_ok()
                && env::var("AWS_SECRET_ACCESS_KEY").is_ok()
                && env::var("S3_IMGS_BUCKET").is_ok()
        }
        Feature::FullBuild => env::var("FULL_BUILD").unwrap_or("true".to_string()) == "true",
    }
}
