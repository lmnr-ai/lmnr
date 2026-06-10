//! CLI user-token auth for the `/v1/cli/*` surface.
//!
//! Split into authN (middleware) and authZ (extractor):
//!   - `cli_auth_validator` (bearer middleware) verifies the BetterAuth EdDSA
//!     access JWT against the frontend's JWKS and inserts a `CliUserAuth` into
//!     request extensions. This is the single auth middleware for the whole
//!     `/v1/cli` scope — it proves *identity* only.
//!   - `CliUserAuth` (extractor) surfaces that identity to discovery handlers
//!     (e.g. `GET /v1/cli/projects`) that have no project to authorize against.
//!   - `CliProjectAuth` (extractor) reads `CliUserAuth` back out of extensions,
//!     reads the `x-lmnr-project-id` header, and authorizes workspace
//!     membership. Handlers that take it are guaranteed a project the user can
//!     access — the authZ check can't be forgotten because it's the type.

use std::future::{Future, Ready, ready};
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;

use actix_web::dev::{Payload, ServiceRequest};
use actix_web::{Error, FromRequest, HttpMessage, HttpRequest, web};
use actix_web_httpauth::extractors::AuthenticationError;
use actix_web_httpauth::extractors::bearer::{BearerAuth, Config};
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header};
use jwks_client_rs::source::WebSource;
use jwks_client_rs::{JsonWebKey, JwksClient};
use serde::Deserialize;
use sqlx::PgPool;
use url::Url;
use uuid::Uuid;

use crate::cache::{Cache, CacheTrait, keys::PROJECT_MEMBERSHIP_CACHE_KEY};
use crate::db::DB;

/// Header carrying the target project id for the CLI user surface. The project
/// is never in the path; the user picks it per request.
const PROJECT_ID_HEADER: &str = "x-lmnr-project-id";

/// Membership-cache TTL. Short by design: this is the revocation window —
/// removing a user from a workspace takes effect within this many seconds,
/// NOT bounded by the 15m JWT lifetime.
const PROJECT_MEMBERSHIP_TTL_SECONDS: u64 = 60;

/// JWKS cache TTL. `jwks_client_rs` refetches the key set after this interval,
/// and also on a cache miss (handles rotation between scheduled refreshes).
const JWKS_TTL: Duration = Duration::from_secs(3600);

/// Claims we read off the BetterAuth access JWT. `userId` carries the DB
/// `users.id` UUID (see frontend `lib/auth.ts` `definePayload`). `exp` is
/// validated by `jsonwebtoken` automatically; we keep `iss`/`aud` flexible —
/// validation is signature + `exp` only (see `verify_jwt`) because the
/// better-auth issuer is base-URL-derived and not a hard-coded literal.
#[derive(Debug, Deserialize)]
struct Claims {
    #[serde(rename = "userId")]
    user_id: Uuid,
    // `exp` is required by the default validation; we don't read it directly.
    #[allow(dead_code)]
    exp: usize,
}

