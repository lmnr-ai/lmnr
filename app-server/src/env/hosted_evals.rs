//! Hosted evals (`src/hosted_evals/`): Harbor eval runs in Daytona sandboxes.

use super::{NumEnv, StringEnv};

/// Daytona API key. Presence (plus S3 storage) enables hosted evals. Also handed
/// to the orchestrator sandbox, which starts the trial sandboxes with it.
pub const DAYTONA_API_KEY: &str = "DAYTONA_API_KEY";
/// Daytona API base URL. Override for a self-hosted Daytona.
pub const DAYTONA_API_URL: StringEnv =
    StringEnv::new("DAYTONA_API_URL", "https://app.daytona.io/api");
/// Wall-clock cap on a run. Daytona destroys the orchestrator sandbox after it.
pub const MAX_RUN_MINUTES: NumEnv<u32> = NumEnv::new("HOSTED_EVALS_MAX_RUN_MINUTES", 720);
/// Laminar API URL the orchestrator reports results to. Unset means Laminar Cloud.
pub const LMNR_BASE_URL: &str = "HOSTED_EVALS_LMNR_BASE_URL";
