//! Calls to the Next.js app's `/api/internal` routes, for writes whose one implementation lives
//! there (dashboards, alerts). Callers authorize the user or agent first; Next.js only checks that
//! the request came from app-server (`frontend/lib/internal-auth.ts`).

use std::time::Duration;

use actix_web::{HttpResponse, ResponseError, http::StatusCode};
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

/// A Next.js 4xx reaches the caller as-is (`{ error }`, same status); anything else is logged and
/// answered with a generic 500.
impl ResponseError for NextApiError {
    fn status_code(&self) -> StatusCode {
        match self {
            Self::Status { status, .. } if *status < 500 => {
                StatusCode::from_u16(*status).unwrap_or(StatusCode::BAD_REQUEST)
            }
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn error_response(&self) -> HttpResponse {
        let status = self.status_code();
        if status.is_server_error() {
            log::error!("Frontend write failed: {self:?}");
            return HttpResponse::build(status).json(json!({ "error": "Internal server error" }));
        }
        HttpResponse::build(status).json(json!({ "error": self.to_string() }))
    }
}

/// `{exp, userId?}` encrypted with the `AEAD_SECRET_KEY` both services share, bound to the project
/// id so a token works for that project only. `userId` is the already-authorized caller, for
/// writes that act as them (alert `notifyMe`).
fn internal_token(project_id: Uuid, user_id: Option<Uuid>) -> anyhow::Result<String> {
    let exp = Utc::now().timestamp() + TOKEN_TTL_SECS;
    let mut claims = json!({ "exp": exp });
    if let Some(user_id) = user_id {
        claims["userId"] = json!(user_id);
    }
    let (nonce, ciphertext) =
        crypto::encrypt(&format!("internal-api:{project_id}"), &claims.to_string())?;
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
    send(http_client, method, project_id, None, path, body).await
}

/// [`call`] on behalf of `user_id`, whom the caller has already checked is a project member.
pub async fn call_as<T: DeserializeOwned>(
    http_client: &reqwest::Client,
    method: Method,
    project_id: Uuid,
    user_id: Uuid,
    path: &str,
    body: Option<Value>,
) -> Result<T, NextApiError> {
    send(http_client, method, project_id, Some(user_id), path, body).await
}

async fn send<T: DeserializeOwned>(
    http_client: &reqwest::Client,
    method: Method,
    project_id: Uuid,
    user_id: Option<Uuid>,
    path: &str,
    body: Option<Value>,
) -> Result<T, NextApiError> {
    let base = env::server::next_server_url().ok_or_else(|| {
        anyhow::anyhow!("NEXT_INTERNAL_URL or NEXT_PUBLIC_URL must be set to reach the frontend")
    })?;
    let url = format!("{base}/api/internal/projects/{project_id}/{path}");

    let mut request = http_client
        .request(method, &url)
        .header(TOKEN_HEADER, internal_token(project_id, user_id)?)
        .timeout(REQUEST_TIMEOUT);
    if let Some(body) = body {
        request = request.json(&body);
    }
    let response = request
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("frontend unreachable at {url}: {e}"))?;

    let status = response.status();
    // The frontend rejected app-server's own token (e.g. mismatched `AEAD_SECRET_KEY`); passing
    // the 401 on would read to the caller as their own login having expired.
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Err(anyhow::anyhow!("frontend rejected the internal token for {url}").into());
    }
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