#[derive(Debug, thiserror::Error)]
pub enum VerifyError {
    #[error("missing kid in token header")]
    MissingKid,
    #[error("unexpected key type for kid (expected OKP/Ed25519)")]
    UnexpectedKeyType,
    #[error("failed to resolve JWKS key: {0}")]
    Jwks(#[from] jwks_client_rs::JwksClientError),
    #[error("invalid token: {0}")]
    Invalid(#[from] jsonwebtoken::errors::Error),
}

/// JWKS client for the CLI user-token surface. Thin wrapper over
/// `jwks_client_rs::JwksClient` (internal cache + timed refresh) so the public
/// `from_env` / `verify_jwt` surface and `main.rs` wiring stay unchanged. Holds
/// non-`Serialize` decoding state, so it lives in `web::Data` (registered in
/// `main.rs`), not the `Cache` layer.
pub struct JwksCache {
    client: JwksClient<WebSource>,
}

impl JwksCache {
    /// Build from `NEXT_PUBLIC_URL` (same var notifications use), deriving the
    /// JWKS endpoint `{base}/api/auth/jwks`. Falls back to `https://lmnr.ai`
    /// with a warning so self-hosters notice an unset var. The `http` arg is
    /// retained for call-site compatibility; `WebSource` manages its own client.
    pub fn from_env(_http: reqwest::Client) -> Self {
        let base = match std::env::var("NEXT_PUBLIC_URL") {
            Ok(v) => v.trim_end_matches('/').to_string(),
            Err(_) => {
                log::warn!(
                    "NEXT_PUBLIC_URL unset; CLI-auth JWKS will default to https://lmnr.ai"
                );
                "https://lmnr.ai".to_string()
            }
        };
        let jwks_url = format!("{base}/api/auth/jwks");
        Self::from_url(&jwks_url)
    }

    /// Build a client pointing at an explicit JWKS URL with the standard TTL.
    fn from_url(jwks_url: &str) -> Self {
        // A malformed URL here is a misconfiguration; fall back to the default
        // so the process still boots (verification just won't resolve keys).
        let url = Url::parse(jwks_url).unwrap_or_else(|e| {
            log::error!("invalid JWKS URL {jwks_url:?}: {e}; CLI auth will not resolve keys");
            Url::parse("https://lmnr.ai/api/auth/jwks").expect("static fallback URL parses")
        });
        let source = WebSource::builder()
            .build(url)
            .expect("WebSource build from parsed URL");
        let client = JwksClient::builder().time_to_live(JWKS_TTL).build(source);
        Self { client }
    }

    /// Resolve a decoding key for `kid` from the (cached) JWKS. Errors map to
    /// `VerifyError` (missing/unknown kid → 401 at the call sites).
    async fn decoding_key_for_kid(&self, kid: &str) -> Result<DecodingKey, VerifyError> {
        let key = self.client.get(kid).await?;
        match key {
            JsonWebKey::Okp(okp) => Ok(DecodingKey::from_ed_components(okp.x())?),
            _ => Err(VerifyError::UnexpectedKeyType),
        }
    }
}

/// Verify a BetterAuth access JWT against the JWKS and return its `userId`.
/// Validate EdDSA signature + exp only. `aud`/`iss` are not checked —
/// better-auth derives them from its baseURL which app-server can't
/// authoritatively know; project membership (checked per-request by
/// `CliProjectAuth`) is the real authz gate. The signature already binds the
/// token to our JWKS.
///
/// NOTE: we resolve the key via `jwks_client_rs` (for its cache + timed
/// refresh) but decode with our OWN `Validation` rather than the lib's
/// `JwksClient::decode`, because that path leaves `validate_aud = true` and
/// would reject real better-auth tokens (which carry `aud`) with
/// `InvalidAudience`. Doing the decode here keeps the intentional
/// aud-disabled stance.
pub async fn verify_jwt(token: &str, jwks: &JwksCache) -> Result<Uuid, VerifyError> {
    let header = decode_header(token)?;
    let kid = header.kid.ok_or(VerifyError::MissingKid)?;
    let key = jwks.decoding_key_for_kid(&kid).await?;

    let mut validation = Validation::new(Algorithm::EdDSA);
    // Validate EdDSA signature + exp only. `aud`/`iss` are not checked —
    // better-auth derives them from its baseURL which app-server can't
    // authoritatively know; project membership is the real authz gate.
    validation.set_required_spec_claims(&["exp"]);
    validation.validate_aud = false;

    let data = decode::<Claims>(token, &key, &validation)?;
    Ok(data.claims.user_id)
}

/// A verified CLI user, inserted into request extensions by
/// `cli_auth_validator`. This is the authN result — identity only, no project.
#[derive(Clone)]
pub struct CliUserAuth {
    pub user_id: Uuid,
}

impl FromRequest for CliUserAuth {
    type Error = Error;
    type Future = Ready<Result<Self, Self::Error>>;

    fn from_request(req: &HttpRequest, _payload: &mut Payload) -> Self::Future {
        match req.extensions().get::<Self>().cloned() {
            Some(u) => ready(Ok(u)),
            // The `/v1/cli` middleware inserts this; absence means the
            // middleware didn't run (misconfigured route) → treat as unauthed.
            None => ready(Err(actix_web::error::ErrorUnauthorized("Not authenticated"))),
        }
    }
}

/// Single bearer middleware for the whole `/v1/cli` scope. Verifies the
/// BetterAuth EdDSA JWT (401 on bad/expired/unknown-kid) and inserts a
/// `CliUserAuth`. AuthN only — project authorization is the
/// `CliProjectAuth` extractor's job, so discovery routes (no project) and
/// project-scoped routes can share this one middleware.
pub async fn cli_auth_validator(
    req: ServiceRequest,
    credentials: BearerAuth,
) -> Result<ServiceRequest, (Error, ServiceRequest)> {
    let config = req.app_data::<Config>().cloned().unwrap_or_default();
    let jwks = req
        .app_data::<web::Data<Arc<JwksCache>>>()
        .cloned()
        .unwrap()
        .into_inner();

    let user_id = match verify_jwt(credentials.token(), &jwks).await {
        Ok(uid) => uid,
        Err(e) => {
            log::warn!("CLI user JWT verification failed: {e}");
            return Err((AuthenticationError::from(config).into(), req));
        }
    };
    req.extensions_mut().insert(CliUserAuth { user_id });
    Ok(req)
}

/// A verified CLI user authorized for a specific project. Produced by reading
/// the `CliUserAuth` (from the auth middleware), the `x-lmnr-project-id`
/// header, and the workspace-membership check. Any handler that takes this is
/// guaranteed a project the user can access — the authZ gate is the type, so
/// it can't be skipped.
#[derive(Clone)]
pub struct CliProjectAuth {
    #[allow(dead_code)]
    pub user_id: Uuid,
    pub project_id: Uuid,
}

impl FromRequest for CliProjectAuth {
    type Error = Error;
    // Async: the membership check hits the DB (cache-backed). Capture the
    // request-derived inputs synchronously, then resolve in the boxed future.
    type Future = Pin<Box<dyn Future<Output = Result<Self, Self::Error>>>>;

    fn from_request(req: &HttpRequest, _payload: &mut Payload) -> Self::Future {
        let user = req.extensions().get::<CliUserAuth>().cloned();
        let header = req
            .headers()
            .get(PROJECT_ID_HEADER)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());
        let db = req.app_data::<web::Data<DB>>().cloned();
        let cache = req.app_data::<web::Data<Cache>>().cloned();

        Box::pin(async move {
            // AuthN result must be present (middleware ran). 401 → CLI re-logs in.
            let user =
                user.ok_or_else(|| actix_web::error::ErrorUnauthorized("Not authenticated"))?;

            // Project header. Missing/invalid → 400 (distinct from 401 so the
            // CLI doesn't mistake it for an expired session).
            let project_id = match header {
                Some(h) => Uuid::parse_str(&h).map_err(|_| {
                    actix_web::error::ErrorBadRequest("Invalid x-lmnr-project-id header")
                })?,
                None => {
                    return Err(actix_web::error::ErrorBadRequest(
                        "Missing x-lmnr-project-id header",
                    ));
                }
            };

            let db = db
                .ok_or_else(|| actix_web::error::ErrorInternalServerError("db unavailable"))?
                .into_inner();
            let cache = cache
                .ok_or_else(|| actix_web::error::ErrorInternalServerError("cache unavailable"))?
                .into_inner();

            // AuthZ: workspace membership. Non-member → 403 (NOT 401: a valid
            // user without access must not be told to re-login). Infra failure
            // → 500 so the CLI retries rather than treating it as expired.
            match is_user_member_of_project(&db.pool, &cache, user.user_id, project_id).await {
                Ok(true) => Ok(CliProjectAuth {
                    user_id: user.user_id,
                    project_id,
                }),
                Ok(false) => Err(actix_web::error::ErrorForbidden(
                    "User is not a member of this project",
                )),
                Err(e) => {
                    log::error!("CLI membership check failed: {e}");
                    Err(actix_web::error::ErrorInternalServerError(
                        "Failed to verify project membership",
                    ))
                }
            }
        })
    }
}

/// Cached membership check for the CLI user surface. Mirrors the
/// `get_api_key_from_raw_value` cache pattern: cache hit → return; miss → query
/// DB → cache the result (both true and false) with a short TTL. Caching the
/// negative result is acceptable: a non-member who is later added waits at most
/// `PROJECT_MEMBERSHIP_TTL_SECONDS`, the same window the positive cache gives a
/// removed member before access is revoked.
pub async fn is_user_member_of_project(
    pool: &PgPool,
    cache: &Cache,
    user_id: Uuid,
    project_id: Uuid,
) -> anyhow::Result<bool> {
    let cache_key = format!("{PROJECT_MEMBERSHIP_CACHE_KEY}:{user_id}:{project_id}");
    if let Ok(Some(is_member)) = cache.get::<bool>(&cache_key).await {
        return Ok(is_member);
    }
    let is_member = crate::db::projects::project_has_member(pool, &user_id, &project_id).await?;
    let _ = cache
        .insert_with_ttl::<bool>(&cache_key, is_member, PROJECT_MEMBERSHIP_TTL_SECONDS)
        .await;
    Ok(is_member)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::SigningKey;
    use ed25519_dalek::pkcs8::EncodePrivateKey;
    use jsonwebtoken::{EncodingKey, Header, encode};
    use rand::RngCore;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    /// Build an `EncodingKey` + the OKP JWK JSON from a fresh Ed25519 keypair.
    /// Returns (EncodingKey, jwk_json) for the given kid.
    fn make_key(kid: &str) -> (EncodingKey, serde_json::Value) {
        // Generate the 32-byte seed via the app's rand (0.9) to avoid the
        // rand_core trait-version mismatch with ed25519-dalek's `generate`.
        let mut seed = [0u8; 32];
        rand::rng().fill_bytes(&mut seed);
        let signing = SigningKey::from_bytes(&seed);
        // jsonwebtoken signs from the PKCS#8 DER of the Ed25519 key.
        let pkcs8 = signing
            .to_pkcs8_der()
            .expect("pkcs8 encode")
            .as_bytes()
            .to_vec();
        let encoding = EncodingKey::from_ed_der(&pkcs8);

        // Build the OKP JWK from the public key's raw 32-byte x coordinate.
        let verifying = signing.verifying_key();
        let x = base64_url(verifying.as_bytes());
        let jwk = serde_json::json!({
            "kty": "OKP",
            "crv": "Ed25519",
            "x": x,
            "kid": kid,
            "alg": "EdDSA",
            "use": "sig"
        });
        (encoding, jwk)
    }

    fn base64_url(bytes: &[u8]) -> String {
        use base64::Engine;
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
    }

    fn sign_token(encoding: &EncodingKey, kid: &str, claims: serde_json::Value) -> String {
        let mut header = Header::new(Algorithm::EdDSA);
        header.kid = Some(kid.to_string());
        encode(&header, &claims, encoding).expect("sign")
    }

    /// Spin up a mock JWKS HTTP server serving the given JWKs and return a
    /// `JwksCache` pointed at it. The server is returned too so the caller
    /// keeps it alive for the duration of the test.
    async fn cache_serving(jwks: Vec<serde_json::Value>) -> (MockServer, JwksCache) {
        let server = MockServer::start().await;
        let body = serde_json::json!({ "keys": jwks });
        Mock::given(method("GET"))
            .and(path("/api/auth/jwks"))
            .respond_with(ResponseTemplate::new(200).set_body_json(body))
            .mount(&server)
            .await;
        let url = format!("{}/api/auth/jwks", server.uri());
        let cache = JwksCache::from_url(&url);
        (server, cache)
    }

    fn future_exp() -> usize {
        (std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
            + 3600) as usize
    }

    #[tokio::test]
    async fn valid_token_returns_user_id() {
        let kid = "k1";
        let (encoding, jwk) = make_key(kid);
        let (_server, jwks) = cache_serving(vec![jwk]).await;
        let user_id = Uuid::new_v4();
        let token = sign_token(
            &encoding,
            kid,
            serde_json::json!({ "userId": user_id.to_string(), "exp": future_exp() }),
        );
        let got = verify_jwt(&token, &jwks).await.expect("verify ok");
        assert_eq!(got, user_id);
    }

    /// Regression for the `aud` reject bug: real better-auth tokens carry
    /// `aud` (= baseURL) and `iss` claims. jsonwebtoken defaults
    /// `validate_aud = true`, so without disabling it these are rejected with
    /// `InvalidAudience` even though the signature + exp are valid.
    #[tokio::test]
    async fn token_with_aud_and_iss_is_accepted() {
        let kid = "k1";
        let (encoding, jwk) = make_key(kid);
        let (_server, jwks) = cache_serving(vec![jwk]).await;
        let user_id = Uuid::new_v4();
        let token = sign_token(
            &encoding,
            kid,
            serde_json::json!({
                "userId": user_id.to_string(),
                "exp": future_exp(),
                "aud": "https://lmnr.ai",
                "iss": "https://lmnr.ai"
            }),
        );
        let got = verify_jwt(&token, &jwks).await.expect("verify ok");
        assert_eq!(got, user_id);
    }

    #[tokio::test]
    async fn token_signed_by_other_key_is_rejected() {
        let kid = "k1";
        let (encoding_a, _jwk_a) = make_key(kid);
        // Different keypair, but advertise the SAME kid so lookup succeeds and
        // only the signature check fails.
        let (_encoding_b, jwk_b) = make_key(kid);
        let (_server, jwks) = cache_serving(vec![jwk_b]).await;
        let token = sign_token(
            &encoding_a,
            kid,
            serde_json::json!({ "userId": Uuid::new_v4().to_string(), "exp": future_exp() }),
        );
        assert!(verify_jwt(&token, &jwks).await.is_err());
    }

    #[tokio::test]
    async fn expired_token_is_rejected() {
        let kid = "k1";
        let (encoding, jwk) = make_key(kid);
        let (_server, jwks) = cache_serving(vec![jwk]).await;
        let past = (std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
            - 3600) as usize;
        let token = sign_token(
            &encoding,
            kid,
            serde_json::json!({ "userId": Uuid::new_v4().to_string(), "exp": past }),
        );
        assert!(verify_jwt(&token, &jwks).await.is_err());
    }

    #[tokio::test]
    async fn token_missing_user_id_is_rejected() {
        let kid = "k1";
        let (encoding, jwk) = make_key(kid);
        let (_server, jwks) = cache_serving(vec![jwk]).await;
        let token = sign_token(&encoding, kid, serde_json::json!({ "exp": future_exp() }));
        assert!(verify_jwt(&token, &jwks).await.is_err());
    }

    /// Header parse mirror of the `CliProjectAuth` extractor: a valid UUID
    /// parses; a garbage value fails.
    #[test]
    fn project_id_header_parse() {
        let id = Uuid::new_v4();
        assert_eq!(Uuid::parse_str(&id.to_string()).ok(), Some(id));
        assert!(Uuid::parse_str("not-a-uuid").is_err());
    }

    /// Routing-level: the bearer middleware short-circuits to 401 when no
    /// credentials are present, BEFORE the validator body runs (so no DB/JWKS
    /// data is needed). Confirms the `/v1/cli` scope is bearer-protected.
    #[actix_web::test]
    async fn missing_bearer_returns_401() {
        use actix_web::{App, HttpResponse, test, web};
        use actix_web_httpauth::middleware::HttpAuthentication;

        async fn ok_handler() -> HttpResponse {
            HttpResponse::Ok().finish()
        }

        let app = test::init_service(
            App::new().service(
                web::scope("/v1/cli")
                    .wrap(HttpAuthentication::bearer(cli_auth_validator))
                    .route("/datasets", web::get().to(ok_handler)),
            ),
        )
        .await;

        let req = test::TestRequest::get().uri("/v1/cli/datasets").to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), actix_web::http::StatusCode::UNAUTHORIZED);
    }

    #[test]
    fn membership_cache_key_shape() {
        let user = Uuid::nil();
        let project = Uuid::nil();
        let key = format!("{PROJECT_MEMBERSHIP_CACHE_KEY}:{user}:{project}");
        assert_eq!(
            key,
            "project_membership:00000000-0000-0000-0000-000000000000:00000000-0000-0000-0000-000000000000"
        );
    }

    #[tokio::test]
    async fn unknown_kid_is_rejected() {
        // JWKS serves k1, token advertises k2. The lib's cache miss → refetch
        // → still-missing kid surfaces as an error rather than a panic.
        let (encoding, jwk) = make_key("k1");
        let (_server, jwks) = cache_serving(vec![jwk]).await;
        let token = sign_token(
            &encoding,
            "k2",
            serde_json::json!({ "userId": Uuid::new_v4().to_string(), "exp": future_exp() }),
        );
        assert!(verify_jwt(&token, &jwks).await.is_err());
    }
}
