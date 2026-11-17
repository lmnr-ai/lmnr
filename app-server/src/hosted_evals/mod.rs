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
/// Runs in the orchestrator sandbox; what it does is commented in the file.
const ORCHESTRATOR_SCRIPT: &str = include_str!("orchestrator.sh");

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
/// it (which agent scripts and task-set versions to run) and the same CLI version reads it back in the
/// orchestrator.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunRequest {
    pub cli_version: String,
    pub spec: Value,
}

/// A run whose orchestrator has started.
pub struct StartedRun {
    pub run_id: Uuid,
    pub sandbox_id: String,
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

/// A content-addressed blob: the packed files of one agent-scripts or task-set version. Kept until
/// deleted (no lifecycle rule on `eval-store/`), unlike run output under `hosted-evals/`.
pub fn blob_archive_key(project_id: &Uuid, hash: &str) -> String {
    format!("eval-store/{project_id}/{hash}.tar.gz")
}

pub fn blob_index_key(project_id: &Uuid, hash: &str) -> String {
    format!("eval-store/{project_id}/{hash}.index.json")
}

/// One task set's Harbor job output (its trial dirs) from a run, packed like a blob.
/// `task_set` must pass [`is_name`].
pub fn job_archive_key(project_id: &Uuid, run_id: &Uuid, task_set: &str) -> String {
    format!("hosted-evals/{project_id}/{run_id}/jobs/{task_set}.tar.gz")
}

pub fn job_index_key(project_id: &Uuid, run_id: &Uuid, task_set: &str) -> String {
    format!("hosted-evals/{project_id}/{run_id}/jobs/{task_set}.index.json")
}

/// Agent and task-set names: folder names in `evals/` and URL path segments, and task-set names go
/// into S3 keys.
pub fn is_name(name: &str) -> bool {
    let mut bytes = name.bytes();
    name.len() <= 100
        && bytes.next().is_some_and(|b| b.is_ascii_alphanumeric())
        && bytes.all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'))
}

/// A blob or version hash: lowercase hex sha256, computed by lmnr-cli.
pub fn is_hash(hash: &str) -> bool {
    hash.len() == 64 && hash.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

/// Where each file sits in a blob (written by lmnr-cli's `pack.ts`), so the
/// frontend reads one file with a ranged GET instead of the whole archive.
/// Parsed here only to reject a malformed index; it is stored as sent.
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

/// What lmnr-cli records about a run of one task set
/// (`evaluations.hosted_metadata`), sent by the Laminar Harbor plugin. The
/// evaluation links to the task set's pushed version with `task_set_hash`, if
/// any; the frontend reads the task set's and the scripts' files by hash.
#[derive(Serialize, Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct HostedMetadata {
    /// The local agent folder's name (`evals/<agent>/`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub task_set: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub task_set_hash: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scripts_hash: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub git_sha: Option<String>,
    /// Remote runs only: keys the run's log and job output.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub run_id: Option<Uuid>,
}

impl HostedMetadata {
    /// Drops values that would not be safe to build a storage key or link from.
    pub fn validated(self) -> Self {
        let name = |v: Option<String>| v.filter(|v| is_name(v));
        let hash = |v: Option<String>| v.filter(|v| is_hash(v));
        Self {
            agent: name(self.agent),
            task_set: name(self.task_set),
            task_set_hash: hash(self.task_set_hash),
            scripts_hash: hash(self.scripts_hash),
            git_sha: self
                .git_sha
                .filter(|v| v.len() <= 64 && v.chars().all(|c| c.is_ascii_hexdigit())),
            run_id: self.run_id,
        }
    }
}

/// POSIX single-quoting, safe for sh, bash and zsh.
pub fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', r"'\''"))
}

/// Mints the run's id and project API key, creates the orchestrator sandbox and
/// starts the run in it.
pub async fn start_run(
    provider: &SandboxProvider,
    db: &DB,
    cache: &Cache,
    project_id: &Uuid,
    request: &RunRequest,
) -> Result<StartedRun, RunError> {
    let cli_package = cli_package(&request.cli_version).ok_or(RunError::InvalidCliVersion)?;

    // The sandbox (and the user code in it) gets a key of its own that dies with
    // the run, never one of the project's user-facing keys.
    let run_id = Uuid::new_v4();
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
            ("LMNR_EVAL_RUN_ID".to_string(), run_id.to_string()),
            ("LMNR_EVAL_RUN".to_string(), request.spec.to_string()),
            ("LMNR_CLI_PACKAGE".to_string(), cli_package),
        ]),
        ttl_minutes: max_run_minutes,
    };
    let result = launch_orchestrator(provider, cache, spec)
        .await
        .map(|sandbox_id| StartedRun { run_id, sandbox_id });
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
            "export LMNR_SANDBOX_ID={}\n{ORCHESTRATOR_SCRIPT}",
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
    fn names_are_safe_path_segments() {
        for good in ["support-bot", "checkout_timeouts", "v1.2", "A"] {
            assert!(is_name(good), "{good}");
        }
        let long = "a".repeat(101);
        for bad in [
            "",
            ".",
            "..",
            ".hidden",
            "-x",
            "a/b",
            "a\\b",
            "a b",
            "évals",
            long.as_str(),
        ] {
            assert!(!is_name(bad), "{bad}");
        }
    }

    #[test]
    fn hashes_are_lowercase_sha256_hex() {
        assert!(is_hash(&"a1".repeat(32)));
        for bad in [
            "",
            "abc",
            &"A1".repeat(32),
            &"g1".repeat(32),
            &"a1".repeat(33),
        ] {
            assert!(!is_hash(bad), "{bad}");
        }
    }

    #[test]
    fn orchestrator_script_parses_as_posix_sh() {
        for shell in ["sh", "dash"] {
            let Ok(status) = std::process::Command::new(shell)
                .args(["-n", "-c", ORCHESTRATOR_SCRIPT])
                .status()
            else {
                continue;
            };
            assert!(status.success(), "{shell} -n rejects orchestrator.sh");
        }
    }

    #[test]
    fn shell_quote_survives_single_quotes() {
        assert_eq!(shell_quote("echo 'hi'"), r"'echo '\''hi'\'''");
    }
}
