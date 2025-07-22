use sqlx::PgPool;

pub mod agent_chats;
pub mod agent_messages;
pub mod datasets;
pub mod evaluations;
pub mod evaluators;
pub mod events;
pub mod labels;
pub mod prices;
pub mod project_api_keys;
pub mod projects;
pub mod provider_api_keys;
pub mod spans;
pub mod stats;
pub mod trace;
pub mod user;
pub mod user_cookies;
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
