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

use std::sync::OnceLock;
use std::time::Duration;

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use moka::sync::Cache;
use sodiumoxide::crypto::sign;
use uuid::Uuid;

use crate::db::workspaces::WorkspaceDeployment;

use super::crypto::decrypt;

/// Token expiration time in seconds (15 minutes)
const TOKEN_EXPIRATION_SECS: i64 = 900;

/// Cache TTL - refresh token when 80% of lifetime has passed (12 minutes)
const TOKEN_CACHE_TTL_SECS: u64 = 720;

/// Cache of tokens per workspace_id
static TOKEN_CACHE: OnceLock<Cache<Uuid, String>> = OnceLock::new();

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

fn get_token_cache() -> &'static Cache<Uuid, String> {
    TOKEN_CACHE.get_or_init(|| {
        Cache::builder()
            .time_to_live(Duration::from_secs(TOKEN_CACHE_TTL_SECS))
            .max_capacity(10_000)
            .build()
    })
}

/// Generate a signed token for data plane authentication.
///
/// Uses Ed25519 signatures with a private key from environment variable.
/// Tokens are cached per workspace_id and reused until near expiration.
///
/// Token format: `base64(payload).base64(signature)`
/// Payload format: `workspace_id:issued_at:expires_at`
pub fn generate_auth_token(config: &WorkspaceDeployment) -> Result<String, String> {
    let cache = get_token_cache();

    // Return cached token if available
    if let Some(token) = cache.get(&config.workspace_id) {
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

    // Cache the token
    cache.insert(config.workspace_id, token.clone());

    Ok(token)
}
