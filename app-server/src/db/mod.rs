use regex::Regex;
use sqlx::PgPool;

use crate::env;

pub mod agents;
pub mod alert_targets;
pub mod custom_model_costs;
pub mod datasets;
pub mod debugger_sessions;
pub mod evaluations;
pub mod events;
pub mod labeling_queues;
pub mod model_costs;
pub mod project_api_keys;
pub mod projects;
pub mod reports;
#[cfg(feature = "signals")]
pub mod signals;
pub mod slack_integrations;
pub mod spans;
pub mod trace;
pub mod usage_warnings;
pub mod utils;
pub mod workspaces;

#[derive(Clone, Debug)]
pub struct DB {
    pub pool: PgPool,
}

impl DB {
    pub async fn connect_from_env() -> anyhow::Result<Self> {
        let options = get_pg_connect_options()?;
        let pool = sqlx::postgres::PgPoolOptions::new()
            .max_connections(env::database::MAX_CONNECTIONS.get())
            .connect_with(options)
            .await?;
        Ok(Self { pool })
    }
}

fn get_pg_connect_options() -> anyhow::Result<sqlx::postgres::PgConnectOptions> {
    let options = if let Ok(database_url) = std::env::var(env::database::URL) {
        options_from_database_url(&database_url)?
    } else {
        options_from_database_env_vars()?
    };

    // All queries use unqualified table names; the search_path points them at the
    // configured schema (default `public`).
    let options = options.options([("search_path", env::database::SCHEMA.get())]);

    if let Ok(ssl_root_cert) = std::env::var(env::database::SSL_ROOT_CERT) {
        Ok(options
            .ssl_mode(sqlx::postgres::PgSslMode::VerifyFull)
            .ssl_root_cert_from_pem(ssl_root_cert.into_bytes()))
    } else {
        Ok(options)
    }
}

fn options_from_database_url(
    database_url: &str,
) -> anyhow::Result<sqlx::postgres::PgConnectOptions> {
    let re = Regex::new(r"^postgres(?:ql)?://([^:]+):([^@]+)@([^:]+):(\d*)/(.+)$").unwrap();
    let caps = re
        .captures(database_url)
        .ok_or(anyhow::anyhow!("Invalid database URL"))?;
    let username = caps.get(1).map(|m| m.as_str()).unwrap_or("postgres");
    let password = caps
        .get(2)
        .ok_or(anyhow::anyhow!("Invalid database URL. Can't find password"))?
        .as_str();
    let host = caps
        .get(3)
        .ok_or(anyhow::anyhow!("Invalid database URL. Can't find host"))?
        .as_str();
    let port = caps
        .get(4)
        .and_then(|m| m.as_str().parse::<u16>().ok())
        .unwrap_or(5432);
    let database = caps.get(5).map(|m| m.as_str()).unwrap_or(username);
    Ok(sqlx::postgres::PgConnectOptions::new()
        .username(username)
        .password(password)
        .host(host)
        .port(port)
        .database(database))
}

fn options_from_database_env_vars() -> anyhow::Result<sqlx::postgres::PgConnectOptions> {
    let username = std::env::var(env::database::USERNAME).unwrap_or(String::from("postgres"));
    let password = std::env::var(env::database::PASSWORD)?;
    let host = std::env::var(env::database::HOST)?;
    let port = env::database::PORT.get();
    let database = std::env::var(env::database::DATABASE).unwrap_or(username.clone());

    Ok(sqlx::postgres::PgConnectOptions::new()
        .username(&username)
        .password(&password)
        .host(&host)
        .port(port)
        .database(&database))
}
