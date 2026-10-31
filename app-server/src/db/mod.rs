use sqlx::PgPool;

use crate::env;

pub mod agents;
pub mod alert_targets;
pub mod custom_model_costs;
pub mod datasets;
pub mod debugger_session_blocks;
pub mod debugger_sessions;
pub mod evaluations;
pub mod events;
pub mod labeling_queues;
pub mod llm_feature_routes;
pub mod llm_profiles;
pub mod model_costs;
pub mod project_api_keys;
pub mod projects;
pub mod reports;
pub mod signal_triggers;
pub mod signals;
pub mod slack_integrations;
pub mod spans;
pub mod trace;
pub mod usage_warnings;
pub mod users;
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
    // sqlx parses the standard PostgreSQL URL grammar: optional port, percent-encoded
    // credentials and query options such as `sslmode`. It also accepts other schemes and
    // keeps the brackets of an IPv6 host, so those two are handled here.
    let scheme = url::Url::parse(database_url)
        .map_err(|_| anyhow::anyhow!("Invalid database URL"))?
        .scheme()
        .to_owned();
    if scheme != "postgres" && scheme != "postgresql" {
        return Err(anyhow::anyhow!("Invalid database URL"));
    }
    let options = database_url
        .parse::<sqlx::postgres::PgConnectOptions>()
        .map_err(|e| anyhow::anyhow!("Invalid database URL: {e}"))?;
    let host = options.get_host().to_owned();
    match host.strip_prefix('[').and_then(|h| h.strip_suffix(']')) {
        Some(ipv6) => Ok(options.host(ipv6)),
        None => Ok(options),
    }
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

#[cfg(test)]
mod tests {
    use super::options_from_database_url;

    #[test]
    fn parses_full_url_with_either_scheme() {
        for scheme in ["postgres", "postgresql"] {
            let options =
                options_from_database_url(&format!("{scheme}://alice:secret@db.example:6432/lmnr"))
                    .unwrap();
            assert_eq!(options.get_host(), "db.example");
            assert_eq!(options.get_port(), 6432);
            assert_eq!(options.get_username(), "alice");
            assert_eq!(options.get_database(), Some("lmnr"));
        }
    }

    #[test]
    fn port_is_optional() {
        let options = options_from_database_url("postgresql://alice:secret@db.example/lmnr").unwrap();
        assert_eq!(options.get_host(), "db.example");
        assert_eq!(options.get_port(), 5432);
    }

    #[test]
    fn credentials_are_percent_decoded() {
        let options =
            options_from_database_url("postgresql://al%40ice:p%40ss%3Aword@db.example:5432/lmnr")
                .unwrap();
        assert_eq!(options.get_username(), "al@ice");
    }

    #[test]
    fn bracketed_ipv6_host_is_accepted() {
        let options =
            options_from_database_url("postgresql://alice:secret@[2001:db8::1]:5432/lmnr").unwrap();
        assert_eq!(options.get_host(), "2001:db8::1");
        assert_eq!(options.get_port(), 5432);
    }

    #[test]
    fn query_options_stay_out_of_the_database_name() {
        let options = options_from_database_url(
            "postgresql://alice:secret@db.example:5432/lmnr?sslmode=require",
        )
        .unwrap();
        assert_eq!(options.get_database(), Some("lmnr"));
    }

    #[test]
    fn rejects_invalid_urls() {
        assert!(options_from_database_url("not a url").is_err());
        assert!(options_from_database_url("mysql://alice:secret@db.example/lmnr").is_err());
    }
}
