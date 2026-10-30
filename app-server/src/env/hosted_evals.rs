//! Hosted evals (`src/hosted_evals/`): Harbor trial sandboxes and remote-run
//! orchestrators on Daytona, proxied through the app-server.

use super::{NumEnv, StringEnv};

/// Daytona API key. Presence enables hosted evals. It stays in the app-server:
/// sandboxes only ever see a Laminar project key.
pub const DAYTONA_API_KEY: &str = "DAYTONA_API_KEY";
/// Daytona API base URL. Override for a self-hosted Daytona.
pub const DAYTONA_API_URL: StringEnv =
    StringEnv::new("DAYTONA_API_URL", "https://app.daytona.io/api");
/// Wall-clock cap on every hosted-evals sandbox (Daytona `ttlMinutes`) and on
/// a remote run's project key.
pub const MAX_RUN_MINUTES: NumEnv<u32> = NumEnv::new("HOSTED_EVALS_MAX_RUN_MINUTES", 720);
/// Sandboxes (trials and orchestrators) a project may hold at once.
pub const MAX_SANDBOXES_PER_PROJECT: NumEnv<usize> =
    NumEnv::new("HOSTED_EVALS_MAX_SANDBOXES_PER_PROJECT", 50);
/// Per-sandbox resource caps; a task asking for more is clamped to them.
pub const MAX_SANDBOX_CPUS: NumEnv<u32> = NumEnv::new("HOSTED_EVALS_MAX_SANDBOX_CPUS", 4);
pub const MAX_SANDBOX_MEMORY_GB: NumEnv<u32> = NumEnv::new("HOSTED_EVALS_MAX_SANDBOX_MEMORY_GB", 8);
pub const MAX_SANDBOX_DISK_GB: NumEnv<u32> = NumEnv::new("HOSTED_EVALS_MAX_SANDBOX_DISK_GB", 10);
/// Laminar API URL remote-run orchestrators call back to. Unset means Laminar Cloud.
pub const LMNR_BASE_URL: StringEnv =
    StringEnv::new("HOSTED_EVALS_LMNR_BASE_URL", "https://api.lmnr.ai");
/// Registry trial images are pushed to, e.g. `registry.example.com`. Unset means
/// the AWS account's ECR registry in `AWS_REGION`, through the default
/// credential chain.
pub const REGISTRY_URL: &str = "HOSTED_EVALS_REGISTRY_URL";
/// Basic-auth credentials for `HOSTED_EVALS_REGISTRY_URL`.
pub const REGISTRY_USERNAME: &str = "HOSTED_EVALS_REGISTRY_USERNAME";
pub const REGISTRY_PASSWORD: &str = "HOSTED_EVALS_REGISTRY_PASSWORD";
/// Each project pushes to `<prefix>/<project id>`.
pub const REGISTRY_REPOSITORY_PREFIX: StringEnv = StringEnv::new(
    "HOSTED_EVALS_REGISTRY_REPOSITORY_PREFIX",
    "lmnr-hosted-evals",
);
/// npm spec the orchestrator runs instead of `lmnr-cli@<requesting CLI's version>`
/// (e.g. a tarball URL for an unreleased CLI).
pub const CLI_PACKAGE: &str = "HOSTED_EVALS_CLI_PACKAGE";
