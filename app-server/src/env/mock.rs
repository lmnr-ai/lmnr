//! Mock LLM client failure-injection knobs (`llm/mock.rs`), used only in tests
//! / the `mock` provider. The enum-valued toggles are matched on at the call
//! site, so they stay bare names; the numeric counters carry defaults.

use super::NumEnv;

/// `retryable_429` | `non_retryable` — injected generate_content failure mode.
pub const GENERATE_FAILURE: &str = "MOCK_LLM_CLIENT_GENERATE_FAILURE";
/// `resource_exhausted` | `not_supported` — injected create_batch failure.
pub const BATCH_FAILURE: &str = "MOCK_LLM_CLIENT_BATCH_FAILURE";
/// `true` — get_batch reports the batch as expired.
pub const BATCH_EXPIRED: &str = "MOCK_LLM_CLIENT_BATCH_EXPIRED";

pub const GENERATE_FAILURE_COUNT: NumEnv<usize> =
    NumEnv::new("MOCK_LLM_CLIENT_GENERATE_FAILURE_COUNT", 3);
pub const STEPS_COUNT: NumEnv<usize> = NumEnv::new("MOCK_LLM_CLIENT_STEPS_COUNT", 2);
pub const BATCH_PENDING_TRIES: NumEnv<u32> = NumEnv::new("MOCK_LLM_CLIENT_BATCH_PENDING_TRIES", 0);
