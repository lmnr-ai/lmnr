//! Central registry for every environment variable the app-server reads.
//!
//! Goals:
//!   - One place to see a tunable's NAME, TYPE, and DEFAULT — so an operator
//!     tuning something mid-outage doesn't have to grep the call site.
//!   - One parsing/defaulting mechanism instead of N hand-rolled
//!     `env::var(...).ok().and_then(parse).unwrap_or(...)` chains.
//!
//! Two tiers of entry:
//!   - **Typed descriptors** ([`NumEnv`], [`StringEnv`], [`BoolEnv`]) for vars
//!     that have a static default. They bundle the name + default and expose a
//!     `.get()` that parses-with-default. This is the bulk of the operational
//!     surface (worker counts, batch sizes, limits, timeouts).
//!   - **Bare name constants** (`pub const FOO: &str = "FOO";`) for vars that
//!     have NO sensible static default: required connection strings / secrets
//!     that `expect()` at boot, and vars consumed only inside multi-var feature
//!     detection (`features::is_feature_enabled`). Forcing a "default" onto a
//!     required secret would be misleading, so those keep their read logic at
//!     the call site and only borrow the name from here.
//!
//! Descriptor `.get()` semantics: the value is trimmed; an empty string (common
//! with k8s ConfigMap keys whose value isn't filled in) is treated as unset and
//! falls back to the default. This unifies the previously-divergent behaviour
//! where some readers filtered empty strings and others didn't.

use std::env;
use std::str::FromStr;

pub mod batching;
pub mod clickhouse;
pub mod connections;
pub mod database;
pub mod debugger;
pub mod llm;
pub mod mock;
pub mod mq;
pub mod notifications;
pub mod observability;
pub mod quickwit;
pub mod rate_limit;
pub mod secrets;
pub mod server;
pub mod sql;
pub mod storage;
pub mod workers;

/// A numeric env var with a static default. `T` is the parsed value type
/// (`u8` / `u16` / `u32` / `u64` / `usize`).
pub struct NumEnv<T> {
    name: &'static str,
    default: T,
}

impl<T> NumEnv<T> {
    pub const fn new(name: &'static str, default: T) -> Self {
        Self { name, default }
    }
}

impl<T: FromStr + Copy> NumEnv<T> {
    /// Parse the env value, falling back to the default when unset, empty, or
    /// unparseable.
    pub fn get(&self) -> T {
        env::var(self.name)
            .ok()
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
            .and_then(|v| v.parse().ok())
            .unwrap_or(self.default)
    }
}

/// A string env var with a static default.
pub struct StringEnv {
    name: &'static str,
    default: &'static str,
}

impl StringEnv {
    pub const fn new(name: &'static str, default: &'static str) -> Self {
        Self { name, default }
    }

    /// The env value, or the default when unset or empty. Not otherwise
    /// transformed — callers that need trailing-slash trimming etc. do it
    /// themselves.
    pub fn get(&self) -> String {
        env::var(self.name)
            .ok()
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| self.default.to_string())
    }
}

/// A boolean env var with a static default. Recognises
/// `true/1/yes/on` and `false/0/no/off` (case-insensitive); anything else
/// (including empty) falls back to the default.
pub struct BoolEnv {
    name: &'static str,
    default: bool,
}

impl BoolEnv {
    pub const fn new(name: &'static str, default: bool) -> Self {
        Self { name, default }
    }

    pub fn get(&self) -> bool {
        match env::var(self.name) {
            Ok(v) => match v.trim().to_lowercase().as_str() {
                "true" | "1" | "yes" | "on" => true,
                "false" | "0" | "no" | "off" => false,
                _ => self.default,
            },
            Err(_) => self.default,
        }
    }
}

/// Parse a numeric env var with a caller-supplied default. For the rare var
/// whose default is a runtime value (e.g. a crate constant) rather than a
/// literal, so it can't be a [`NumEnv`] const. Same trim/empty semantics as
/// [`NumEnv::get`].
pub fn num_with_default<T: FromStr>(name: &str, default: T) -> T {
    env::var(name)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}
