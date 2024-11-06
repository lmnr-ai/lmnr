use sqlx::PgPool;

pub mod datapoints;
pub mod datasets;
pub mod evaluations;
pub mod event_templates;
pub mod events;
pub mod labeling_queues;
pub mod labels;
pub mod modifiers;
pub mod pipelines;
pub mod prices;
pub mod project_api_keys;
pub mod projects;
pub mod provider_api_keys;
pub mod spans;
pub mod stats;
pub mod subscriptions;
pub mod trace;
pub mod user;
pub mod utils;
pub mod workspace;

#[derive(Clone, Debug)]
pub struct DB {
    pub pool: PgPool,
}

impl DB {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}
