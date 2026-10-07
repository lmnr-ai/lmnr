//! Tunables for user-template versioning (`traces/sp_versioning`,
//! `VersionKind::UserTemplate`): the same clustering algorithm as system-prompt
//! versioning, run on the winning span's last-turn user group. The window and
//! clustering knobs mirror their `SP_VERSIONING_*` twins in `static_sp.rs` (see
//! there for semantics) and are separate so the two kinds can be tuned
//! independently; memo, TTL, cap and retry settings are shared. The regex
//! inheritance knob is user-template only.

use super::NumEnv;

pub const WINDOW_SIZE: NumEnv<usize> = NumEnv::new("USER_TEMPLATE_VERSIONING_WINDOW_SIZE", 200);

pub const WINDOW_MAX_AGE_SECONDS: NumEnv<i64> =
    NumEnv::new("USER_TEMPLATE_VERSIONING_WINDOW_MAX_AGE_SECONDS", 3600);

pub const MIN_WINDOW: NumEnv<usize> = NumEnv::new("USER_TEMPLATE_VERSIONING_MIN_WINDOW", 20);

pub const WINDOW_MIN_ENTRIES: NumEnv<usize> =
    NumEnv::new("USER_TEMPLATE_VERSIONING_WINDOW_MIN_ENTRIES", 10);

pub const TOP_K_PERCENT: NumEnv<usize> = NumEnv::new("USER_TEMPLATE_VERSIONING_TOP_K_PERCENT", 50);

pub const FULL_RUN_INTERVAL_SECONDS: NumEnv<u64> =
    NumEnv::new("USER_TEMPLATE_VERSIONING_FULL_RUN_INTERVAL_SECONDS", 300);

pub const NUM_WORKERS: NumEnv<usize> = NumEnv::new("NUM_USER_TEMPLATE_VERSIONING_WORKERS", 2);

/// Minimum Jaccard overlap between two versions' static line sets for one to
/// lend the other its extraction regex (`input_extraction::inherit`). Clamped
/// to 0..=1. Re-mints of one template sit well above the default; lower lets a
/// partition's distinct templates lend each other regexes, higher stops small
/// templates (a few lines, where one line moves Jaccard a lot) from inheriting.
pub const INHERIT_MIN_OVERLAP: NumEnv<f64> = NumEnv::new("USER_TEMPLATE_INHERIT_MIN_OVERLAP", 0.7);
