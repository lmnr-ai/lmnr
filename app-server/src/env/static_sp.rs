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

/// Keys user-task extraction regexes by prompt VERSION rather than the legacy
/// agent-hash + tag-fingerprint pair. Requires `V2_ENABLED`. Flipping it
/// orphans every existing regex cache entry (the key shape changes), so each
/// cohort pays one warm-up cycle of LLM fallbacks — roll out per project.
pub const INPUT_EXTRACTION_ENABLED: BoolEnv =
    BoolEnv::new("SP_VERSIONING_INPUT_EXTRACTION_ENABLED", false);

/// Distinct user-message samples accumulated per (version, has_history) cohort
/// before the multi-sample user-task regex agent runs.
pub const INPUT_SAMPLES: NumEnv<usize> = NumEnv::new("SP_VERSIONING_INPUT_SAMPLES", 5);

/// TTL on a cohort's accumulated user-message samples. Kept after the agent
/// runs so a later regeneration doesn't start from zero.
pub const INPUT_ACCUMULATOR_TTL_SECONDS: NumEnv<u64> =
    NumEnv::new("SP_VERSIONING_INPUT_ACCUMULATOR_TTL_SECONDS", 7 * 24 * 3600);

/// Minimum gap between agent runs for one cohort. The accumulator is capped, so
/// without this a full accumulator would re-trigger on every later trace; a
/// cohort whose samples admit no anchor retries at most this often.
pub const INPUT_REGEX_RETRY_INTERVAL_SECONDS: NumEnv<i64> =
    NumEnv::new("SP_VERSIONING_INPUT_REGEX_RETRY_INTERVAL_SECONDS", 3600);

/// Upper bound on distinct system prompts kept per agent in Redis. The window
/// is primarily bounded by [`WINDOW_MAX_AGE_SECONDS`]; this caps a burst.
pub const WINDOW_SIZE: NumEnv<usize> = NumEnv::new("SP_VERSIONING_WINDOW_SIZE", 200);

/// Entries not seen within this many seconds are dropped, so the window is
/// "distinct prompts seen recently" rather than "the last N whenever they
/// arrived" — a slow agent's window can't span days and dilute a genuine
/// prompt change with pre-change prompts.
pub const WINDOW_MAX_AGE_SECONDS: NumEnv<i64> =
    NumEnv::new("SP_VERSIONING_WINDOW_MAX_AGE_SECONDS", 3600);

/// Minimum window population before a version can be minted (below it a
/// brand-new agent's hash would churn on every arrival). Messages park until
/// the window reaches it, then mint best-effort once the retry budget runs
/// out — most agents never produce this many distinct prompts in one window.
pub const MIN_WINDOW: NumEnv<usize> = NumEnv::new("SP_VERSIONING_MIN_WINDOW", 20);

/// Floor that age eviction will not take the window below: the most recent
/// entries are kept past [`WINDOW_MAX_AGE_SECONDS`] until only this many
/// remain.
///
/// Without it a slow agent's window empties between prompts, so every mint
/// intersects a cluster of ONE — which is that prompt verbatim, matches only
/// itself, and forces a fresh mint on the next prompt. Measured on a day of
/// production traffic, half of all mints came from agents in this state.
///
/// NOTE this does not by itself earn such an agent a `Normal` mint — that
/// needs [`MIN_WINDOW`] usable entries. A floor BELOW `MIN_WINDOW` improves
/// the quality of forced mints (a cluster of N rather than 1) without moving
/// the gate; set it at or above `MIN_WINDOW` to do both.
///
/// The cost is detection latency: entries retained past the age bound mean a
/// genuine prompt change takes this many new distinct prompts to flush out.
/// That is inherent for a slow agent — evidence can't accumulate faster than
/// it arrives — and the age bound still governs everything above the floor.
pub const WINDOW_MIN_ENTRIES: NumEnv<usize> = NumEnv::new("SP_VERSIONING_WINDOW_MIN_ENTRIES", 10);

/// Share of the window (percent) intersected into a version's static line set,
/// taking the closest prompts by Jaccard. A PROPORTION rather than a fixed
/// count on purpose: a fixed K at or below a single cohort's size makes the
/// cluster that cohort, and its dynamic values (a user id repeated across one
/// session's prompts) then read as static and mint a version per cohort.
pub const TOP_K_PERCENT: NumEnv<usize> = NumEnv::new("SP_VERSIONING_TOP_K_PERCENT", 50);

/// A cheap-match hit additionally re-runs the full clustering algorithm at most
/// once per agent per this many seconds — the staleness bound for silent static
/// ADDITIONS (an old, smaller static set keeps subset-matching new prompts
/// forever; removals self-detect on the first miss).
///
/// Seconds rather than the 1-in-N sampling this replaced, because the quantity
/// being bounded is DETECTION LATENCY after a prompt change, and that is
/// wall-clock. Under 1-in-N the latency was inversely proportional to traffic:
/// measured across one project's agents, the same N gave a 5-minute bound on
/// the busiest and a 4-day bound on the quietest.
///
/// Deliberately carries NO minimum-message companion bound. Below roughly one
/// prompt per interval this degrades to probing on every message, which is
/// affordable exactly because such an agent has few messages — the per-probe
/// cost is what rises, never the aggregate.
///
/// `0` probes on every cheap-match hit (debugging).
pub const FULL_RUN_INTERVAL_SECONDS: NumEnv<u64> =
    NumEnv::new("SP_VERSIONING_FULL_RUN_INTERVAL_SECONDS", 300);

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
