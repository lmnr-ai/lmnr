use sqlx::PgPool;

pub mod api_keys;
pub mod datapoints;
pub mod datasets;
pub mod evaluations;
pub mod event_templates;
pub mod events;
pub mod limits;
pub mod metrics;
pub mod modifiers;
pub mod pipelines;
pub mod projects;
pub mod stats;
pub mod tags;
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
