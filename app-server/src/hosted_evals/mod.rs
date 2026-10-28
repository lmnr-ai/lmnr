//! Hosted evals: runs a project's Harbor `evals/` folder from a Daytona
//! orchestrator sandbox, with trials on Modal or Daytona. See
//! `docs/internal/hosted-evals.md`.

pub mod daytona;

use std::{collections::HashMap, num::NonZeroU32};

use anyhow::{Result, anyhow};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{
    db::{self, DB},
    env, project_api_keys,
};
use daytona::{CreateSandbox, Daytona};

/// Name prefix of the per-run project API keys. The frontend hides keys with it
/// from the project's key list (`frontend/lib/actions/project-api-keys`).
pub const RUN_KEY_NAME_PREFIX: &str = "lmnr-internal-evals-";
const PROJECT_LABEL: &str = "lmnr-project-id";
const MODAL_APP_NAME: &str = "lmnr-hosted-evals";

const ORCHESTRATOR_SCRIPT: &str = include_str!("orchestrator.py");
// `uv` resolves the environment on every run, so both packages are pinned. The
// session shell is zsh, hence the quoted extra. The sandbox deletes itself
// however the run ends, so a failed bootstrap doesn't idle until its TTL.
const ORCHESTRATOR_COMMAND: &str = concat!(
    r#"uv run --no-project --python 3.13 --with 'harbor[daytona,modal]==0.25.0' --with lmnr==0.8.3 python -c "$LMNR_EVAL_SCRIPT"; "#,
    r#"curl -fsS -X DELETE -H "Authorization: Bearer $DAYTONA_API_KEY" "$DAYTONA_API_URL/sandbox/$DAYTONA_SANDBOX_ID""#,
);
const SESSION_ID: &str = "eval";

/// Run parameters a caller can override. Everything defaults to the suite's `harbor.yaml`.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunOptions {
    /// Suites (archive-root directories with a `harbor.yaml`) to run. Empty runs all.
    #[serde(default)]
    pub datasets: Vec<String>,
    /// Task name globs to include. Empty runs every task.
    #[serde(default)]
    pub tasks: Vec<String>,
    pub n_attempts: Option<NonZeroU32>,
    pub n_concurrent: Option<NonZeroU32>,
    pub model: Option<String>,
    /// Agent env vars (e.g. LLM API keys), merged over each agent's `env`.
    #[serde(default)]
    pub env: HashMap<String, String>,
}

/// Where Harbor runs the trials (`HOSTED_EVALS_TRIAL_ENVIRONMENT`).
#[derive(Clone, Copy)]
pub enum TrialEnvironment {
    Modal,
    Daytona,
}

impl TrialEnvironment {
    /// The configured provider, or `None` if it's unknown or its credentials are missing.
    pub fn configured() -> Option<Self> {
        match env::hosted_evals::TRIAL_ENVIRONMENT.get().as_str() {
            "modal" => [
                env::hosted_evals::MODAL_TOKEN_ID,
                env::hosted_evals::MODAL_TOKEN_SECRET,
            ]
            .iter()
            .all(|name| std::env::var(name).is_ok_and(|v| !v.is_empty()))
            .then_some(Self::Modal),
            "daytona" => Some(Self::Daytona),
            _ => None,
        }
    }

