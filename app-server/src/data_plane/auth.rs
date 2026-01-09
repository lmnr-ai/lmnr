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
use log::warn;
use sodiumoxide::crypto::sign;

use crate::cache::{Cache, CacheTrait, keys::DATA_PLANE_AUTH_TOKEN_CACHE_KEY};
use crate::db::workspaces::WorkspaceDeployment;

use super::crypto::decrypt;

/// Token expiration time in seconds (15 minutes)
const TOKEN_EXPIRATION_SECS: i64 = 900;

/// Cache TTL - refresh token when 80% of lifetime has passed (12 minutes)
const TOKEN_CACHE_TTL_SECS: u64 = 720;

fn key_from_base64(config: &WorkspaceDeployment) -> Result<sign::SecretKey, String> {
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

    sign::SecretKey::from_slice(&key_bytes)
        .ok_or_else(|| "Invalid Ed25519 secret key (expected 64 bytes)".to_string())
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

    // Sign the payload
    let signature = sign::sign_detached(payload_bytes, &signing_key);

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
