use std::env;

use regex::Regex;
use sqlx::PgPool;

pub mod datasets;
pub mod evaluations;
pub mod evaluators;
pub mod events;
pub mod labeling_queues;
pub mod prices;
pub mod project_api_keys;
pub mod projects;
pub mod rollout_sessions;
pub mod signal_jobs;
pub mod signal_triggers;
pub mod signals;
pub mod slack_channel_to_events;
pub mod slack_integrations;
pub mod spans;
pub mod stats;
pub mod trace;
pub mod utils;

#[derive(Clone, Debug)]
pub struct DB {
    pub pool: PgPool,
}

impl DB {
    pub async fn connect_from_env() -> anyhow::Result<Self> {
        let options = get_pg_connect_options()?;
        let pool = sqlx::postgres::PgPoolOptions::new()
            .max_connections(
                env::var("DATABASE_MAX_CONNECTIONS")
                    .unwrap_or(String::from("10"))
                    .parse::<u32>()
                    .unwrap_or(10),
            )
            .connect_with(options)
            .await?;
        Ok(Self { pool })
    }
}

fn get_pg_connect_options() -> anyhow::Result<sqlx::postgres::PgConnectOptions> {
    let options = if let Ok(database_url) = env::var("DATABASE_URL") {
        options_from_database_url(&database_url)?
    } else {
        options_from_database_env_vars()?
    };

    if let Ok(ssl_root_cert) = env::var("DATABASE_SSL_ROOT_CERT") {
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
    let username = env::var("DATABASE_USERNAME").unwrap_or(String::from("postgres"));
    let password = env::var("DATABASE_PASSWORD")?;
    let host = env::var("DATABASE_HOST")?;
    let port = env::var("DATABASE_PORT")
        .unwrap_or(String::from("5432"))
        .parse::<u16>()
        .unwrap_or(5432);
    let database = env::var("DATABASE_DATABASE").unwrap_or(username.clone());

    Ok(sqlx::postgres::PgConnectOptions::new()
        .username(&username)
        .password(&password)
        .host(&host)
        .port(port)
        .database(&database))
}
