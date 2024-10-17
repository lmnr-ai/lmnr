/// This module contains feature flags that can be used to enable or disable certain features in the application.
// TODO: consider https://doc.rust-lang.org/reference/conditional-compilation.html instead
use std::env;

pub enum Feature {
    USAGE_LIMIT,
    /// User subscription management
    SUBSCRIPTION,
    /// Remote storage, such as S3
    STORAGE,
}

pub fn is_feature_enabled(feature: Feature) -> bool {
    match feature {
        Feature::USAGE_LIMIT => env::var("USAGE_LIMIT").is_ok(),
        Feature::SUBSCRIPTION => env::var("SUBSCRIPTION").is_ok(),
        Feature::STORAGE => {
            env::var("STORAGE").is_ok()
                && env::var("AWS_ACCESS_KEY_ID").is_ok()
                && env::var("AWS_SECRET_ACCESS_KEY").is_ok()
                && env::var("S3_IMGS_BUCKET").is_ok()
        }
    }
}
