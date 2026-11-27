//! Hosted evals: Harbor trials in provider sandboxes (Daytona today), driven
//! through app-server proxy routes so provider and registry credentials never
//! leave the app-server. A remote run adds one orchestrator sandbox that runs
//! `lmnr-cli eval orchestrate` with a short-lived project key. See
//! `docs/internal/hosted-evals.md`.

pub mod images;
pub mod provider;
pub mod registry;
pub mod rystic;
pub mod sandboxes;

use std::collections::HashMap;

use actix_web::http::header::HeaderMap;
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
/// it and the same CLI version reads it back in the orchestrator.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunRequest {
    pub upload_id: Uuid,
    pub cli_version: String,
    pub spec: Value,
    /// Variables whose values come in `x-lmnr-env-<name>` headers rather than the spec, set on the
    /// orchestrator's env (see [`secret_env`]).
    #[serde(default)]
    pub secret_env: Vec<String>,
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
    format!("{project_id}/{upload_id}.tar.gz")
}

pub fn index_key(project_id: &Uuid, upload_id: &Uuid) -> String {
    format!("{project_id}/{upload_id}.index.json")
}

/// One suite's Harbor job output (its trial dirs), packed like the run's archive.
/// `suite` must pass [`is_suite_name`].
pub fn job_archive_key(project_id: &Uuid, upload_id: &Uuid, suite: &str) -> String {
    format!("{project_id}/{upload_id}/jobs/{suite}.tar.gz")
}

pub fn job_index_key(project_id: &Uuid, upload_id: &Uuid, suite: &str) -> String {
    format!("{project_id}/{upload_id}/jobs/{suite}.index.json")
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
    /// The eval runner's module files outside the suite's `agent/` (shared
    /// code such as `_shared/support.py`), relative to the archive root. The
    /// trial Files view shows them in a `runner/` folder.
    #[serde(
        default,
        skip_serializing_if = "Vec::is_empty",
        deserialize_with = "deserialize_runner_modules"
    )]
    pub runner_modules: Vec<String>,
}

/// At most this many runner modules are kept.
const MAX_RUNNER_MODULES: usize = 500;

/// Keeps relative paths inside the archive (no leading `/`, no `..` or empty
/// segments, no backslashes), so a listing can only name archive files.
fn deserialize_runner_modules<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Vec<String>, D::Error> {
    let modules = Vec::<String>::deserialize(deserializer)?;
    Ok(modules
        .into_iter()
        .filter(|module| is_archive_relative_path(module))
        .take(MAX_RUNNER_MODULES)
        .collect())
}

fn is_archive_relative_path(path: &str) -> bool {
    !path.is_empty()
        && path.len() <= 1024
        && !path.contains('\\')
        && path
            .split('/')
            .all(|segment| !segment.is_empty() && segment != "." && segment != "..")
}

const MAX_SECRET_ENV: usize = 64;
/// What a secret variable reads as in a Laminar agent sandbox: its outbound proxy fills in the
/// headers that carry the real value, so a header still holding this one was never filled in.
const SANDBOX_PROXY_PLACEHOLDER: &str = "injected-by-laminar-sandbox-proxy";

/// `x-lmnr-env-<name>`, lowercase with `-` for `_`: proxies such as nginx drop header names with
/// underscores by default.
fn secret_env_header(name: &str) -> String {
    format!("x-lmnr-env-{}", name.to_ascii_lowercase().replace('_', "-"))
}

