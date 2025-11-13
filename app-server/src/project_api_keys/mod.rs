use sha3::{Digest, Sha3_256};

pub fn hash_api_key(api_key: &str) -> String {
    let mut hasher = Sha3_256::new();
    hasher.update(api_key.as_bytes());
    format!("{:x}", hasher.finalize())
}
