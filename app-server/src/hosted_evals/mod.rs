//! Hosted evals: Harbor trials in provider sandboxes (Daytona today), driven
//! through app-server proxy routes so provider and registry credentials never
//! leave the app-server. A detached run adds one orchestrator sandbox that runs
//! `lmnr-cli eval orchestrate` with a short-lived project key. See
//! `docs/internal/hosted-evals.md`.

pub mod images;
pub mod provider;
pub mod registry;
pub mod sandboxes;

use std::collections::HashMap;

use anyhow::Result;
use aws_config::SdkConfig;
use chrono::{Duration, Utc};
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    cache::Cache,
    db::{self, DB},
    env,
    features::{Feature, is_feature_enabled},
    project_api_keys,
};
use provider::{
    SandboxImage, SandboxProvider, SandboxProviderTrait, SandboxRole, SandboxSpec,
    daytona::DaytonaProvider,
};
use registry::ImageRegistry;
use sandboxes::CreateError;

/// Name prefix of the per-run project API keys. The frontend hides keys with it
/// from the project's key list (`frontend/lib/actions/project-api-keys`).
pub const RUN_KEY_NAME_PREFIX: &str = "lmnr-internal-evals-";
// Downloads the archive with the run key, runs the CLI, then deletes the
// sandbox through the app-server however the run ended. Runs under `sh`, with
// stderr folded into stdout so the provider's command log has everything.
const ORCHESTRATOR_COMMAND: &str = concat!(
    r#"exec 2>&1; "#,
    r#"mkdir -p "$HOME/evals" && cd "$HOME/evals" && "#,
    r#"curl -fsS -H "Authorization: Bearer $LMNR_PROJECT_API_KEY" "#,
    r#""$LMNR_BASE_URL/v1/hosted-evals/uploads/$LMNR_EVAL_UPLOAD_ID" -o /tmp/evals.tar.gz && "#,
    r#"tar -xzf /tmp/evals.tar.gz && rm /tmp/evals.tar.gz && "#,
    r#"npx -y --package="$LMNR_CLI_PACKAGE" lmnr-cli eval orchestrate; "#,
    r#"curl -fsS -X DELETE -H "Authorization: Bearer $LMNR_PROJECT_API_KEY" "#,
    r#""$LMNR_BASE_URL/v1/hosted-evals/sandboxes/$LMNR_SANDBOX_ID""#,
);

/// The sandbox provider and the registry trial images are pushed to. `None`
/// (hosted evals disabled) unless `DAYTONA_API_KEY` is set.
pub struct HostedEvals {
    pub provider: SandboxProvider,
    pub registry: ImageRegistry,
}

impl HostedEvals {
    /// Panics on a half-configured registry, so a deployment can't come up with
    /// hosted evals that fail on every push.
    pub fn from_env(aws: &SdkConfig) -> Option<Self> {
        if !is_feature_enabled(Feature::HostedEvals) {
            return None;
        }
        let api_key = env::optional_string(env::hosted_evals::DAYTONA_API_KEY)?;
        let provider =
            DaytonaProvider::new(env::hosted_evals::DAYTONA_API_URL.get(), api_key).into();
        let registry = ImageRegistry::from_env(aws).expect("Invalid hosted evals registry config");
        Some(Self { provider, registry })
    }
}

/// A detached run. `spec` is opaque here: the CLI that requested the run wrote
/// it and the same CLI version reads it back in the orchestrator.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunRequest {
    pub upload_id: Uuid,
    pub cli_version: String,
    pub spec: Value,
}

pub enum RunError {
    InvalidCliVersion,
    Sandbox(CreateError),
    Internal(anyhow::Error),
}

impl From<anyhow::Error> for RunError {
    fn from(e: anyhow::Error) -> Self {
        Self::Internal(e)
    }
}

pub fn archive_key(project_id: &Uuid, upload_id: &Uuid) -> String {
    format!("hosted-evals/{project_id}/{upload_id}.tar.gz")
}

/// POSIX single-quoting, safe for sh, bash and zsh.
pub fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', r"'\''"))
}

