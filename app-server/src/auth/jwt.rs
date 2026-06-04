use anyhow::{Context, Result, anyhow};
use jsonwebtoken::{Algorithm, Validation, decode, decode_header};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::auth::jwks;
use crate::db::project_api_keys::ProjectApiKey;

/// The shape Next.js mints. `iss`/`aud`/`exp`/`iat`/`sub` are validated by
/// `jsonwebtoken::Validation`; we keep them in the struct so deserialization
/// requires their presence.
#[derive(Debug, Deserialize, Serialize)]
pub struct DeviceFlowClaims {
    pub iss: String,
    pub aud: String,
    pub sub: String,
    pub email: String,
    pub project_id: Uuid,
    pub scope: String,
    #[serde(default)]
    pub client_id: String,
    pub jti: String,
    pub exp: usize,
    pub iat: usize,
}

pub const AUDIENCE: &str = "lmnr-app-server";

/// Quick syntactic check — three base64url segments and a JSON header with
/// `alg`. Real validation happens in `validate_jwt_as_project_api_key`.
pub fn looks_like_jwt(token: &str) -> bool {
    let segments = token.split('.').count();
    if segments != 3 {
        return false;
    }
    decode_header(token).is_ok()
}

fn issuer() -> String {
    std::env::var("FRONTEND_URL").unwrap_or_else(|_| "http://localhost:3010".to_string())
}

/// Validate the JWT against the cached JWKS, build a synthetic `ProjectApiKey`
/// so downstream routes see the same `ProjectApiKey` extension as the
/// API-key path. The synthetic `hash` is namespaced `jwt:<jti>` so it cannot
/// collide with a real `project_api_keys.hash`.
pub async fn validate_jwt_as_project_api_key(
    http: &reqwest::Client,
    token: &str,
) -> Result<ProjectApiKey> {
    let header = decode_header(token).context("decoding JWT header")?;
    let kid = header.kid.ok_or_else(|| anyhow!("JWT missing kid"))?;
    let key = jwks::get_decoding_key(http, &kid).await?;

    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_audience(&[AUDIENCE]);
    let iss = issuer();
    let iss_trimmed = iss.trim_end_matches('/');
    validation.set_issuer(&[iss_trimmed]);
    validation.set_required_spec_claims(&["exp", "iat", "iss", "aud", "sub"]);

    let data =
        decode::<DeviceFlowClaims>(token, &key, &validation).context("validating JWT")?;
    let claims = data.claims;

    let shorthand: String = claims.email.chars().take(8).collect();
    Ok(ProjectApiKey {
        project_id: claims.project_id,
        name: Some(format!("oauth:{}", claims.email)),
        hash: format!("jwt:{}", claims.jti),
        shorthand,
        is_ingest_only: false,
    })
}
