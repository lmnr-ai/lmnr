use sqlx::PgPool;

pub mod datasets;
pub mod evaluations;
pub mod evaluators;
pub mod event_definitions;
pub mod events;
pub mod prices;
pub mod project_api_keys;
pub mod projects;
pub mod provider_api_keys;
pub mod slack_channel_to_events;
pub mod spans;
pub mod stats;
pub mod summary_trigger_spans;
pub mod tags;
pub mod trace;
pub mod utils;

#[derive(Clone, Debug)]
pub struct DB {
    pub pool: PgPool,
}

impl DB {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}
