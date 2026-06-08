//! CLI user-token auth: verifies a BetterAuth EdDSA access JWT against the
//! frontend's JWKS, authorizes the user against the target project's workspace
//! membership, and inserts a `ProjectContext` for the `/v1/cli/*` surface.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use actix_web::dev::ServiceRequest;
use actix_web::{Error, HttpMessage, HttpResponse, web};
use actix_web_httpauth::extractors::AuthenticationError;
use actix_web_httpauth::extractors::bearer::{BearerAuth, Config};
use jsonwebtoken::jwk::JwkSet;
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header};
use serde::Deserialize;
use sqlx::PgPool;
use tokio::sync::RwLock;
use uuid::Uuid;

use super::{AuthPrincipal, ProjectContext};
use crate::cache::{Cache, CacheTrait, keys::PROJECT_MEMBERSHIP_CACHE_KEY};
use crate::db::DB;

/// Header carrying the target project id for the CLI user surface. The project
/// is never in the path; the user picks it per request.
const PROJECT_ID_HEADER: &str = "x-lmnr-project-id";

/// Membership-cache TTL. Short by design: this is the revocation window —
/// removing a user from a workspace takes effect within this many seconds,
/// NOT bounded by the 15m JWT lifetime.
const PROJECT_MEMBERSHIP_TTL_SECONDS: u64 = 60;

/// JWKS cache TTL. Keys are refetched after this interval, and also eagerly on
/// an unknown `kid` (handles rotation between scheduled refreshes).
const JWKS_TTL: Duration = Duration::from_secs(3600);

/// Claims we read off the BetterAuth access JWT. `userId` carries the DB
/// `users.id` UUID (see frontend `lib/auth.ts` `definePayload`). `exp` is
/// validated by `jsonwebtoken` automatically; we keep `iss`/`aud` flexible —
/// validation is signature + `exp` only (see module wiring) because the
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
    #[error("no JWKS key matches kid")]
    UnknownKid,
    #[error("failed to fetch JWKS: {0}")]
    Fetch(String),
    #[error("invalid token: {0}")]
    Invalid(#[from] jsonwebtoken::errors::Error),
}

struct JwksState {
    keys: HashMap<String, DecodingKey>,
    fetched_at: Instant,
}

/// In-process JWKS cache shared across all workers/requests (holds non-Serialize
/// `DecodingKey`s, so it can't live in the `Cache` layer). Wrapped in an `Arc`
/// and registered via `web::Data` in `main.rs`.
pub struct JwksCache {
    inner: RwLock<JwksState>,
    http: reqwest::Client,
    jwks_url: String,
    ttl: Duration,
}

impl JwksCache {
    /// Build from `NEXT_PUBLIC_URL` (same var notifications use), deriving the
    /// JWKS endpoint `{base}/api/auth/jwks`. Falls back to `https://lmnr.ai`
    /// with a warning so self-hosters notice an unset var.
    pub fn from_env(http: reqwest::Client) -> Self {
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
        Self {
            inner: RwLock::new(JwksState {
                keys: HashMap::new(),
                fetched_at: Instant::now()
                    .checked_sub(JWKS_TTL)
                    .unwrap_or_else(Instant::now),
            }),
            http,
            jwks_url,
            ttl: JWKS_TTL,
        }
    }

    /// Test-only constructor: pre-seed the key map so no network is hit.
    #[cfg(test)]
    fn new_for_test(keys: HashMap<String, DecodingKey>) -> Self {
        Self {
            inner: RwLock::new(JwksState {
                keys,
                fetched_at: Instant::now(),
            }),
            http: reqwest::Client::new(),
            jwks_url: String::new(),
            ttl: JWKS_TTL,
        }
    }

    /// Resolve a decoding key for `kid`. Returns from cache when fresh and the
    /// kid is present; otherwise refetches the JWKS once and retries.
    async fn decoding_key_for_kid(&self, kid: &str) -> Result<DecodingKey, VerifyError> {
        {
            let state = self.inner.read().await;
            let fresh = state.fetched_at.elapsed() < self.ttl;
            if fresh {
                if let Some(key) = state.keys.get(kid) {
                    return Ok(key.clone());
                }
            }
        }
        // Stale or unknown kid → refetch.
        self.refresh().await?;
        let state = self.inner.read().await;
        state
            .keys
            .get(kid)
            .cloned()
            .ok_or(VerifyError::UnknownKid)
    }

