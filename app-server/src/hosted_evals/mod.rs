//! Hosted evals: Harbor trials in Daytona sandboxes, driven through app-server
//! proxy routes so the Daytona key never leaves the app-server. A detached run
//! adds one orchestrator sandbox that runs `lmnr-cli eval orchestrate` with a
//! short-lived project key. See `docs/internal/hosted-evals.md`.

pub mod contexts;
pub mod daytona;
pub mod images;
pub mod sandboxes;

use std::collections::HashMap;

use anyhow::{Result, anyhow};
use chrono::{Duration, Utc};
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    cache::Cache,
    db::{self, DB},
    env, project_api_keys,
};
use daytona::{CreateSandbox, Daytona};
use sandboxes::CreateError;

/// Name prefix of the per-run project API keys. The frontend hides keys with it
/// from the project's key list (`frontend/lib/actions/project-api-keys`).
pub const RUN_KEY_NAME_PREFIX: &str = "lmnr-internal-evals-";
pub const PROJECT_LABEL: &str = "lmnr-project-id";
const ORCHESTRATOR_SESSION_ID: &str = "eval";
// Downloads the archive with the run key, runs the CLI, then deletes the
// sandbox through the app-server however the run ended. The session shell may
// be zsh, so nothing here relies on bash-only syntax.
const ORCHESTRATOR_COMMAND: &str = concat!(
    r#"mkdir -p "$HOME/evals" && cd "$HOME/evals" && "#,
    r#"curl -fsS -H "Authorization: Bearer $LMNR_PROJECT_API_KEY" "#,
    r#""$LMNR_BASE_URL/v1/hosted-evals/uploads/$LMNR_EVAL_UPLOAD_ID" -o /tmp/evals.tar.gz && "#,
    r#"tar -xzf /tmp/evals.tar.gz && rm /tmp/evals.tar.gz && "#,
    r#"npx -y --package="$LMNR_CLI_PACKAGE" lmnr-cli eval orchestrate; "#,
    r#"curl -fsS -X DELETE -H "Authorization: Bearer $LMNR_PROJECT_API_KEY" "#,
    r#""$LMNR_BASE_URL/v1/hosted-evals/sandboxes/$DAYTONA_SANDBOX_ID""#,
);

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

pub fn daytona_client(http: &reqwest::Client) -> Result<Daytona<'_>> {
    let api_key = std::env::var(env::hosted_evals::DAYTONA_API_KEY)
        .map_err(|_| anyhow!("{} is not set", env::hosted_evals::DAYTONA_API_KEY))?;
    Ok(Daytona::new(
        http,
        env::hosted_evals::DAYTONA_API_URL.get(),
        api_key,
    ))
}

/// POSIX single-quoting, safe for sh, bash and zsh.
pub fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', r"'\''"))
}

/// Mints the run's project API key, creates the orchestrator sandbox and starts
/// the run in it. Returns the sandbox id.
pub async fn start_run(
    http: &reqwest::Client,
    db: &DB,
    cache: &Cache,
    project_id: &Uuid,
    request: &RunRequest,
) -> Result<String, RunError> {
    let cli_package = cli_package(&request.cli_version).ok_or(RunError::InvalidCliVersion)?;
    let daytona = daytona_client(http)?;

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

    let sandbox_env = HashMap::from([
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
    ]);
    let result = launch_orchestrator(&daytona, cache, project_id, sandbox_env).await;
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
    if let Some(package) = std::env::var(env::hosted_evals::CLI_PACKAGE)
        .ok()
        .filter(|p| !p.is_empty())
    {
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
    daytona: &Daytona<'_>,
    cache: &Cache,
    project_id: &Uuid,
    env: HashMap<String, String>,
) -> Result<String, RunError> {
    let sandbox = sandboxes::create_within_capacity(
        daytona,
        cache,
        project_id,
        &CreateSandbox {
            env,
            labels: sandboxes::project_labels(project_id, "orchestrator"),
            ttl_minutes: env::hosted_evals::MAX_RUN_MINUTES.get(),
            ..Default::default()
        },
    )
    .await
    .map_err(RunError::Sandbox)?;

    if let Err(e) = start_orchestrator(daytona, &sandbox.id).await {
        if let Err(delete_err) = daytona.delete_sandbox(&sandbox.id).await {
            log::error!(
                "Failed to delete hosted eval sandbox {}: {delete_err:?}",
                sandbox.id
            );
        }
        return Err(e.into());
    }
    sandboxes::remember(cache, project_id, &sandbox.id, &sandbox.toolbox_proxy_url).await;
    Ok(sandbox.id)
}

async fn start_orchestrator(daytona: &Daytona<'_>, sandbox_id: &str) -> Result<()> {
    let sandbox = daytona.wait_until_started(sandbox_id).await?;
    let toolbox = daytona::Toolbox::new(&sandbox.toolbox_proxy_url, &sandbox.id);
    daytona
        .create_session(&toolbox, ORCHESTRATOR_SESSION_ID)
        .await?;
    daytona
        .exec_async(&toolbox, ORCHESTRATOR_SESSION_ID, ORCHESTRATOR_COMMAND)
        .await?;
    Ok(())
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
