use crate::features::{Feature, is_feature_enabled};

const DEFAULT_MQ_MAX_PAYLOAD: usize = 1024 * 1024 * 50; // 50MB

pub fn mq_max_payload() -> usize {
    if is_feature_enabled(Feature::RabbitMQ) {
        let limit = std::env::var("MQ_MAX_PAYLOAD")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(DEFAULT_MQ_MAX_PAYLOAD);
        limit
    } else {
        usize::MAX
    }
}
