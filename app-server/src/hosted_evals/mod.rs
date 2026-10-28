//! Hosted evals: runs a project's Harbor `evals/` folder in a Daytona
//! orchestrator sandbox. See `docs/internal/hosted-evals.md`.

pub mod daytona;

use std::{collections::HashMap, num::NonZeroU32};

use anyhow::Result;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::env;
use daytona::{CreateSandbox, Daytona};

const ORCHESTRATOR_SCRIPT: &str = include_str!("orchestrator.py");
// `uv` resolves the environment on every run, so both packages are pinned. The
// session shell is zsh, hence the quoted extra. The sandbox deletes itself
// however the run ends, so a failed bootstrap doesn't idle until its TTL.
const ORCHESTRATOR_COMMAND: &str = concat!(
    r#"uv run --no-project --python 3.13 --with 'harbor[daytona]==0.25.0' --with lmnr==0.8.3 python -c "$LMNR_EVAL_SCRIPT"; "#,
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RunParams<'a> {
    archive_url: &'a str,
    #[serde(flatten)]
    options: &'a RunOptions,
}

pub fn archive_key(project_id: &Uuid, upload_id: &Uuid) -> String {
    format!("hosted-evals/{project_id}/{upload_id}.tar.gz")
}

/// Creates the orchestrator sandbox and starts the run in it. Returns the sandbox id.
pub async fn start_run(
    http: &reqwest::Client,
    project_id: &Uuid,
    project_api_key: &str,
    archive_url: &str,
    options: &RunOptions,
) -> Result<String> {
    let api_key = std::env::var(env::hosted_evals::DAYTONA_API_KEY)?;
    let api_url = env::hosted_evals::DAYTONA_API_URL.get();
    let daytona = Daytona::new(http, api_url.clone(), api_key.clone());

    let params = serde_json::to_string(&RunParams {
        archive_url,
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
    if let Some(base_url) = std::env::var(env::hosted_evals::LMNR_BASE_URL)
        .ok()
        .filter(|url| !url.is_empty())
    {
        sandbox_env.insert("LMNR_BASE_URL".to_string(), base_url);
    }

    let sandbox = daytona
        .create_sandbox(&CreateSandbox {
            env: sandbox_env,
            labels: HashMap::from([("lmnr-project-id".to_string(), project_id.to_string())]),
            // A running command doesn't count as activity, so auto-stop would kill long runs.
            auto_stop_interval: 0,
            auto_delete_interval: 0,
            ttl_minutes: env::hosted_evals::MAX_RUN_MINUTES.get(),
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
            options: &options,
        })
        .unwrap();
        for key in [
            "archiveUrl",
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
    }

    #[test]
    fn zero_attempts_is_rejected() {
        assert!(serde_json::from_str::<RunOptions>(r#"{"nAttempts": 0}"#).is_err());
    }
}