/// A run's `secretEnv`, read from the request's `x-lmnr-env-<name>` headers. They travel as headers
/// so an agent sandbox's outbound proxy can put in values the sandbox itself only holds as
/// placeholders. Harbor inherits the orchestrator's env, so the values reach `${VAR}`s in the
/// run's configs like spec values do. `Err` is the 400 message.
pub fn secret_env(
    headers: &HeaderMap,
    names: &[String],
) -> Result<HashMap<String, String>, String> {
    if names.len() > MAX_SECRET_ENV {
        return Err(format!("At most {MAX_SECRET_ENV} secretEnv variables"));
    }
    let mut env = HashMap::new();
    for name in names {
        let valid = !name.is_empty()
            && !name.starts_with(|c: char| c.is_ascii_digit())
            && name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_');
        if !valid {
            return Err(format!("Invalid secretEnv name {name:?}"));
        }
        // The orchestrator's own variables (run key, API URL, spec).
        if name.to_ascii_uppercase().starts_with("LMNR_") {
            return Err(format!("secretEnv can't set {name}"));
        }
        let header = secret_env_header(name);
        let value = match headers.get(&header).map(|v| v.to_str()) {
            Some(Ok(value)) => value,
            Some(Err(_)) => return Err(format!("{header} is not visible ASCII")),
            None => return Err(format!("secretEnv {name} has no {header} header")),
        };
        if value == SANDBOX_PROXY_PLACEHOLDER {
            return Err(format!(
                "{name} is still the sandbox proxy's placeholder: its outbound proxy has no \
                 rule filling in {header} for this Laminar URL"
            ));
        }
        env.insert(name.clone(), value.to_string());
    }
    Ok(env)
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
    secret_env: HashMap<String, String>,
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

    // `secret_env` names never start with `LMNR_`, so they can't replace these.
    let mut sandbox_env = secret_env;
    sandbox_env.extend([
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
    let spec = SandboxSpec {
        project_id: *project_id,
        role: SandboxRole::Orchestrator,
        image: SandboxImage::Default,
        env: sandbox_env,
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
    use actix_web::http::header::{HeaderName, HeaderValue};

    use super::*;

  
    #[test]
    fn hosted_metadata_keeps_only_archive_relative_runner_modules() {
        let metadata: super::HostedMetadata = serde_json::from_value(serde_json::json!({
            "uploadId": "00000000-0000-0000-0000-000000000001",
            "suitePath": "refunds",
            "runnerModules": ["_shared/support.py", "../x.py", "/abs.py", "a//b.py", "a\\b.py"],
        }))
        .unwrap();
        assert_eq!(metadata.runner_modules, vec!["_shared/support.py"]);

        // Older plugins send no runnerModules, and an empty list isn't stored.
        let metadata: super::HostedMetadata = serde_json::from_value(serde_json::json!({
            "uploadId": "00000000-0000-0000-0000-000000000001",
            "suitePath": "refunds",
        }))
        .unwrap();
        assert!(metadata.runner_modules.is_empty());
        assert_eq!(
            serde_json::to_value(&metadata).unwrap(),
            serde_json::json!({
                "uploadId": "00000000-0000-0000-0000-000000000001",
                "suitePath": "refunds",
            })
        );
    }

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

    fn headers(pairs: &[(&str, &str)]) -> HeaderMap {
        let mut map = HeaderMap::new();
        for (name, value) in pairs {
            map.insert(
                HeaderName::from_bytes(name.as_bytes()).unwrap(),
                HeaderValue::from_str(value).unwrap(),
            );
        }
        map
    }

    fn names(names: &[&str]) -> Vec<String> {
        names.iter().map(|n| n.to_string()).collect()
    }

    #[test]
    fn secret_env_reads_each_named_header() {
        let map = headers(&[
            ("x-lmnr-env-anthropic-api-key", "sk-ant-real"),
            ("x-lmnr-env-custom-llm-ab12-header-0", "h0"),
            ("x-lmnr-env-unrequested", "ignored"),
        ]);
        let env = secret_env(
            &map,
            &names(&["ANTHROPIC_API_KEY", "CUSTOM_LLM_AB12_HEADER_0"]),
        )
        .unwrap();
        assert_eq!(
            env,
            HashMap::from([
                ("ANTHROPIC_API_KEY".to_string(), "sk-ant-real".to_string()),
                ("CUSTOM_LLM_AB12_HEADER_0".to_string(), "h0".to_string()),
            ])
        );
        assert!(secret_env(&map, &[]).unwrap().is_empty());
    }

    #[test]
    fn secret_env_rejects_missing_placeholder_and_reserved() {
        let map = headers(&[
            ("x-lmnr-env-openai-api-key", SANDBOX_PROXY_PLACEHOLDER),
            ("x-lmnr-env-lmnr-project-api-key", "key"),
        ]);
        for bad in [
            "OPENAI_API_KEY",
            "GEMINI_API_KEY",
            "LMNR_PROJECT_API_KEY",
            "lmnr_base_url",
            "1KEY",
            "A-B",
            "",
        ] {
            assert!(secret_env(&map, &names(&[bad])).is_err(), "{bad}");
        }
        let many: Vec<String> = (0..=MAX_SECRET_ENV).map(|i| format!("K{i}")).collect();
        assert!(secret_env(&map, &many).is_err());
    }

    #[test]
    fn shell_quote_survives_single_quotes() {
        assert_eq!(shell_quote("echo 'hi'"), r"'echo '\''hi'\'''");
    }
}