/// Mints the run's project API key, creates the orchestrator sandbox and starts
/// the run in it. Returns the sandbox id.
pub async fn start_run(
    provider: &SandboxProvider,
    db: &DB,
    cache: &Cache,
    project_id: &Uuid,
    request: &RunRequest,
) -> Result<String, RunError> {
    let cli_package = cli_package(&request.cli_version).ok_or(RunError::InvalidCliVersion)?;

    // The sandbox (and the user code in it) gets a key of its own that dies with
    // the run, never one of the project's user-facing keys.
    let run_key = project_api_keys::generate_api_key();
    let max_run_minutes = env::hosted_evals::MAX_RUN_MINUTES.get();
    let now = Utc::now();
    db::project_api_keys::create_api_key(
        &db.pool,
        project_id,
        &format!("{RUN_KEY_NAME_PREFIX}{}", now.format("%Y%m%dT%H%M%SZ")),
        &run_key.hash,
        &run_key.shorthand,
        now + Duration::minutes(max_run_minutes.into()),
    )
    .await?;

    let spec = SandboxSpec {
        project_id: *project_id,
        role: SandboxRole::Orchestrator,
        image: SandboxImage::Default,
        env: HashMap::from([
            ("LMNR_PROJECT_API_KEY".to_string(), run_key.value.clone()),
            (
                "LMNR_BASE_URL".to_string(),
                env::hosted_evals::LMNR_BASE_URL.get(),
            ),
            (
                "LMNR_EVAL_UPLOAD_ID".to_string(),
                request.upload_id.to_string(),
            ),
            ("LMNR_EVAL_RUN".to_string(), request.spec.to_string()),
            ("LMNR_CLI_PACKAGE".to_string(), cli_package),
        ]),
        ttl_minutes: max_run_minutes,
    };
    let result = launch_orchestrator(provider, cache, spec).await;
    if result.is_err()
        && let Err(e) = db::project_api_keys::delete_api_key_by_hash(&db.pool, &run_key.hash).await
    {
        log::error!("Failed to delete hosted eval run key: {e:?}");
    }
    result
}

/// `lmnr-cli@<version>` for the requesting CLI's version, unless the
/// deployment overrides the package. `None` for a version that isn't a plain
/// semver string.
fn cli_package(cli_version: &str) -> Option<String> {
    if let Some(package) = env::optional_string(env::hosted_evals::CLI_PACKAGE) {
        return Some(package);
    }
    let valid = !cli_version.is_empty()
        && cli_version.len() <= 64
        && cli_version
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b'+'));
    valid.then(|| format!("lmnr-cli@{cli_version}"))
}

async fn launch_orchestrator(
    provider: &SandboxProvider,
    cache: &Cache,
    spec: SandboxSpec,
) -> Result<String, RunError> {
    let sandbox = sandboxes::create(provider, cache, spec)
        .await
        .map_err(RunError::Sandbox)?;
    let started = async {
        sandboxes::wait_until_started(provider, &sandbox.id).await?;
        let command = format!(
            "export LMNR_SANDBOX_ID={}; {ORCHESTRATOR_COMMAND}",
            shell_quote(&sandbox.id)
        );
        provider.start_command(&sandbox, &command).await
    }
    .await;
    if let Err(e) = started {
        if let Err(delete_err) = provider.delete(&sandbox.id).await {
            log::error!(
                "Failed to delete hosted eval sandbox {}: {delete_err:?}",
                sandbox.id
            );
        }
        return Err(e.into());
    }
    Ok(sandbox.id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cli_package_accepts_semver_only() {
        assert_eq!(cli_package("0.5.3").as_deref(), Some("lmnr-cli@0.5.3"));
        assert_eq!(
            cli_package("0.6.0-beta.1+build").as_deref(),
            Some("lmnr-cli@0.6.0-beta.1+build")
        );
        for bad in ["", "0.5.3; rm -rf /", "$(id)", "1 2", "a/b"] {
            assert!(cli_package(bad).is_none(), "{bad}");
        }
    }

    #[test]
    fn shell_quote_survives_single_quotes() {
        assert_eq!(shell_quote("echo 'hi'"), r"'echo '\''hi'\'''");
    }
}
