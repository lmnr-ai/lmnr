use anyhow::{Context, Result, anyhow};
use jsonwebtoken::{Algorithm, Validation, decode, decode_header};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::auth::jwks;
use crate::db::project_api_keys::{CredentialKind, ProjectAuth};

/// The shape Next.js mints. `aud`/`exp`/`iat`/`sub` are validated by
/// `jsonwebtoken::Validation`; we keep them in the struct so deserialization
/// requires their presence. `iss` is captured but not validated — we trust
/// the signing key (which lives in our Postgres) rather than the `iss` claim.
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
/// `alg`. Real validation happens in `validate_jwt`.
pub fn looks_like_jwt(token: &str) -> bool {
    let segments = token.split('.').count();
    if segments != 3 {
        return false;
    }
    decode_header(token).is_ok()
}

/// Validate the JWT against the JWKS read from Postgres and return a
/// `ProjectAuth` whose `kind` is `CredentialKind::AccessToken { jti }`.
/// Downstream handlers branch on `kind` if they need to (today nothing
/// does — they only read `project_id` / `is_ingest_only`).
pub async fn validate_jwt(db: &PgPool, token: &str) -> Result<ProjectAuth> {
    let header = decode_header(token).context("decoding JWT header")?;
    let kid = header.kid.ok_or_else(|| anyhow!("JWT missing kid"))?;
    let key = jwks::get_decoding_key(&kid, db).await?;

    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_audience(&[AUDIENCE]);
    // Issuer is intentionally NOT validated: we trust the signing key (loaded
    // from our DB), and `iss` would only matter in a federation scenario where
    // multiple issuers share a JWKS — not our case.
    validation.set_required_spec_claims(&["exp", "iat", "aud", "sub"]);

    let data =
        decode::<DeviceFlowClaims>(token, &key, &validation).context("validating JWT")?;
    let claims = data.claims;

    let jti = Uuid::parse_str(&claims.jti).context("parsing JWT jti as UUID")?;
    let shorthand: String = claims.email.chars().take(8).collect();
    Ok(ProjectAuth {
        project_id: claims.project_id,
        name: Some(claims.email),
        shorthand,
        is_ingest_only: false,
        kind: CredentialKind::AccessToken { jti },
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
    use jsonwebtoken::{EncodingKey, Header, encode, jwk::JwkSet};
    use rsa::{
        RsaPrivateKey, RsaPublicKey,
        pkcs8::{EncodePrivateKey, LineEnding},
        traits::PublicKeyParts,
    };
    use serde_json::json;

    #[test]
    fn looks_like_jwt_recognises_three_segments() {
        assert!(!looks_like_jwt("not a jwt"));
        assert!(!looks_like_jwt("only.two"));
        assert!(!looks_like_jwt("four.parts.here.too"));
        // Three segments but garbage header — `decode_header` fails so this
        // is correctly rejected.
        assert!(!looks_like_jwt("aaaa.bbbb.cccc"));
    }

    #[tokio::test]
    async fn test_validate_minted_jwt_against_local_jwks() {
        // Generate a fresh RSA-2048 keypair. `rsa 0.9` uses `rand_core 0.6`'s
        // `OsRng` directly, which avoids pinning a `rand` major version here.
        let mut rng = rsa::rand_core::OsRng;
        let priv_key = RsaPrivateKey::new(&mut rng, 2048).expect("gen rsa key");
        let pub_key = RsaPublicKey::from(&priv_key);

        // Encode the private key as PKCS#8 PEM for `EncodingKey::from_rsa_pem`.
        let pem = priv_key
            .to_pkcs8_pem(LineEnding::LF)
            .expect("encode pkcs8");

        // Build the public JWK (RSA: kty/n/e/kid/alg/use).
        let n_b64 = URL_SAFE_NO_PAD.encode(pub_key.n().to_bytes_be());
        let e_b64 = URL_SAFE_NO_PAD.encode(pub_key.e().to_bytes_be());
        let kid = "test-kid-1";
        let jwk_set: JwkSet = serde_json::from_value(json!({
            "keys": [
                {
                    "kty": "RSA",
                    "n": n_b64,
                    "e": e_b64,
                    "kid": kid,
                    "alg": "RS256",
                    "use": "sig"
                }
            ]
        }))
        .expect("parse JwkSet");

        // Seed the in-process JWKS cache so the validator doesn't try to
        // fetch from the network.
        jwks::_seed_cache_from_set(&jwk_set).await;

        // Mint a JWT with the matching key.
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as usize;
        let project_id = uuid::Uuid::new_v4();
        let claims = DeviceFlowClaims {
            iss: "http://example.invalid".to_string(),
            aud: AUDIENCE.to_string(),
            sub: "11111111-1111-1111-1111-111111111111".to_string(),
            email: "alice@example.com".to_string(),
            project_id,
            scope: "projects:rw".to_string(),
            client_id: "lmnr-cli".to_string(),
            jti: "ffffffff-ffff-ffff-ffff-ffffffffffff".to_string(),
            exp: now + 3600,
            iat: now,
        };
        let mut header = Header::new(jsonwebtoken::Algorithm::RS256);
        header.kid = Some(kid.to_string());

        let encoding_key =
            EncodingKey::from_rsa_pem(pem.as_bytes()).expect("from_rsa_pem");
        let token = encode(&header, &claims, &encoding_key).expect("encode JWT");

        // `validate_jwt` should validate this token via
        // the seeded cache (it will not hit Postgres because the cache is
        // fresh and the kid resolves immediately). `connect_lazy` lets us
        // hand a `&PgPool` without opening a real connection.
        let pool = sqlx::postgres::PgPoolOptions::new()
            .connect_lazy("postgres://test:test@127.0.0.1:1/test")
            .expect("connect_lazy");
        let auth = validate_jwt(&pool, &token)
            .await
            .expect("validate JWT");

        assert_eq!(auth.project_id, project_id);
        assert_eq!(auth.name, Some("alice@example.com".to_string()));
        assert!(!auth.is_ingest_only);
        match auth.kind {
            CredentialKind::AccessToken { jti } => {
                assert_eq!(
                    jti,
                    Uuid::parse_str("ffffffff-ffff-ffff-ffff-ffffffffffff")
                        .unwrap()
                );
            }
            _ => panic!("expected AccessToken kind"),
        }
    }

}
