use anyhow::{Result, anyhow};
use sodiumoxide::crypto::aead::xchacha20poly1305_ietf;
use uuid::Uuid;

/// Get the encryption key from the AEAD_SECRET_KEY environment variable
fn get_key_from_env() -> Result<xchacha20poly1305_ietf::Key> {
    let key_hex = std::env::var("AEAD_SECRET_KEY")
        .map_err(|_| anyhow!("AEAD_SECRET_KEY environment variable not set"))?;

    let key_bytes = hex::decode(&key_hex)
        .map_err(|e| anyhow!("Failed to decode AEAD_SECRET_KEY from hex: {}", e))?;

    if key_bytes.len() != 32 {
        return Err(anyhow!(
            "AEAD_SECRET_KEY must be 32 bytes (64 hex characters), got {} bytes",
            key_bytes.len()
        ));
    }

    xchacha20poly1305_ietf::Key::from_slice(&key_bytes)
        .ok_or_else(|| anyhow!("Failed to create key from bytes"))
}

#[allow(dead_code)]
pub fn encrypt_workspace_str(workspace_id: Uuid, val: &str) -> Result<(String, String)> {
    let key = get_key_from_env()?;

    // Generate random nonce (24 bytes for XChaCha20-Poly1305)
    let nonce = xchacha20poly1305_ietf::gen_nonce();

    // Use workspace_id as additional authenticated data
    let additional_data = workspace_id.to_string();
    let aad = additional_data.as_bytes();

    // Encrypt
    let ciphertext = xchacha20poly1305_ietf::seal(val.as_bytes(), Some(aad), &nonce, &key);

    // Format as nonce_hex:ciphertext_hex
    let nonce_hex = hex::encode(nonce.as_ref());
    let ciphertext_hex = hex::encode(&ciphertext);

    Ok((nonce_hex, ciphertext_hex))
}

pub fn decrypt_workspace_str(workspace_id: Uuid, nonce: &str, encrypted: &str) -> Result<String> {
    let key = get_key_from_env()?;

    // Decode hex
    let nonce_bytes =
        hex::decode(nonce).map_err(|e| anyhow!("Failed to decode nonce from hex: {}", e))?;
    let ciphertext_bytes = hex::decode(encrypted)
        .map_err(|e| anyhow!("Failed to decode ciphertext from hex: {}", e))?;

    // Create nonce
    let nonce = xchacha20poly1305_ietf::Nonce::from_slice(&nonce_bytes)
        .ok_or_else(|| anyhow!("Invalid nonce length, expected 24 bytes"))?;

    // Use workspace_id as additional authenticated data
    let additional_data = workspace_id.to_string();
    let aad = additional_data.as_bytes();

    // Decrypt
    let plaintext_bytes = xchacha20poly1305_ietf::open(&ciphertext_bytes, Some(aad), &nonce, &key)
        .map_err(|_| anyhow!("Failed to decrypt (authentication failed or corrupted data)"))?;

    // Convert to string
    String::from_utf8(plaintext_bytes)
        .map_err(|e| anyhow!("Decrypted data is not valid UTF-8: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        // Set up test environment
        unsafe {
            std::env::set_var(
                "AEAD_SECRET_KEY",
                "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            );
        }
        sodiumoxide::init().unwrap();

        let workspace_id = uuid::uuid!("00000000-0000-0000-0000-000000000000");
        let url = "http://localhost:80";

        let (nonce, encrypted) = encrypt_workspace_str(workspace_id, url).unwrap();
        let decrypted = decrypt_workspace_str(workspace_id, &nonce, &encrypted).unwrap();
        assert_eq!(decrypted, url);

        println!("encrypted: {}", encrypted);
    }

    #[test]
    fn test_decrypt_with_wrong_workspace_id_fails() {
        unsafe {
            std::env::set_var(
                "AEAD_SECRET_KEY",
                "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            );
        }
        sodiumoxide::init().unwrap();

        let workspace_id = Uuid::new_v4();
        let wrong_workspace_id = Uuid::new_v4();
        let url = "https://data-plane.example.com";

        let (nonce, encrypted) = encrypt_workspace_str(workspace_id, url).unwrap();

        // Attempt to decrypt with wrong workspace_id should fail
        let result = decrypt_workspace_str(wrong_workspace_id, &nonce, &encrypted);
        assert!(result.is_err());
    }
}
