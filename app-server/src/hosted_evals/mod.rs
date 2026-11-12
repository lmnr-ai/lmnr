//! Hosted evals: Harbor trials in provider sandboxes (Daytona today), driven
//! through app-server proxy routes so provider and registry credentials never
//! leave the app-server. A remote run adds one orchestrator sandbox that runs
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
use serde::{Deserialize, Serialize};
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
// Downloads the archive with the run key, runs the CLI, ends the run's log with
// its exit code, then deletes the sandbox through the app-server however the run
// ended. The archive stays: the run's evaluations show its files. Runs under
// `sh`, with all output in a file: lmnr-cli sends its own lines to the run's log
// and touches `LMNR_RUN_LOG_MARKER` once it has; without the marker (it never
// ran, e.g. a failed download or npm install) the file's tail goes with the exit
// code instead. The Laminar Harbor plugin records suite and task paths relative
// to `LMNR_EVALS_ROOT`.
const ORCHESTRATOR_COMMAND: &str = concat!(
    r#"exec >/tmp/lmnr-orchestrator.log 2>&1; "#,
    r#"export LMNR_EVALS_ROOT="$HOME/evals" LMNR_RUN_LOG_MARKER=/tmp/lmnr-run-log-started; "#,
    r#"mkdir -p "$LMNR_EVALS_ROOT" && cd "$LMNR_EVALS_ROOT" && "#,
    r#"curl -fsS -H "Authorization: Bearer $LMNR_PROJECT_API_KEY" "#,
    r#""$LMNR_BASE_URL/v1/hosted-evals/uploads/$LMNR_EVAL_UPLOAD_ID" -o /tmp/evals.tar.gz && "#,
    r#"tar -xzf /tmp/evals.tar.gz && rm /tmp/evals.tar.gz && "#,
    r#"npx -y --package="$LMNR_CLI_PACKAGE" lmnr-cli eval orchestrate; code=$?; "#,
    r#"if [ -e "$LMNR_RUN_LOG_MARKER" ]; then : >/tmp/lmnr-tail; "#,
    r#"else tail -n 200 /tmp/lmnr-orchestrator.log | cut -c 1-4096 >/tmp/lmnr-tail; fi; "#,
    r#"curl -fsS --retry 3 -X POST -H "Authorization: Bearer $LMNR_PROJECT_API_KEY" "#,
    r#"-H "Content-Type: text/plain" --data-binary @/tmp/lmnr-tail "#,
    r#""$LMNR_BASE_URL/v1/hosted-evals/runs/$LMNR_EVAL_UPLOAD_ID/logs/end?exitCode=$code"; "#,
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

/// A remote run (`lmnr-cli eval run --remote`). `spec` is opaque here: the CLI that requested the run wrote
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

pub fn index_key(project_id: &Uuid, upload_id: &Uuid) -> String {
    format!("hosted-evals/{project_id}/{upload_id}.index.json")
}

/// One suite's Harbor job output (its trial dirs), packed like the run's archive.
/// `suite` must pass [`is_suite_name`].
pub fn job_archive_key(project_id: &Uuid, upload_id: &Uuid, suite: &str) -> String {
    format!("hosted-evals/{project_id}/{upload_id}/jobs/{suite}.tar.gz")
}

pub fn job_index_key(project_id: &Uuid, upload_id: &Uuid, suite: &str) -> String {
    format!("hosted-evals/{project_id}/{upload_id}/jobs/{suite}.index.json")
}

/// A suite is a directory directly inside the evals folder, so its name is one
/// path segment. It goes into S3 keys, hence no separators or dot segments.
pub fn is_suite_name(suite: &str) -> bool {
    !suite.is_empty()
        && suite.len() <= 255
        && suite != "."
        && suite != ".."
        && !suite
            .chars()
            .any(|c| c == '/' || c == '\\' || c.is_control())
}

/// Where each file sits in an uploaded archive (written by lmnr-cli's
/// `pack.ts`), so the frontend reads one file with a ranged GET instead of the
/// whole archive. Parsed here only to reject a malformed index; it is stored as
/// sent and read by the frontend (`lib/hosted-evals`).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveIndex {
    #[allow(dead_code)]
    files: Vec<IndexedFile>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
struct IndexedFile {
    /// POSIX path relative to the archive root.
    path: String,
    size: u64,
    /// Byte range of the gzip member holding the file.
    offset: u64,
    length: u64,
    /// Where the file's content starts in the decompressed member.
    data_offset: u64,
}

/// What links an evaluation to the remote run that produced it
/// (`evaluations.hosted_metadata`), set by the Laminar Harbor plugin.
#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HostedMetadata {
    pub upload_id: Uuid,
    /// The suite dir, relative to the archive root.
    pub suite_path: String,
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
    fn suite_names_are_one_path_segment() {
        for good in ["support", "my suite", "évals-2", ".hidden"] {
            assert!(is_suite_name(good), "{good}");
        }
        let long = "a".repeat(256);
        for bad in ["", ".", "..", "a/b", "a\\b", "a\nb", long.as_str()] {
            assert!(!is_suite_name(bad), "{bad}");
        }
    }

    #[test]
    fn shell_quote_survives_single_quotes() {
        assert_eq!(shell_quote("echo 'hi'"), r"'echo '\''hi'\'''");
    }
}
