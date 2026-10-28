use rand::{RngExt, distr::Alphanumeric};
use sha3::{Digest, Sha3_256};

pub fn hash_api_key(api_key: &str) -> String {
    let mut hasher = Sha3_256::new();
    hasher.update(api_key.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// A freshly minted key. Only `hash` and `shorthand` are stored; `value` is the secret.
pub struct GeneratedApiKey {
    pub value: String,
    pub hash: String,
    pub shorthand: String,
}

/// Same format as the frontend's `createProjectApiKey` (`frontend/lib/api-keys.ts`).
pub fn generate_api_key() -> GeneratedApiKey {
    let value: String = rand::rng()
        .sample_iter(Alphanumeric)
        .take(64)
        .map(char::from)
        .collect();
    GeneratedApiKey {
        hash: hash_api_key(&value),
        shorthand: format!("{}...{}", &value[..4], &value[value.len() - 4..]),
        value,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_key_matches_the_frontend_format() {
        let key = generate_api_key();
        assert_eq!(key.value.len(), 64);
        assert!(key.value.chars().all(|c| c.is_ascii_alphanumeric()));
        assert_eq!(key.hash, hash_api_key(&key.value));
        assert_eq!(
            key.shorthand,
            format!("{}...{}", &key.value[..4], &key.value[60..])
        );
        assert_ne!(key.value, generate_api_key().value);
    }
}
