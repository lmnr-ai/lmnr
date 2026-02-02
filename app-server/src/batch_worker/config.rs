use std::time::Duration;

pub struct BatchingConfig {
    pub size: usize,
    pub flush_interval: Duration,
}
