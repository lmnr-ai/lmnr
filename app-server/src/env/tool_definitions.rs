//! Tunables for tool-definition versioning (`traces/sp_versioning`,
//! `VersionKind::ToolDefinitions`): the same clustering algorithm as
//! system-prompt versioning, run per agent on the line rendering of each LLM
//! span's tool set. Feeds agent versioning only, so it runs only while
//! checkpoints are on. The window and clustering knobs mirror their
//! `SP_VERSIONING_*` twins in `static_sp.rs` (see there for semantics); memo,
//! TTL, cap and retry settings are shared.

use super::NumEnv;

pub const WINDOW_SIZE: NumEnv<usize> = NumEnv::new("TOOL_DEFINITION_VERSIONING_WINDOW_SIZE", 200);

pub const WINDOW_MAX_AGE_SECONDS: NumEnv<i64> =
    NumEnv::new("TOOL_DEFINITION_VERSIONING_WINDOW_MAX_AGE_SECONDS", 3600);

pub const MIN_WINDOW: NumEnv<usize> = NumEnv::new("TOOL_DEFINITION_VERSIONING_MIN_WINDOW", 20);

pub const WINDOW_MIN_ENTRIES: NumEnv<usize> =
    NumEnv::new("TOOL_DEFINITION_VERSIONING_WINDOW_MIN_ENTRIES", 10);

/// 100 folds the whole window: a tool set has no A/B variants worth splitting
/// into separate versions, only dynamic content (dates, ids, enum values).
pub const TOP_K_PERCENT: NumEnv<usize> =
    NumEnv::new("TOOL_DEFINITION_VERSIONING_TOP_K_PERCENT", 100);

pub const FULL_RUN_INTERVAL_SECONDS: NumEnv<u64> =
    NumEnv::new("TOOL_DEFINITION_VERSIONING_FULL_RUN_INTERVAL_SECONDS", 300);

pub const NUM_WORKERS: NumEnv<usize> = NumEnv::new("NUM_TOOL_DEFINITION_VERSIONING_WORKERS", 2);
