//! Calls to the Next.js app's `/api/internal` routes, for writes whose one implementation lives
//! there (dashboards). Callers authorize the user or agent first; Next.js only checks that the
//! request came from app-server (`frontend/lib/internal-auth.ts`).

use std::time::Duration;

use chrono::Utc;
use reqwest::Method;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::data_plane::crypto;
use crate::env;

const TOKEN_HEADER: &str = "x-laminar-internal-token";
const TOKEN_TTL_SECS: i64 = 60;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, thiserror::Error)]
pub enum NextApiError {
    /// Next.js answered with a non-2xx status and its `{ error }` message.
    #[error("{message}")]
    Status { status: u16, message: String },
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

/// `{exp}` encrypted with the `AEAD_SECRET_KEY` both services share, bound to the project id so a
/// token works for that project only.
fn internal_token(project_id: Uuid) -> anyhow::Result<String> {
    let exp = Utc::now().timestamp() + TOKEN_TTL_SECS;
    let (nonce, ciphertext) = crypto::encrypt(
        &format!("internal-api:{project_id}"),
        &json!({ "exp": exp }).to_string(),
    )?;
    Ok(format!("{nonce}.{ciphertext}"))
}

/// Sends `body` to `{next}/api/internal/projects/{project_id}/{path}` and decodes the JSON reply.
pub async fn call<T: DeserializeOwned>(
    http_client: &reqwest::Client,
    method: Method,
    project_id: Uuid,
    path: &str,
    body: Option<Value>,
) -> Result<T, NextApiError> {
    let base = env::server::next_server_url().ok_or_else(|| {
        anyhow::anyhow!("NEXT_INTERNAL_URL or NEXT_PUBLIC_URL must be set to reach the frontend")
    })?;
    let url = format!("{base}/api/internal/projects/{project_id}/{path}");

    let mut request = http_client
        .request(method, &url)
        .header(TOKEN_HEADER, internal_token(project_id)?)
        .timeout(REQUEST_TIMEOUT);
    if let Some(body) = body {
        request = request.json(&body);
    }
    let response = request
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("frontend unreachable at {url}: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        let body: Option<Value> = response.json().await.ok();
        let message = body
            .as_ref()
            .and_then(|b| b.get("error"))
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| format!("frontend responded with {status}"));
        return Err(NextApiError::Status {
            status: status.as_u16(),
            message,
        });
    }
    Ok(response
        .json()
        .await
        .map_err(|e| anyhow::anyhow!("unexpected frontend response from {url}: {e}"))?)
}