    /// The job config's `environment` overrides. They replace the suite's `kwargs`,
    /// which could otherwise name resources in our provider account (e.g. Modal secrets).
    fn job_environment(self, project_id: &Uuid, max_run_minutes: u32) -> Value {
        match self {
            // Harbor's default timeout is 24 h; trials orphaned by a killed
            // orchestrator die with the run instead.
            Self::Modal => json!({
                "type": "modal",
                "kwargs": {
                    "app_name": MODAL_APP_NAME,
                    "sandbox_timeout_secs": u64::from(max_run_minutes) * 60,
                    "labels": { PROJECT_LABEL: project_id },
                },
            }),
            Self::Daytona => json!({ "type": "daytona", "kwargs": {} }),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RunParams<'a> {
    archive_url: &'a str,
    trial_environment: Value,
    #[serde(flatten)]
    options: &'a RunOptions,
}

pub fn archive_key(project_id: &Uuid, upload_id: &Uuid) -> String {
    format!("hosted-evals/{project_id}/{upload_id}.tar.gz")
}

/// Mints the run's project API key, creates the orchestrator sandbox and starts
/// the run in it. Returns the sandbox id.
pub async fn start_run(
    http: &reqwest::Client,
    db: &DB,
    project_id: &Uuid,
    archive_url: &str,
    options: &RunOptions,
) -> Result<String> {
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

    let result = launch_orchestrator(
        http,
        project_id,
        &run_key.value,
        max_run_minutes,
        archive_url,
        options,
    )
    .await;
    if result.is_err()
        && let Err(e) = db::project_api_keys::delete_api_key_by_hash(&db.pool, &run_key.hash).await
    {
        log::error!("Failed to delete hosted eval run key: {e:?}");
    }
    result
}

async fn launch_orchestrator(
    http: &reqwest::Client,
    project_id: &Uuid,
    project_api_key: &str,
    max_run_minutes: u32,
    archive_url: &str,
    options: &RunOptions,
) -> Result<String> {
    let trial_environment = TrialEnvironment::configured()
        .ok_or_else(|| anyhow!("No usable hosted evals trial environment configured"))?;
    let api_key = std::env::var(env::hosted_evals::DAYTONA_API_KEY)?;
    let api_url = env::hosted_evals::DAYTONA_API_URL.get();
    let daytona = Daytona::new(http, api_url.clone(), api_key.clone());

    let params = serde_json::to_string(&RunParams {
        archive_url,
        trial_environment: trial_environment.job_environment(project_id, max_run_minutes),
        options,
    })?;
    let mut sandbox_env = HashMap::from([
        // The plugin reports to the project that started the run.
        (
            "LMNR_PROJECT_API_KEY".to_string(),
            project_api_key.to_string(),
        ),
        ("DAYTONA_API_KEY".to_string(), api_key),
        ("DAYTONA_API_URL".to_string(), api_url),
        ("LMNR_EVAL_RUN".to_string(), params),
        (
            "LMNR_EVAL_SCRIPT".to_string(),
            ORCHESTRATOR_SCRIPT.to_string(),
        ),
    ]);
    if let TrialEnvironment::Modal = trial_environment {
        for name in [
            env::hosted_evals::MODAL_TOKEN_ID,
            env::hosted_evals::MODAL_TOKEN_SECRET,
        ] {
            sandbox_env.insert(name.to_string(), std::env::var(name)?);
        }
    }
    if let Some(base_url) = std::env::var(env::hosted_evals::LMNR_BASE_URL)
        .ok()
        .filter(|url| !url.is_empty())
    {
        sandbox_env.insert("LMNR_BASE_URL".to_string(), base_url);
    }

    let sandbox = daytona
        .create_sandbox(&CreateSandbox {
            env: sandbox_env,
            labels: HashMap::from([(PROJECT_LABEL.to_string(), project_id.to_string())]),
            // A running command doesn't count as activity, so auto-stop would kill long runs.
            auto_stop_interval: 0,
            auto_delete_interval: 0,
            ttl_minutes: max_run_minutes,
        })
        .await?;

    if let Err(e) = start_orchestrator(&daytona, &sandbox.id).await {
        if let Err(delete_err) = daytona.delete_sandbox(&sandbox.id).await {
            log::error!(
                "Failed to delete hosted eval sandbox {}: {delete_err:?}",
                sandbox.id
            );
        }
        return Err(e);
    }
    Ok(sandbox.id)
}

async fn start_orchestrator(daytona: &Daytona<'_>, sandbox_id: &str) -> Result<()> {
    let sandbox = daytona.wait_until_started(sandbox_id).await?;
    daytona
        .spawn_command(&sandbox, SESSION_ID, ORCHESTRATOR_COMMAND)
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    // orchestrator.py indexes these keys directly, so they must always be present.
    #[test]
    fn run_params_carry_every_key_the_orchestrator_reads() {
        let options: RunOptions = serde_json::from_str(r#"{"nAttempts": 2}"#).unwrap();
        let params = serde_json::to_value(RunParams {
            archive_url: "https://example.com/evals.tar.gz",
            trial_environment: TrialEnvironment::Modal.job_environment(&Uuid::nil(), 60),
            options: &options,
        })
        .unwrap();
        for key in [
            "archiveUrl",
            "trialEnvironment",
            "datasets",
            "tasks",
            "nAttempts",
            "nConcurrent",
            "model",
            "env",
        ] {
            assert!(params.get(key).is_some(), "missing {key}");
        }
        assert_eq!(params["nAttempts"], 2);
        assert!(params["nConcurrent"].is_null());
        assert_eq!(params["trialEnvironment"]["type"], "modal");
        assert_eq!(
            params["trialEnvironment"]["kwargs"]["sandbox_timeout_secs"],
            3600
        );
    }

    #[test]
    fn zero_attempts_is_rejected() {
        assert!(serde_json::from_str::<RunOptions>(r#"{"nAttempts": 0}"#).is_err());
    }
}