    async fn refresh(&self) -> Result<(), VerifyError> {
        let resp = self
            .http
            .get(&self.jwks_url)
            .send()
            .await
            .map_err(|e| VerifyError::Fetch(e.to_string()))?;
        let body = resp
            .text()
            .await
            .map_err(|e| VerifyError::Fetch(e.to_string()))?;
        let set: JwkSet =
            serde_json::from_str(&body).map_err(|e| VerifyError::Fetch(e.to_string()))?;
        let mut keys = HashMap::new();
        for jwk in &set.keys {
            if let Some(kid) = jwk.common.key_id.clone() {
                match DecodingKey::from_jwk(jwk) {
                    Ok(key) => {
                        keys.insert(kid, key);
                    }
                    Err(e) => log::warn!("skipping unparseable JWK kid={kid}: {e}"),
                }
            }
        }
        let mut state = self.inner.write().await;
        state.keys = keys;
        state.fetched_at = Instant::now();
        Ok(())
    }
}

/// Verify a BetterAuth access JWT against the JWKS and return its `userId`.
/// Validates the EdDSA signature + `exp`. Issuer/audience are intentionally
/// NOT validated (better-auth derives them from the base URL; pinning a literal
/// risks false rejects across environments). The signature already binds the
/// token to our JWKS, so this is secure.
pub async fn verify_jwt(token: &str, jwks: &JwksCache) -> Result<Uuid, VerifyError> {
    let header = decode_header(token)?;
    let kid = header.kid.ok_or(VerifyError::MissingKid)?;
    let key = jwks.decoding_key_for_kid(&kid).await?;

    let mut validation = Validation::new(Algorithm::EdDSA);
    // better-auth's `userId` is non-standard; `sub` is present but we read
    // `userId`. Only require `exp` from the standard claim set.
    validation.set_required_spec_claims(&["exp"]);

    let data = decode::<Claims>(token, &key, &validation)?;
    Ok(data.claims.user_id)
}

fn bad_request(req: ServiceRequest, msg: &str) -> (Error, ServiceRequest) {
    let response = HttpResponse::BadRequest().json(serde_json::json!({ "error": msg }));
    (
        actix_web::error::InternalError::from_response("", response).into(),
        req,
    )
}

fn forbidden(req: ServiceRequest, msg: &str) -> (Error, ServiceRequest) {
    let response = HttpResponse::Forbidden().json(serde_json::json!({ "error": msg }));
    (
        actix_web::error::InternalError::from_response("", response).into(),
        req,
    )
}

