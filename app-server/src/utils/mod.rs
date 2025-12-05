use std::sync::OnceLock;
use std::time::Duration;

use jsonwebtoken::{Algorithm, EncodingKey, Header, encode};
use moka::sync::Cache;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct DataPlaneClaims {
    /// Issuer
    pub iss: String,
    /// Subject (workspace_id)
    pub sub: String,
    /// Issued at (Unix timestamp)
    pub iat: i64,
    /// Expiration (Unix timestamp)
    pub exp: i64,
}

/// JWT expiration time in seconds (5 minutes)
const JWT_EXPIRATION_SECS: i64 = 300;

/// Cache TTL - refresh token when 80% of lifetime has passed (4 minutes)
const JWT_CACHE_TTL_SECS: u64 = 240;

/// Cached encoding key - parsed once from PEM on first use
static ENCODING_KEY: OnceLock<Result<EncodingKey, String>> = OnceLock::new();

/// Cache of JWT tokens per workspace_id
static JWT_CACHE: OnceLock<Cache<Uuid, String>> = OnceLock::new();

fn get_encoding_key() -> Result<&'static EncodingKey, String> {
    ENCODING_KEY
        .get_or_init(|| {
            let private_key_pem = std::env::var("DATA_PLANE_PRIVATE_KEY")
                .map_err(|_| "DATA_PLANE_PRIVATE_KEY environment variable not set".to_string())?;

            EncodingKey::from_rsa_pem(private_key_pem.as_bytes())
                .map_err(|e| format!("Invalid RSA private key: {}", e))
        })
        .as_ref()
        .map_err(|e| e.clone())
}

fn get_jwt_cache() -> &'static Cache<Uuid, String> {
    JWT_CACHE.get_or_init(|| {
        Cache::builder()
            .time_to_live(Duration::from_secs(JWT_CACHE_TTL_SECS))
            .max_capacity(10_000)
            .build()
    })
}

/// Generate a JWT token for data plane authentication.
/// Uses RS256 algorithm with a private key from environment variable.
/// Tokens are cached per workspace_id and reused until near expiration.
pub fn generate_data_plane_jwt(workspace_id: Uuid) -> Result<String, String> {
    let cache = get_jwt_cache();

    // Return cached token if available
    if let Some(token) = cache.get(&workspace_id) {
        return Ok(token);
    }

    // Generate new token
    let key = get_encoding_key()?;

    let now = chrono::Utc::now().timestamp();
    let claims = DataPlaneClaims {
        iss: "laminar".to_string(),
        sub: workspace_id.to_string(),
        iat: now,
        exp: now + JWT_EXPIRATION_SECS,
    };

    let token = encode(&Header::new(Algorithm::RS256), &claims, key)
        .map_err(|e| format!("Failed to encode JWT: {}", e))?;

    // Cache the token
    cache.insert(workspace_id, token.clone());

    Ok(token)
}

pub fn json_value_to_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.to_string(),
        _ => v.to_string(),
    }
}

/// Estimate the size of a JSON value in bytes.
/// Ignores the quotes, commas, colons, and braces.
pub fn estimate_json_size(v: &Value) -> usize {
    match v {
        Value::Null => 4,
        Value::Bool(b) => b.to_string().len(),
        Value::Number(n) => n.to_string().len(),
        Value::String(s) => s.as_bytes().len(),
        Value::Array(a) => a.iter().map(estimate_json_size).sum(),
        Value::Object(o) => o.iter().map(|(k, v)| k.len() + estimate_json_size(v)).sum(),
    }
}

/// Check if a string is a URL (http, https, or data URL)
pub fn is_url(data: &str) -> bool {
    data.starts_with("http://") || data.starts_with("https://") || data.starts_with("data:")
}

pub fn sanitize_string(input: &str) -> String {
    // Remove Unicode null characters and invalid UTF-8 sequences
    input
        .chars()
        .filter(|&c| {
            // Keep newlines and tabs, remove other control chars
            if c == '\n' || c == '\t' {
                return true;
            }
            // Remove Unicode null characters
            if c == '\0' || c == '\u{0000}' || c == '\u{FFFE}' || c == '\u{FFFF}' {
                return false;
            }
            // Remove other control characters
            if c.is_control() {
                return false;
            }
            true
        })
        .collect::<String>()
}
