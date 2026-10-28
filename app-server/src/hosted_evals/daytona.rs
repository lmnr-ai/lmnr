//! Minimal Daytona REST client: the calls hosted evals need to run one
//! background command in a fresh sandbox.

use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

use anyhow::{Result, bail};
use reqwest::{Client, RequestBuilder, Response};
use serde::{Deserialize, Serialize};
use serde_json::json;

const START_TIMEOUT: Duration = Duration::from_secs(120);
const POLL_INTERVAL: Duration = Duration::from_secs(1);

pub struct Daytona<'a> {
    http: &'a Client,
    api_url: String,
    api_key: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSandbox {
    pub env: HashMap<String, String>,
    pub labels: HashMap<String, String>,
    /// Minutes of inactivity before Daytona stops the sandbox; 0 disables it.
    pub auto_stop_interval: u32,
    /// Minutes after stopping before deletion; 0 deletes on stop.
    pub auto_delete_interval: i32,
    /// Wall-clock lifetime after which the sandbox is destroyed.
    pub ttl_minutes: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sandbox {
    pub id: String,
    state: String,
    toolbox_proxy_url: String,
    error_reason: Option<String>,
}

impl<'a> Daytona<'a> {
    pub fn new(http: &'a Client, api_url: String, api_key: String) -> Self {
        Self {
            http,
            api_url,
            api_key,
        }
    }

    pub async fn create_sandbox(&self, request: &CreateSandbox) -> Result<Sandbox> {
        let url = format!("{}/sandbox", self.api_url);
        Ok(self
            .send(self.http.post(url).json(request))
            .await?
            .json()
            .await?)
    }

    pub async fn delete_sandbox(&self, id: &str) -> Result<()> {
        let url = format!("{}/sandbox/{id}", self.api_url);
        self.send(self.http.delete(url)).await?;
        Ok(())
    }

    pub async fn wait_until_started(&self, id: &str) -> Result<Sandbox> {
        let url = format!("{}/sandbox/{id}", self.api_url);
        let deadline = Instant::now() + START_TIMEOUT;
        loop {
            let sandbox: Sandbox = self.send(self.http.get(&url)).await?.json().await?;
            match sandbox.state.as_str() {
                "started" => return Ok(sandbox),
                "error" | "build_failed" | "destroyed" | "destroying" => bail!(
                    "Daytona sandbox {id} is {}: {}",
                    sandbox.state,
                    sandbox.error_reason.unwrap_or_default()
                ),
                _ if Instant::now() >= deadline => {
                    bail!("Daytona sandbox {id} did not start within {START_TIMEOUT:?}")
                }
                _ => tokio::time::sleep(POLL_INTERVAL).await,
            }
        }
    }

    /// Starts `command` in a new shell session and returns without waiting for it.
    pub async fn spawn_command(
        &self,
        sandbox: &Sandbox,
        session_id: &str,
        command: &str,
    ) -> Result<()> {
        let session_url = format!(
            "{}/{}/process/session",
            sandbox.toolbox_proxy_url, sandbox.id
        );
        self.send(
            self.http
                .post(&session_url)
                .json(&json!({ "sessionId": session_id })),
        )
        .await?;
        self.send(
            self.http
                .post(format!("{session_url}/{session_id}/exec"))
                .json(&json!({ "command": command, "runAsync": true })),
        )
        .await?;
        Ok(())
    }

    async fn send(&self, request: RequestBuilder) -> Result<Response> {
        let response = request.bearer_auth(&self.api_key).send().await?;
        let status = response.status();
        if !status.is_success() {
            bail!(
                "Daytona API returned {status}: {}",
                response.text().await.unwrap_or_default()
            );
        }
        Ok(response)
    }
}
