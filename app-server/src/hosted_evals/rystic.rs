//! Rystic service simulators (Slack, Linear, GitHub "twins") in trial sandboxes.
//! A simulator runs inside the trial and serves the app under test on
//! localhost. Only its download (`twin-release`) and its license check-ins
//! (`lease`) reach Rystic, through `/v1/hosted-evals/rystic/*`: each trial gets
//! a token of its own, shaped like a Rystic key, and the proxy swaps it for
//! `RYSTIC_API_KEY`, which never enters a sandbox.

use std::{collections::HashMap, time::Duration};

use anyhow::Result;
use bytes::Bytes;
use rand::{RngExt, distr::Alphanumeric};
use reqwest::header;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    cache::{
        Cache, CacheTrait,
        keys::{
            HOSTED_EVALS_RYSTIC_REGISTRATIONS_CACHE_KEY, HOSTED_EVALS_RYSTIC_SANDBOX_CACHE_KEY,
            HOSTED_EVALS_RYSTIC_TOKEN_CACHE_KEY,
        },
    },
    env,
    project_api_keys::hash_api_key,
};

/// Rystic's CLI accepts only `rys_` + 43 of `[A-Za-z0-9_-]` as a key; it checks
/// nothing else locally.
const TOKEN_PREFIX: &str = "rys_";
const TOKEN_LEN: usize = 43;
const RELEASE_URL: &str = "https://www.rystic.ai/api/twin-release";
const LEASE_URL: &str = "https://lease.rystic.ai/v1";
const UPSTREAM_TIMEOUT: Duration = Duration::from_secs(30);
/// Simulator starts one trial may make, so a token read by the code under test
/// can't run many simulators on Laminar's account.
const MAX_REGISTRATIONS_PER_TRIAL: i64 = 20;

/// The simulator's check-in calls, `POST <RYSTIC_LEASE_URL>/v1/<op>`.
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum LeaseOp {
    Register,
    Heartbeat,
    Close,
}

impl LeaseOp {
    pub fn parse(op: &str) -> Option<Self> {
        match op {
            "register" => Some(Self::Register),
            "heartbeat" => Some(Self::Heartbeat),
            "close" => Some(Self::Close),
            _ => None,
        }
    }

    fn name(self) -> &'static str {
        match self {
            Self::Register => "register",
            Self::Heartbeat => "heartbeat",
            Self::Close => "close",
        }
    }
}

pub enum Upstream {
    Release,
    Lease(LeaseOp),
}

impl Upstream {
    fn url(&self) -> String {
        match self {
            Self::Release => RELEASE_URL.to_string(),
            Self::Lease(op) => format!("{LEASE_URL}/{}", op.name()),
        }
    }
}

#[derive(Serialize, Deserialize)]
struct Grant {
    project_id: Uuid,
}

/// A trial's token (by hash) and the env that points its simulators at the proxy.
pub struct TrialAccess {
    pub token_hash: String,
    pub env: HashMap<String, String>,
}

/// What Rystic answered, passed back to the simulator as is.
pub struct UpstreamResponse {
    pub status: u16,
    pub content_type: Option<String>,
    pub body: Bytes,
}

pub fn api_key() -> Option<String> {
    env::optional_string(env::hosted_evals::RYSTIC_API_KEY)
}

fn ttl_seconds() -> u64 {
    u64::from(env::hosted_evals::MAX_RUN_MINUTES.get()) * 60
}

/// A new token for one trial of the project. `None` when Rystic isn't
/// configured, or the token couldn't be stored: the trial then runs without
/// simulators rather than failing to start.
pub async fn issue(cache: &Cache, project_id: &Uuid) -> Option<TrialAccess> {
    api_key()?;
    let token = format!(
        "{TOKEN_PREFIX}{}",
        rand::rng()
            .sample_iter(Alphanumeric)
            .take(TOKEN_LEN)
            .map(char::from)
            .collect::<String>()
    );
    let token_hash = hash_api_key(&token);
    let grant = Grant {
        project_id: *project_id,
    };
    if let Err(e) = cache
        .insert_with_ttl(&token_key(&token_hash), &grant, ttl_seconds())
        .await
    {
        log::warn!("Failed to store a Rystic trial token for project {project_id}: {e:?}");
        return None;
    }
    let base = format!(
        "{}/v1/hosted-evals/rystic",
        env::hosted_evals::LMNR_BASE_URL.get().trim_end_matches('/')
    );
    let env = HashMap::from([
        ("RYSTIC_TOKEN".to_string(), token),
        (
            "RYSTIC_RELEASE_ENDPOINT".to_string(),
            format!("{base}/twin-release"),
        ),
        ("RYSTIC_LEASE_URL".to_string(), format!("{base}/lease")),
    ]);
    Some(TrialAccess { token_hash, env })
}