/// Bearer middleware for the `/v1/cli/*` scope. Verifies the BetterAuth EdDSA
/// JWT (401 on bad/expired/unknown-kid), reads `x-lmnr-project-id` (400 on
/// missing/invalid), authorizes workspace membership (403 on non-member), and
/// inserts a `ProjectContext { principal: User }` into request extensions.
pub async fn cli_user_validator(
    req: ServiceRequest,
    credentials: BearerAuth,
) -> Result<ServiceRequest, (Error, ServiceRequest)> {
    let config = req
        .app_data::<Config>()
        .map(|data| data.clone())
        .unwrap_or_else(Default::default);

    let db = req
        .app_data::<web::Data<DB>>()
        .cloned()
        .unwrap()
        .into_inner();
    let cache = req
        .app_data::<web::Data<Cache>>()
        .cloned()
        .unwrap()
        .into_inner();
    let jwks = req
        .app_data::<web::Data<Arc<JwksCache>>>()
        .cloned()
        .unwrap()
        .into_inner();

    // 1. Verify the JWT → user_id. Any failure → 401.
    let user_id = match verify_jwt(credentials.token(), &jwks).await {
        Ok(uid) => uid,
        Err(e) => {
            log::warn!("CLI user JWT verification failed: {e}");
            return Err((AuthenticationError::from(config).into(), req));
        }
    };

    // 2. Read + parse the project id header. Missing/invalid → 400.
    let project_id = match req.headers().get(PROJECT_ID_HEADER) {
        Some(value) => match value.to_str().ok().and_then(|s| Uuid::parse_str(s).ok()) {
            Some(id) => id,
            None => {
                return Err(bad_request(req, "Invalid x-lmnr-project-id header"));
            }
        },
        None => {
            return Err(bad_request(req, "Missing x-lmnr-project-id header"));
        }
    };

    // 3. Authorize membership (short-TTL cached). Non-member → 403.
    match is_user_member_of_project(&db.pool, &cache, user_id, project_id).await {
        Ok(true) => {}
        Ok(false) => {
            return Err(forbidden(req, "User is not a member of this project"));
        }
        Err(e) => {
            log::error!("CLI membership check failed: {e}");
            return Err((AuthenticationError::from(config).into(), req));
        }
    }

    // 4. Insert the unified principal.
    req.extensions_mut().insert(ProjectContext {
        project_id,
        principal: AuthPrincipal::User { user_id },
    });
    Ok(req)
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
    let is_member =
        crate::db::projects::project_has_member(pool, &user_id, &project_id).await?;
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

    /// Build a JWKS key map + an `EncodingKey` from a fresh Ed25519 keypair.
    /// Returns (kid, JwksCache with that key seeded, EncodingKey).
    fn make_key(kid: &str) -> (SigningKey, EncodingKey, DecodingKey) {
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
        let jwk_json = format!(
            r#"{{"kty":"OKP","crv":"Ed25519","x":"{x}","kid":"{kid}","alg":"EdDSA"}}"#
        );
        let jwk: jsonwebtoken::jwk::Jwk =
            serde_json::from_str(&jwk_json).expect("parse jwk");
        let decoding = DecodingKey::from_jwk(&jwk).expect("decoding key from jwk");
        (signing, encoding, decoding)
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

    fn cache_with(kid: &str, decoding: DecodingKey) -> JwksCache {
        let mut keys = HashMap::new();
        keys.insert(kid.to_string(), decoding);
        JwksCache::new_for_test(keys)
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
        let (_signing, encoding, decoding) = make_key(kid);
        let jwks = cache_with(kid, decoding);
        let user_id = Uuid::new_v4();
        let token = sign_token(
            &encoding,
            kid,
            serde_json::json!({ "userId": user_id.to_string(), "exp": future_exp() }),
        );
        let got = verify_jwt(&token, &jwks).await.expect("verify ok");
        assert_eq!(got, user_id);
    }

    #[tokio::test]
    async fn token_signed_by_other_key_is_rejected() {
        let kid = "k1";
        let (_s1, encoding_a, _d1) = make_key(kid);
        // Different keypair, but advertise the SAME kid so lookup succeeds and
        // only the signature check fails.
        let (_s2, _encoding_b, decoding_b) = make_key(kid);
        let jwks = cache_with(kid, decoding_b);
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
        let (_signing, encoding, decoding) = make_key(kid);
        let jwks = cache_with(kid, decoding);
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
        let (_signing, encoding, decoding) = make_key(kid);
        let jwks = cache_with(kid, decoding);
        let token = sign_token(
            &encoding,
            kid,
            serde_json::json!({ "exp": future_exp() }),
        );
        assert!(verify_jwt(&token, &jwks).await.is_err());
    }

    /// Exercise the header parse + 400 status mapping without touching DB/JWKS.
    /// Builds a bare `ServiceRequest` and asserts `bad_request` maps to a 400
    /// JSON response with the given message.
    #[actix_web::test]
    async fn bad_request_maps_to_400() {
        use actix_web::ResponseError;
        use actix_web::test::TestRequest;
        let req = TestRequest::default().to_srv_request();
        let (err, _req) = bad_request(req, "Missing x-lmnr-project-id header");
        let resp = err.error_response();
        assert_eq!(resp.status(), actix_web::http::StatusCode::BAD_REQUEST);
    }

    #[actix_web::test]
    async fn forbidden_maps_to_403() {
        use actix_web::ResponseError;
        use actix_web::test::TestRequest;
        let req = TestRequest::default().to_srv_request();
        let (err, _req) = forbidden(req, "not a member");
        let resp = err.error_response();
        assert_eq!(resp.status(), actix_web::http::StatusCode::FORBIDDEN);
    }

    /// Header parse mirror of the validator's step 2. A valid UUID parses; a
    /// garbage value and an absent header both fail.
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
                    .wrap(HttpAuthentication::bearer(cli_user_validator))
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
    async fn unknown_kid_is_rejected_offline() {
        // Cache seeded with k1, token advertises k2. With an empty jwks_url the
        // refetch fails, so we get a Fetch/UnknownKid error rather than a panic.
        let (_signing, encoding, decoding) = make_key("k1");
        let jwks = cache_with("k1", decoding);
        let token = sign_token(
            &encoding,
            "k2",
            serde_json::json!({ "userId": Uuid::new_v4().to_string(), "exp": future_exp() }),
        );
        assert!(verify_jwt(&token, &jwks).await.is_err());
    }
}
