//! Authentication for data plane communication.
//!
//! Uses Ed25519 signatures (asymmetric) for token generation.
//! Token format: `base64(payload).base64(signature)`
//!
//! Payload: `workspace_id:issued_at:expires_at`
//!
//! Generate keys:
//! ```bash
//! # Generate keypair and print base64-encoded keys
//! cargo run --bin generate-keys  # or use the generate_keypair() function
//! ```

use std::sync::Arc;

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ed25519_compact::SecretKey;
use log::warn;

use crate::cache::{Cache, CacheTrait, keys::DATA_PLANE_AUTH_TOKEN_CACHE_KEY};
use crate::db::workspaces::WorkspaceDeployment;

use super::crypto::decrypt;

/// Token expiration time in seconds (15 minutes)
const TOKEN_EXPIRATION_SECS: i64 = 900;

/// Cache TTL - refresh token when 80% of lifetime has passed (12 minutes)
const TOKEN_CACHE_TTL_SECS: u64 = 720;

fn key_from_base64(config: &WorkspaceDeployment) -> Result<SecretKey, String> {
    let (Some(private_key_nonce), Some(private_key)) =
        (&config.private_key_nonce, &config.private_key)
    else {
        return Err("Private key is not configured".to_string());
    };

    let decrypted = decrypt(config.workspace_id, private_key_nonce, private_key)
        .map_err(|e| format!("Failed to decrypt private key: {}", e))?;

    let key_bytes = base64::engine::general_purpose::STANDARD
        .decode(&decrypted)
        .map_err(|e| format!("Invalid base64 in private key: {}", e))?;

    SecretKey::from_slice(&key_bytes)
        .map_err(|_| "Invalid Ed25519 secret key (expected 64 bytes)".to_string())
}

/// Generate a signed token for data plane authentication.
///
/// Uses Ed25519 signatures with a private key from environment variable.
/// Tokens are cached per workspace_id and reused until near expiration.
///
/// Token format: `base64(payload).base64(signature)`
/// Payload format: `workspace_id:issued_at:expires_at`
pub async fn generate_auth_token(
    cache: Arc<Cache>,
    config: &WorkspaceDeployment,
) -> Result<String, String> {
    let cache_key = format!(
        "{}:{}",
        DATA_PLANE_AUTH_TOKEN_CACHE_KEY, config.workspace_id
    );

    // Return cached token if available
    if let Ok(Some(token)) = cache.get::<String>(&cache_key).await {
        return Ok(token);
    }

    let signing_key = key_from_base64(&config)?;

    let now = chrono::Utc::now().timestamp();
    let expires_at = now + TOKEN_EXPIRATION_SECS;

    // Create payload: workspace_id:issued_at:expires_at
    let payload: String = format!("{}:{}:{}", config.workspace_id, now, expires_at);
    let payload_bytes = payload.as_bytes();

    // Sign the payload (deterministic Ed25519 — no noise, matching libsodium's crypto_sign_detached)
    let signature = signing_key.sign(payload_bytes, None);

    // Encode as base64: payload.signature
    let token = format!(
        "{}.{}",
        URL_SAFE_NO_PAD.encode(payload_bytes),
        URL_SAFE_NO_PAD.encode(signature.as_ref())
    );

    // Cache the token with TTL (best-effort, don't fail if caching fails)
    if let Err(e) = cache
        .insert_with_ttl(&cache_key, token.clone(), TOKEN_CACHE_TTL_SECS)
        .await
    {
        warn!(
            "Failed to cache auth token for workspace {}: {}",
            config.workspace_id, e
        );
    }

    Ok(token)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data_plane::crypto::encrypt;
    use crate::db::workspaces::DeploymentMode;
    use uuid::Uuid;

    /// Private keys are minted by the frontend with libsodium `crypto_sign_keypair` (64-byte
    /// seed||pubkey, base64). Pinned vectors prove ed25519-compact loads them and produces
    /// byte-identical detached signatures.
    #[test]
    fn signs_compatibly_with_libsodium() {
        unsafe {
            std::env::set_var(
                crate::env::secrets::AEAD_SECRET_KEY,
                "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            );
        }

        // libsodium crypto_sign_seed_keypair(seed = [3u8; 32])
        let sk_b64 = "AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwPtSSjGKNHCxurpAziQWZVhKVknOlxj+TY2wUYUrIc30Q==";
        let workspace_id = Uuid::nil();
        let (nonce, encrypted) = encrypt(workspace_id, sk_b64).unwrap();

        let signing_key = key_from_base64(&WorkspaceDeployment {
            workspace_id,
            mode: DeploymentMode::HYBRID,
            private_key: Some(encrypted),
            private_key_nonce: Some(nonce),
            public_key: None,
            data_plane_url: None,
            data_plane_url_nonce: None,
        })
        .unwrap();

        let signature = signing_key.sign(b"payload-to-sign", None);
        assert_eq!(
            base64::engine::general_purpose::STANDARD.encode(signature.as_ref()),
            "W94/2rIYKW0koqs48hXzzaEcER581tZnJD/hBBlfjM2U0CEQ9DYtb8bPctp1/Om4EnuXgeENpQjDPLm93sL6CQ=="
        );
    }
}
