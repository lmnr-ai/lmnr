//! Authentication for `/v1/mcp`: a project API key, or an OAuth user access token.
//!
//! The frontend (Better Auth `@better-auth/mcp`) is the OAuth authorization server; this server
//! is the protected resource. MCP clients (Claude Code, Cursor, ...) find the authorization server
//! through the RFC 9728 metadata served by [`protected_resource_metadata`], which the 401
//! challenge from [`mcp_auth`] points at. Access tokens are RFC 9068 JWTs signed with the
//! frontend's JWKS, the same key set as the CLI tokens (`cli_user`). The two token kinds stay
//! apart by claims: access tokens carry `typ: at+jwt`, `aud` = our resource and `azp`, which CLI
//! tokens lack; CLI tokens carry `userId`, which access tokens lack.

use std::sync::Arc;

use actix_web::{
    Error, HttpMessage, HttpResponse,
    body::MessageBody,
    dev::{ServiceRequest, ServiceResponse},
    http::header,
    middleware::Next,
    web,
};
use jsonwebtoken::{Algorithm, Validation, decode, decode_header};
use serde::Deserialize;
use serde_json::json;
use url::Url;
use uuid::Uuid;

use crate::{
    api::utils::get_api_key_from_raw_value,
    auth::cli_user::{JwksCache, VerifyError},
    cache::Cache,
    db::{DB, project_api_keys::ProjectApiKey},
    env,
};

/// RFC 9068 JWT access-token type. RFC 9068 allows the `application/` prefix too.
const ACCESS_TOKEN_TYPES: [&str; 2] = ["at+jwt", "application/at+jwt"];

/// Scopes MCP clients request; `offline_access` gets them a refresh token.
const SCOPES: [&str; 4] = ["openid", "profile", "email", "offline_access"];

const PROTECTED_RESOURCE_METADATA_PATH: &str = "/.well-known/oauth-protected-resource";

/// Where MCP OAuth tokens come from and who they are for. Absent (`None` in app data) when
/// `MCP_RESOURCE_URL` is unset, which leaves `/v1/mcp` API-key-only.
#[derive(Clone, Debug)]
pub struct McpOAuthConfig {
    resource: String,
    issuer: String,
    resource_metadata_url: String,
}

impl McpOAuthConfig {
    pub fn from_env() -> Option<Self> {
        let resource = std::env::var(env::server::MCP_RESOURCE_URL)
            .ok()
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())?;
        let issuer = match std::env::var(env::server::MCP_AUTHORIZATION_SERVER_URL)
            .ok()
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
        {
            Some(issuer) => issuer,
            None => default_issuer(),
        };
        match Self::new(&resource, &issuer) {
            Ok(config) => {
                log::info!("MCP OAuth enabled: resource {resource}, authorization server {issuer}");
                Some(config)
            }
            Err(e) => {
                log::error!("Invalid MCP OAuth config, /v1/mcp stays API-key-only: {e}");
                None
            }
        }
    }

    fn new(resource: &str, issuer: &str) -> anyhow::Result<Self> {
        let resource_url = Url::parse(resource)?;
        Url::parse(issuer)?;
        // RFC 9728 §3.1: insert the well-known segment between the origin and the resource path.
        let resource_metadata_url = format!(
            "{}{PROTECTED_RESOURCE_METADATA_PATH}{}",
            resource_url.origin().ascii_serialization(),
            resource_url.path().trim_end_matches('/'),
        );
        Ok(Self {
            resource: resource.to_string(),
            issuer: issuer.trim_end_matches('/').to_string(),
            resource_metadata_url,
        })
    }

    fn challenge(&self, invalid_token: bool) -> String {
        let error = if invalid_token {
            r#"error="invalid_token", "#
        } else {
            ""
        };
        format!(
            r#"Bearer {error}resource_metadata="{}", scope="{}""#,
            self.resource_metadata_url,
            SCOPES.join(" ")
        )
    }
}