/// Records which trial holds the token, so deleting the trial revokes it.
pub async fn bind(cache: &Cache, project_id: &Uuid, sandbox_id: &str, token_hash: &str) {
    if let Err(e) = cache
        .insert_with_ttl(
            &sandbox_key(project_id, sandbox_id),
            token_hash,
            ttl_seconds(),
        )
        .await
    {
        log::warn!("Failed to bind a Rystic token to sandbox {sandbox_id}: {e:?}");
    }
}

pub async fn revoke_token(cache: &Cache, token_hash: &str) {
    let _ = cache.remove(&token_key(token_hash)).await;
    let _ = cache.remove(&registrations_key(token_hash)).await;
}

/// Revokes the trial's token, if it has one. A simulator still running keeps
/// the lease it holds (about 2 h) but can't renew it.
pub async fn revoke_sandbox(cache: &Cache, project_id: &Uuid, sandbox_id: &str) {
    let key = sandbox_key(project_id, sandbox_id);
    if let Ok(Some(token_hash)) = cache.get::<String>(&key).await {
        revoke_token(cache, &token_hash).await;
        let _ = cache.remove(&key).await;
    }
}

/// The token's hash and project, for a live trial token sent as
/// `Authorization: Bearer <token>`.
pub async fn authorize(
    cache: &Cache,
    authorization: Option<&str>,
) -> Result<Option<(String, Uuid)>> {
    let Some(token) = authorization
        .and_then(|value| value.strip_prefix("Bearer "))
        .filter(|token| is_token(token))
    else {
        return Ok(None);
    };
    let token_hash = hash_api_key(token);
    let grant: Option<Grant> = cache.get(&token_key(&token_hash)).await?;
    Ok(grant.map(|grant| (token_hash, grant.project_id)))
}

/// Counts a simulator start; `false` once the trial is past its allowance.
pub async fn count_registration(cache: &Cache, token_hash: &str) -> Result<bool> {
    let key = registrations_key(token_hash);
    let count = cache.increment(&key, 1).await?;
    if count == 1 {
        cache.set_ttl(&key, ttl_seconds()).await?;
    }
    Ok(count <= MAX_REGISTRATIONS_PER_TRIAL)
}

/// Sends the simulator's request on to Rystic with Laminar's key.
pub async fn forward(
    client: &reqwest::Client,
    api_key: &str,
    upstream: &Upstream,
    content_type: Option<&str>,
    body: Bytes,
) -> Result<UpstreamResponse> {
    let mut request = client
        .post(upstream.url())
        .timeout(UPSTREAM_TIMEOUT)
        .bearer_auth(api_key)
        .body(body);
    if let Some(content_type) = content_type {
        request = request.header(header::CONTENT_TYPE, content_type);
    }
    let response = request.send().await?;
    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let body = response.bytes().await?;
    Ok(UpstreamResponse {
        status,
        content_type,
        body,
    })
}

fn is_token(token: &str) -> bool {
    token.strip_prefix(TOKEN_PREFIX).is_some_and(|rest| {
        rest.len() == TOKEN_LEN && rest.bytes().all(|b| b.is_ascii_alphanumeric())
    })
}

fn token_key(token_hash: &str) -> String {
    format!("{HOSTED_EVALS_RYSTIC_TOKEN_CACHE_KEY}:{token_hash}")
}

fn sandbox_key(project_id: &Uuid, sandbox_id: &str) -> String {
    format!("{HOSTED_EVALS_RYSTIC_SANDBOX_CACHE_KEY}:{project_id}:{sandbox_id}")
}

fn registrations_key(token_hash: &str) -> String {
    format!("{HOSTED_EVALS_RYSTIC_REGISTRATIONS_CACHE_KEY}:{token_hash}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokens_have_rystic_key_shape() {
        assert!(is_token(&format!("rys_{}", "a".repeat(43))));
        assert!(!is_token(&format!("rys_{}", "a".repeat(42))));
        assert!(!is_token(&format!("rys_{}-", "a".repeat(42))));
        assert!(!is_token(&format!("lmnr_{}", "a".repeat(43))));
    }

    #[test]
    fn lease_ops_map_to_rystic_paths() {
        assert_eq!(LeaseOp::parse("heartbeat"), Some(LeaseOp::Heartbeat));
        assert_eq!(LeaseOp::parse("renew"), None);
        assert_eq!(
            Upstream::Lease(LeaseOp::Register).url(),
            "https://lease.rystic.ai/v1/register"
        );
        assert_eq!(Upstream::Release.url(), RELEASE_URL);
    }
}
