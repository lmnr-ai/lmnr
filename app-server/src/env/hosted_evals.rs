//! Hosted evals (`src/hosted_evals/`): Harbor eval runs orchestrated from Daytona sandboxes.

use super::{NumEnv, StringEnv};

/// Daytona API key. Presence (plus S3 storage and the trial provider's
/// credentials) enables hosted evals. Also handed to the orchestrator sandbox,
/// which deletes itself with it and, on Daytona trials, starts them.
pub const DAYTONA_API_KEY: &str = "DAYTONA_API_KEY";
/// Daytona API base URL. Override for a self-hosted Daytona.
pub const DAYTONA_API_URL: StringEnv =
    StringEnv::new("DAYTONA_API_URL", "https://app.daytona.io/api");
/// Where Harbor runs trials: `modal` or `daytona`.
pub const TRIAL_ENVIRONMENT: StringEnv = StringEnv::new("HOSTED_EVALS_TRIAL_ENVIRONMENT", "modal");
/// Modal credentials for `modal` trials, handed to the orchestrator sandbox.
pub const MODAL_TOKEN_ID: &str = "MODAL_TOKEN_ID";
pub const MODAL_TOKEN_SECRET: &str = "MODAL_TOKEN_SECRET";
/// Wall-clock cap on a run. Daytona destroys the orchestrator sandbox after it,
/// and Modal trial sandboxes time out with it.
pub const MAX_RUN_MINUTES: NumEnv<u32> = NumEnv::new("HOSTED_EVALS_MAX_RUN_MINUTES", 720);
/// Laminar API URL the orchestrator reports results to. Unset means Laminar Cloud.
pub const LMNR_BASE_URL: &str = "HOSTED_EVALS_LMNR_BASE_URL";
