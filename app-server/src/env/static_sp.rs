//! Tunables for static system-prompt extraction (`traces/system_extraction`).

use super::{BoolEnv, NumEnv};

/// Provider override for the system extraction agent's LLM calls (e.g. `"bedrock"`,
/// `"gemini"`).
pub const SP_EXTRACTION_LLM_PROVIDER: &str = "SP_EXTRACTION_LLM_PROVIDER";

/// Number of same-signature system prompts to accumulate before triggering the
/// extraction agent. More samples let the agent tell static text from dynamic
/// fragments reliably.
pub const PROMPT_SAMPLES: NumEnv<usize> = NumEnv::new("SP_EXTRACTION_PROMPT_SAMPLES", 5);

/// TTL (seconds) on the accumulated raw prompts, so signatures that never reach
/// `PROMPT_SAMPLES` don't hold onto prompt bodies forever.
pub const ACCUMULATOR_TTL_SECONDS: NumEnv<u64> =
    NumEnv::new("SP_EXTRACTION_ACCUMULATOR_TTL_SECONDS", 3600);

/// Fallback trigger: total same-signature occurrences after which we resolve a
/// signature even though its unique samples never reached `PROMPT_SAMPLES` (a
/// byte-identical prompt collapses to one unique sample forever, so it would
/// otherwise never extract and the producer would re-enqueue on every trace).
pub const OCCURRENCE_THRESHOLD: NumEnv<u64> =
    NumEnv::new("SP_EXTRACTION_OCCURRENCE_THRESHOLD", 100);

// ==== v2 (version-tracking) pipeline, gated by `Feature::StaticSpV2` ====

/// Master switch for the v2 pipeline: per-agent prompt windows, line-level
/// version detection, and per-span version rows in ClickHouse. When false the
/// legacy skeleton-hash pipeline runs unchanged.
pub const V2_ENABLED: BoolEnv = BoolEnv::new("SP_VERSIONING_ENABLED", false);

/// Lets signals keep resolving static prompts through the legacy
/// per-naive-signature regex cache while versions are already being minted, so
/// the classifier can be rolled out and observed before summarization depends
/// on it. Requires `V2_ENABLED` to have any effect.
pub const SIGNALS_ENABLED: BoolEnv = BoolEnv::new("SP_VERSIONING_SIGNALS_ENABLED", false);

/// Ring buffer of last N distinct system prompts kept per agent in Redis.
pub const WINDOW_SIZE: NumEnv<usize> = NumEnv::new("SP_VERSIONING_WINDOW_SIZE", 40);

/// Number of closest window prompts intersected into a version's static line
/// set. Doubles as the minimum window population before a version can be
/// minted (below it a brand-new agent's hash would churn on every arrival).
pub const TOP_K: NumEnv<usize> = NumEnv::new("SP_VERSIONING_TOP_K", 20);

/// A cheap-match hit additionally runs the full clustering algorithm with
/// probability 1/N — the staleness bound for silent static ADDITIONS (an old,
/// smaller static set keeps subset-matching new prompts forever; removals
/// self-detect on the first miss).
pub const FULL_RUN_SAMPLING_N: NumEnv<u64> = NumEnv::new("SP_VERSIONING_FULL_RUN_SAMPLING_N", 20);

/// TTL on the `full_prompt_hash → version_hash` memo that short-circuits
/// byte-identical repeats at the ingest producer.
pub const MEMO_TTL_SECONDS: NumEnv<u64> = NumEnv::new("SP_VERSIONING_MEMO_TTL_SECONDS", 3600);

/// Sliding TTL on the per-agent prompt window.
pub const WINDOW_TTL_SECONDS: NumEnv<u64> =
    NumEnv::new("SP_VERSIONING_WINDOW_TTL_SECONDS", 24 * 3600);

/// Live versions kept per agent in the registry (oldest evicted on mint).
pub const VERSION_CAP: NumEnv<usize> = NumEnv::new("SP_VERSIONING_CAP", 10);

/// Sliding TTL on the version registry / line-set / regex keys.
pub const VERSION_TTL_SECONDS: NumEnv<u64> =
    NumEnv::new("SP_VERSIONING_TTL_SECONDS", 7 * 24 * 3600);

/// Raw samples fed to the extraction agent on a mint: the triggering prompt
/// plus the least-close of the top-K cluster (maximizes the dynamic-content
/// variance the agent sees while keeping per-run cost at legacy parity).
pub const AGENT_SAMPLES: NumEnv<usize> = NumEnv::new("SP_VERSIONING_AGENT_SAMPLES", 5);

/// Park delay (ms) for classifier messages that can't resolve yet
/// (cold-start window, mint in progress, transient error) — the delay
/// queue's per-message TTL before the broker dead-letters them back for a
/// re-check. The regex extraction worker never parks: its failures drop and
/// the next demand retries.
pub const RETRY_DELAY_MS: NumEnv<u64> = NumEnv::new("SP_VERSIONING_RETRY_DELAY_MS", 60_000);

/// Max parks per classifier message. On the final delivery a cold-start
/// message mints best-effort from the partial window; the other park reasons
/// drop the message and its spans stay unlabeled.
pub const MAX_RETRIES: NumEnv<u32> = NumEnv::new("SP_VERSIONING_MAX_RETRIES", 10);
