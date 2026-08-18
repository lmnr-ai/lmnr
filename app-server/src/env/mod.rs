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
pub mod checkpoints;
pub mod clickhouse;
pub mod connections;
pub mod database;
pub mod debugger;
pub mod llm;
pub mod mock;
pub mod mq;
pub mod notifications;
pub mod observability;
#[cfg(feature = "signals")]
pub mod private;
pub mod quickwit;
pub mod rate_limit;
pub mod secrets;
pub mod sentry_sampling;
pub mod server;
pub mod sql;
pub mod static_sp;
pub mod storage;
pub mod streams;
pub mod user_task;
pub mod workers;

/// A numeric env var with a static default. `T` is the parsed value type
/// (`u8` / `u16` / `u32` / `u64` / `usize` / `f64`).
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

/// Whether a parsed numeric value is a usable, finite number.
///
/// Only floats have unusable values (`NaN`, `±inf`), but [`NumEnv::clamp`] is
/// generic, so integers get a trivially-true impl.
pub trait FiniteNum {
    fn is_finite_value(&self) -> bool;
}

impl FiniteNum for f32 {
    fn is_finite_value(&self) -> bool {
        f32::is_finite(*self)
    }
}

impl FiniteNum for f64 {
    fn is_finite_value(&self) -> bool {
        f64::is_finite(*self)
    }
}

macro_rules! impl_finite_num_for_ints {
    ($($t:ty),*) => {
        $(impl FiniteNum for $t {
            fn is_finite_value(&self) -> bool {
                true
            }
        })*
    };
}

impl_finite_num_for_ints!(u8, u16, u32, u64, usize, i8, i16, i32, i64, isize);

impl<T: FromStr + Copy + PartialOrd + FiniteNum> NumEnv<T> {
    /// [`Self::get`], then clamped into `min..=max`. Use for a var whose valid
    /// range is narrower than its type (a 0.0-1.0 probability, a percentage), so
    /// an out-of-range value is corrected instead of reaching a caller that
    /// would panic or misbehave on it.
    ///
    /// Prefer this over `f64::clamp` / `Ord::clamp` at the call site: both panic
    /// when `min > max`, and `f64::clamp` propagates NaN. Here a reversed range
    /// yields a bound rather than a panic — an env descriptor should never be
    /// able to take the process down.
    ///
    /// A non-finite parse (`NaN`, `inf`, or an overflowing literal like `1e999`,
    /// which `f64::from_str` happily returns as `inf`) falls back to the DEFAULT
    /// rather than clamping to a bound. Clamping would silently turn a typo into
    /// the most extreme legal setting — for a sample rate that means "keep
    /// everything", i.e. the exact cost blowup the caller is trying to avoid.
    pub fn clamp(&self, min: T, max: T) -> T {
        let parsed = self.get();
        let value = if parsed.is_finite_value() {
            parsed
        } else {
            self.default
        };

        if value < min {
            min
        } else if value > max {
            max
        } else {
            value
        }
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
            .unwrap_or(self.default.to_string())
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

#[cfg(test)]
mod tests {
    use std::env as std_env;

    use super::NumEnv;

    /// Env is process-global, so each case uses its own var name to stay
    /// independent of test-harness threading.
    fn with_var<T>(name: &'static str, value: Option<&str>, f: impl FnOnce() -> T) -> T {
        unsafe {
            match value {
                Some(v) => std_env::set_var(name, v),
                None => std_env::remove_var(name),
            }
        }
        let out = f();
        unsafe { std_env::remove_var(name) };
        out
    }

    #[test]
    fn clamp_bounds_an_out_of_range_value() {
        const RATE: NumEnv<f64> = NumEnv::new("TEST_CLAMP_RANGE", 0.2);

        assert_eq!(with_var(RATE.name, Some("5"), || RATE.clamp(0.0, 1.0)), 1.0);
        assert_eq!(
            with_var(RATE.name, Some("-1"), || RATE.clamp(0.0, 1.0)),
            0.0
        );
        assert_eq!(
            with_var(RATE.name, Some("0.7"), || RATE.clamp(0.0, 1.0)),
            0.7
        );
    }

    #[test]
    fn clamp_falls_back_for_unset_empty_and_unparseable() {
        const RATE: NumEnv<f64> = NumEnv::new("TEST_CLAMP_FALLBACK", 0.2);

        for value in [None, Some(""), Some("   "), Some("abc"), Some("0.2x")] {
            assert_eq!(with_var(RATE.name, value, || RATE.clamp(0.0, 1.0)), 0.2);
        }
    }

    #[test]
    fn clamp_falls_back_for_non_finite_rather_than_bounding() {
        // Clamping inf to the max would silently turn a typo into the most
        // extreme legal setting; the default is the safer read.
        const RATE: NumEnv<f64> = NumEnv::new("TEST_CLAMP_NON_FINITE", 0.2);

        for value in ["NaN", "inf", "-inf", "1e999"] {
            assert_eq!(
                with_var(RATE.name, Some(value), || RATE.clamp(0.0, 1.0)),
                0.2
            );
        }
    }

    #[test]
    fn clamp_works_for_integers_too() {
        const WORKERS: NumEnv<usize> = NumEnv::new("TEST_CLAMP_INT", 4);

        assert_eq!(
            with_var(WORKERS.name, Some("99"), || WORKERS.clamp(1, 16)),
            16
        );
        assert_eq!(
            with_var(WORKERS.name, Some("0"), || WORKERS.clamp(1, 16)),
            1
        );
        assert_eq!(
            with_var(WORKERS.name, Some("8"), || WORKERS.clamp(1, 16)),
            8
        );
    }

    #[test]
    fn clamp_does_not_panic_on_a_reversed_range() {
        // `f64::clamp`/`Ord::clamp` panic when min > max; an env descriptor must not.
        const RATE: NumEnv<f64> = NumEnv::new("TEST_CLAMP_REVERSED", 0.5);

        assert_eq!(
            with_var(RATE.name, Some("0.5"), || RATE.clamp(1.0, 0.0)),
            1.0
        );
    }
}
