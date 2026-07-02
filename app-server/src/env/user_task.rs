//! Tunables for ingestion-time user-task extraction (`traces/user_task`).

use super::NumEnv;

/// Per-trace user-task winner-lock TTL (~6h). Bounds how long a winning
/// span's lock gates weaker candidates; after expiry the next candidate
/// re-extracts from scratch.
pub const USER_TASK_LOCK_TTL_SECONDS: NumEnv<u64> =
    NumEnv::new("USER_TASK_LOCK_TTL_SECONDS", 21600);