/// Better Auth's issuer is its base URL, which the frontend pins to the public origin.
fn default_issuer() -> String {
    let frontend = crate::utils::frontend_url_with_default("https://laminar.sh");
    let origin = Url::parse(&frontend)
        .map(|url| url.origin().ascii_serialization())
        .unwrap_or(frontend);
    format!("{origin}/api/auth")
}

/// A user authenticated by an OAuth access token. User tokens carry no project: tools pick
/// one per call and check membership (see `api::v1::mcp`).
#[derive(Clone, Debug)]
pub struct McpUser {
    pub user_id: Uuid,
}

/// Who is calling `/v1/mcp`, inserted into request extensions by [`mcp_auth`].
#[derive(Clone)]
pub enum McpCaller {
    ApiKey(ProjectApiKey),
    User(McpUser),
}

#[derive(Debug, Deserialize)]
struct AccessTokenClaims {
    sub: Uuid,
    // Required so only tokens issued to an OAuth client pass; not read.
    #[allow(dead_code)]
    azp: String,
}

#[derive(Debug, thiserror::Error)]
enum AccessTokenError {
    #[error(transparent)]
    Verify(#[from] VerifyError),
    #[error("not an access token (typ {0:?})")]
    WrongType(Option<String>),
}

impl From<jsonwebtoken::errors::Error> for AccessTokenError {
    fn from(e: jsonwebtoken::errors::Error) -> Self {
        Self::Verify(VerifyError::Invalid(e))
    }
}

/// Verify an MCP access token: EdDSA signature against the JWKS, `typ`, `iss`, `aud`, `exp`.
/// `sub` must be a user id; a client-credentials token (`sub` = client id) fails to parse.
async fn verify_access_token(
    token: &str,
    jwks: &JwksCache,
    config: &McpOAuthConfig,
) -> Result<McpUser, AccessTokenError> {
    let header = decode_header(token)?;
    if !header
        .typ
        .as_deref()
        .is_some_and(|typ| ACCESS_TOKEN_TYPES.contains(&typ.to_ascii_lowercase().as_str()))
    {
        return Err(AccessTokenError::WrongType(header.typ));
    }
    let kid = header.kid.ok_or(VerifyError::MissingKid)?;
    let key = jwks.decoding_key_for_kid(&kid).await?;

    let mut validation = Validation::new(Algorithm::EdDSA);
    validation.set_required_spec_claims(&["exp", "iss", "aud", "sub"]);
    validation.set_issuer(&[&config.issuer]);
    validation.set_audience(&[&config.resource]);

    let claims = decode::<AccessTokenClaims>(token, &key, &validation)?.claims;
    Ok(McpUser {
        user_id: claims.sub,
    })
}

/// Project API keys are 64 alphanumerics; anything shaped like a JWT is an OAuth token.
fn is_jwt(token: &str) -> bool {
    token.split('.').count() == 3
}

fn bearer_token(req: &ServiceRequest) -> Option<String> {
    let value = req.headers().get(header::AUTHORIZATION)?.to_str().ok()?;
    let (scheme, token) = value.split_once(' ')?;
    scheme
        .eq_ignore_ascii_case("bearer")
        .then(|| token.trim().to_string())
        .filter(|token| !token.is_empty())
}

async fn authenticate(req: &ServiceRequest, token: &str) -> Result<McpCaller, String> {
    let db = req
        .app_data::<web::Data<DB>>()
        .ok_or("db unavailable")?
        .clone()
        .into_inner();
    let cache = req
        .app_data::<web::Data<Cache>>()
        .ok_or("cache unavailable")?
        .clone()
        .into_inner();

    if !is_jwt(token) {
        let key = get_api_key_from_raw_value(&db.pool, cache, token.to_string())
            .await
            .map_err(|e| format!("invalid project API key: {e}"))?;
        if key.is_ingest_only {
            return Err("ingest-only project API keys cannot use MCP".to_string());
        }
        return Ok(McpCaller::ApiKey(key));
    }

    let config = req
        .app_data::<web::Data<Option<McpOAuthConfig>>>()
        .and_then(|config| config.as_ref().as_ref())
        .ok_or("OAuth is not enabled on this server")?;
    let jwks = req
        .app_data::<web::Data<Arc<JwksCache>>>()
        .ok_or("JWKS unavailable")?;
    verify_access_token(token, jwks, config)
        .await
        .map(McpCaller::User)
        .map_err(|e| format!("invalid access token: {e}"))
}

/// Auth middleware for the `/v1/mcp` scope. A 401 carries the RFC 9728 challenge so MCP clients
/// start the OAuth flow; a missing token gets it without `error` (RFC 6750 §3.1).
pub async fn mcp_auth(
    req: ServiceRequest,
    next: Next<impl MessageBody>,
) -> Result<ServiceResponse<impl MessageBody>, Error> {
    let token = bearer_token(&req);
    let result = match &token {
        Some(token) => authenticate(&req, token).await,
        None => Err("missing bearer token".to_string()),
    };
    match result {
        Ok(caller) => {
            if let McpCaller::ApiKey(key) = &caller {
                // Read by the `ProjectApiKey` extractor and the `/v1` audit middleware.
                req.extensions_mut().insert(key.clone());
            }
            req.extensions_mut().insert(caller);
            next.call(req).await
        }
        Err(reason) => {
            log::warn!("MCP auth failed: {reason}");
            let config = req
                .app_data::<web::Data<Option<McpOAuthConfig>>>()
                .and_then(|config| config.as_ref().clone());
            let challenge = match config {
                Some(config) => config.challenge(token.is_some()),
                None => "Bearer".to_string(),
            };
            let response = HttpResponse::Unauthorized()
                .insert_header((header::WWW_AUTHENTICATE, challenge))
                .json(json!({ "error": reason }));
            Err(actix_web::error::InternalError::from_response("", response).into())
        }
    }
}

/// `GET /.well-known/oauth-protected-resource[/v1/mcp]` — RFC 9728 metadata naming the frontend
/// as the authorization server. 404 when OAuth is off.
pub async fn protected_resource_metadata(
    config: web::Data<Option<McpOAuthConfig>>,
) -> HttpResponse {
    match config.as_ref() {
        Some(config) => HttpResponse::Ok()
            .insert_header((header::ACCESS_CONTROL_ALLOW_ORIGIN, "*"))
            .json(json!({
                "resource": config.resource,
                "authorization_servers": [config.issuer],
                "bearer_methods_supported": ["header"],
                "scopes_supported": SCOPES,
                "resource_name": "Laminar",
            })),
        None => HttpResponse::NotFound().finish(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::cli_user::tests::{cache_serving, future_exp, make_key};
    use jsonwebtoken::{EncodingKey, Header, encode};

    const RESOURCE: &str = "https://api.example.com/v1/mcp";
    const ISSUER: &str = "https://app.example.com/api/auth";

    fn config() -> McpOAuthConfig {
        McpOAuthConfig::new(RESOURCE, ISSUER).unwrap()
    }

    fn sign(
        encoding: &EncodingKey,
        kid: &str,
        typ: Option<&str>,
        claims: serde_json::Value,
    ) -> String {
        let mut header = Header::new(Algorithm::EdDSA);
        header.kid = Some(kid.to_string());
        header.typ = typ.map(str::to_string);
        encode(&header, &claims, encoding).unwrap()
    }

    fn access_claims(user_id: Uuid) -> serde_json::Value {
        json!({
            "sub": user_id.to_string(),
            "aud": RESOURCE,
            "iss": ISSUER,
            "azp": "client-1",
            "client_id": "client-1",
            "scope": "openid offline_access",
            "exp": future_exp(),
        })
    }

    #[test]
    fn resource_metadata_url_inserts_well_known_before_path() {
        assert_eq!(
            config().resource_metadata_url,
            "https://api.example.com/.well-known/oauth-protected-resource/v1/mcp"
        );
        let local = McpOAuthConfig::new("http://localhost:8000/v1/mcp/", ISSUER).unwrap();
        assert_eq!(
            local.resource_metadata_url,
            "http://localhost:8000/.well-known/oauth-protected-resource/v1/mcp"
        );
    }

    #[test]
    fn challenge_names_metadata_and_flags_invalid_tokens() {
        let missing = config().challenge(false);
        assert!(missing.starts_with("Bearer resource_metadata=\"https://api.example.com/"));
        assert!(!missing.contains("invalid_token"));
        assert!(
            config()
                .challenge(true)
                .contains(r#"error="invalid_token""#)
        );
    }

    #[test]
    fn api_keys_are_not_jwts() {
        assert!(!is_jwt(&"a".repeat(64)));
        assert!(is_jwt("x.y.z"));
    }

    #[tokio::test]
    async fn valid_access_token_returns_user() {
        let (encoding, jwk) = make_key("k1");
        let (_server, jwks) = cache_serving(vec![jwk]).await;
        let user_id = Uuid::new_v4();
        let token = sign(&encoding, "k1", Some("at+jwt"), access_claims(user_id));

        let user = verify_access_token(&token, &jwks, &config()).await.unwrap();
        assert_eq!(user.user_id, user_id);
    }

    #[tokio::test]
    async fn token_for_another_audience_is_rejected() {
        let (encoding, jwk) = make_key("k1");
        let (_server, jwks) = cache_serving(vec![jwk]).await;
        let mut claims = access_claims(Uuid::new_v4());
        claims["aud"] = json!("https://other.example.com/mcp");
        let token = sign(&encoding, "k1", Some("at+jwt"), claims);

        assert!(verify_access_token(&token, &jwks, &config()).await.is_err());
    }

    #[tokio::test]
    async fn token_from_another_issuer_is_rejected() {
        let (encoding, jwk) = make_key("k1");
        let (_server, jwks) = cache_serving(vec![jwk]).await;
        let mut claims = access_claims(Uuid::new_v4());
        claims["iss"] = json!("https://evil.example.com");
        let token = sign(&encoding, "k1", Some("at+jwt"), claims);

        assert!(verify_access_token(&token, &jwks, &config()).await.is_err());
    }

    /// A CLI token (`/api/auth/token`) is signed with the same keys but is not an access token.
    #[tokio::test]
    async fn cli_session_jwt_is_rejected() {
        let (encoding, jwk) = make_key("k1");
        let (_server, jwks) = cache_serving(vec![jwk]).await;
        let user_id = Uuid::new_v4();
        let cli_claims = json!({
            "userId": user_id.to_string(),
            "sub": user_id.to_string(),
            "aud": "https://app.example.com",
            "iss": "https://app.example.com",
            "exp": future_exp(),
        });
        let token = sign(&encoding, "k1", Some("JWT"), cli_claims.clone());
        assert!(matches!(
            verify_access_token(&token, &jwks, &config()).await,
            Err(AccessTokenError::WrongType(_))
        ));
        // Even relabelled as an access token, its audience is not ours.
        let token = sign(&encoding, "k1", Some("at+jwt"), cli_claims);
        assert!(verify_access_token(&token, &jwks, &config()).await.is_err());
    }

    /// A client-credentials token has no user: `sub` is the client id.
    #[tokio::test]
    async fn token_without_client_is_rejected() {
        let (encoding, jwk) = make_key("k1");
        let (_server, jwks) = cache_serving(vec![jwk]).await;
        let mut claims = access_claims(Uuid::new_v4());
        claims.as_object_mut().unwrap().remove("azp");
        let token = sign(&encoding, "k1", Some("at+jwt"), claims);

        assert!(verify_access_token(&token, &jwks, &config()).await.is_err());
    }

    #[tokio::test]
    async fn token_without_user_subject_is_rejected() {
        let (encoding, jwk) = make_key("k1");
        let (_server, jwks) = cache_serving(vec![jwk]).await;
        let mut claims = access_claims(Uuid::new_v4());
        claims["sub"] = json!("client-1");
        let token = sign(&encoding, "k1", Some("at+jwt"), claims);

        assert!(verify_access_token(&token, &jwks, &config()).await.is_err());
    }
}
