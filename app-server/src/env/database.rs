//! Postgres connection settings.

use super::NumEnv;

/// Full connection URL. When set, takes precedence over the discrete vars.
pub const URL: &str = "DATABASE_URL";
/// PEM root cert; when set, switches sslmode to VerifyFull.
pub const SSL_ROOT_CERT: &str = "DATABASE_SSL_ROOT_CERT";

/// Discrete connection params (used when `DATABASE_URL` is unset).
pub const USERNAME: &str = "DATABASE_USERNAME";
pub const PASSWORD: &str = "DATABASE_PASSWORD";
pub const HOST: &str = "DATABASE_HOST";
pub const DATABASE: &str = "DATABASE_DATABASE";

pub const PORT: NumEnv<u16> = NumEnv::new("DATABASE_PORT", 5432);
pub const MAX_CONNECTIONS: NumEnv<u32> = NumEnv::new("DATABASE_MAX_CONNECTIONS", 10);
