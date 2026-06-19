use crate::env;
use crate::features::{Feature, is_feature_enabled};

pub fn mq_max_payload() -> usize {
    if is_feature_enabled(Feature::RabbitMQ) {
        env::mq::MAX_PAYLOAD.get()
    } else {
        usize::MAX
    }
}
