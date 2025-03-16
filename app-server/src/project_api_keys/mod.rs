use crate::db::utils::generate_random_key;
use sha3::{Digest, Sha3_256};

pub struct ProjectApiKeyVals {
    pub value: String,
    pub hash: String,
    pub shorthand: String,
}

impl ProjectApiKeyVals {
    pub fn new() -> Self {
        let value = generate_random_key();
        let hash = hash_api_key(&value);
        let shorthand = format!("{}...{}", &value[..4], &value[value.len() - 4..]);
        Self {
            value,
            hash,
            shorthand,
        }
    }
}

pub fn hash_api_key(api_key: &str) -> String {
    let mut hasher = Sha3_256::new();
    hasher.update(api_key.as_bytes());
    format!("{:x}", hasher.finalize())
}
