use anyhow::{Result, anyhow};
use chacha20poly1305::{
    Key, XChaCha20Poly1305, XNonce,
    aead::{Aead, Generate, KeyInit, Payload},
};
use uuid::Uuid;

/// Get the encryption key from the AEAD_SECRET_KEY environment variable
fn cipher_from_env() -> Result<XChaCha20Poly1305> {
    let key_hex = std::env::var(crate::env::secrets::AEAD_SECRET_KEY)
        .map_err(|_| anyhow!("AEAD_SECRET_KEY environment variable not set"))?;

    let key_bytes = hex::decode(&key_hex)
        .map_err(|e| anyhow!("Failed to decode AEAD_SECRET_KEY from hex: {}", e))?;

    let key = Key::try_from(&key_bytes[..]).map_err(|_| {
        anyhow!(
            "AEAD_SECRET_KEY must be 32 bytes (64 hex characters), got {} bytes",
            key_bytes.len()
        )
    })?;

    Ok(XChaCha20Poly1305::new(&key))
}

#[allow(dead_code)]
pub fn encrypt(workspace_id: Uuid, val: &str) -> Result<(String, String)> {
    let cipher = cipher_from_env()?;

    // Generate random nonce (24 bytes for XChaCha20-Poly1305)
    let nonce = XNonce::try_generate().map_err(|e| anyhow!("Failed to generate nonce: {}", e))?;

    // Use workspace_id as additional authenticated data
    let additional_data = workspace_id.to_string();

    // Encrypt; the 16-byte Poly1305 tag is appended to the ciphertext (libsodium "combined" mode).
    let ciphertext = cipher
        .encrypt(
            &nonce,
            Payload {
                msg: val.as_bytes(),
                aad: additional_data.as_bytes(),
            },
        )
        .map_err(|_| anyhow!("Failed to encrypt"))?;

    // Format as nonce_hex:ciphertext_hex
    let nonce_hex = hex::encode(nonce);
    let ciphertext_hex = hex::encode(&ciphertext);

    Ok((nonce_hex, ciphertext_hex))
}

pub fn decrypt(workspace_id: Uuid, nonce: &str, encrypted: &str) -> Result<String> {
    let cipher = cipher_from_env()?;

    // Decode hex
    let nonce_bytes =
        hex::decode(nonce).map_err(|e| anyhow!("Failed to decode nonce from hex: {}", e))?;
    let ciphertext_bytes = hex::decode(encrypted)
        .map_err(|e| anyhow!("Failed to decode ciphertext from hex: {}", e))?;

    let nonce = XNonce::try_from(&nonce_bytes[..])
        .map_err(|_| anyhow!("Invalid nonce length, expected 24 bytes"))?;

    // Use workspace_id as additional authenticated data
    let additional_data = workspace_id.to_string();

    // Decrypt
    let plaintext_bytes = cipher
        .decrypt(
            &nonce,
            Payload {
                msg: &ciphertext_bytes,
                aad: additional_data.as_bytes(),
            },
        )
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
                crate::env::secrets::AEAD_SECRET_KEY,
                "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            );
        }

        let workspace_id = uuid::uuid!("00000000-0000-0000-0000-000000000000");
        let url = "http://localhost:80";

        let (nonce, encrypted) = encrypt(workspace_id, url).unwrap();
        let decrypted = decrypt(workspace_id, &nonce, &encrypted).unwrap();
        assert_eq!(decrypted, url);

        println!("encrypted: {}", encrypted);
    }

    #[test]
    fn test_decrypt_with_wrong_workspace_id_fails() {
        unsafe {
            std::env::set_var(
                crate::env::secrets::AEAD_SECRET_KEY,
                "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            );
        }

        let workspace_id = Uuid::new_v4();
        let wrong_workspace_id = Uuid::new_v4();
        let url = "https://data-plane.example.com";

        let (nonce, encrypted) = encrypt(workspace_id, url).unwrap();

        // Attempt to decrypt with wrong workspace_id should fail
        let result = decrypt(wrong_workspace_id, &nonce, &encrypted);
        assert!(result.is_err());
    }

    /// Ciphertexts already in the DB were produced by libsodium (frontend `lib/crypto.ts`,
    /// previously sodiumoxide here). Pinned vector proves the RustCrypto port reads them.
    #[test]
    fn test_decrypts_libsodium_ciphertext() {
        unsafe {
            std::env::set_var(
                crate::env::secrets::AEAD_SECRET_KEY,
                "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            );
        }

        let decrypted = decrypt(
            uuid::uuid!("00000000-0000-0000-0000-000000000000"),
            "070707070707070707070707070707070707070707070707",
            "34bb5c03be7295b9ea0d002f33bfa979e0dedb9662a019adc02e6107090d5c950fe3e0",
        )
        .unwrap();
        assert_eq!(decrypted, "http://localhost:80");
    }
}
