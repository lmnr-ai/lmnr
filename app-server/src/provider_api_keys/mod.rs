use anyhow::Result;
use sodiumoxide::{
    crypto::aead::xchacha20poly1305_ietf::{gen_nonce, open, seal, Key, Nonce},
    hex,
};

pub struct ValueAndNonceHex {
    pub value: String,
    pub nonce: String, // 192 bytes (384 hex characters)
}

pub fn encode_api_key(name: &String, api_key: &String) -> ValueAndNonceHex {
    let key_hex = std::env::var("AEAD_SECRET_KEY").unwrap();
    let key = Key::from_slice(hex::decode(key_hex).unwrap().as_slice()).unwrap();

    let nonce = gen_nonce();

    dbg!(&nonce.0);

    let encrypted = seal(api_key.as_bytes(), Some(name.as_bytes()), &nonce, &key);

    ValueAndNonceHex {
        value: hex::encode(encrypted),
        nonce: hex::encode(nonce),
    }
}

pub fn decode_api_key(name: &String, nonce: &String, value: &String) -> Result<String> {
    dbg!(name, value, nonce);
    let key_hex = std::env::var("AEAD_SECRET_KEY").unwrap();
    let key = Key::from_slice(hex::decode(key_hex).unwrap().as_slice()).unwrap();

    let encrypted = hex::decode(value).or(Err(anyhow::anyhow!(
        "Failed to decode hex value for api_key {}",
        name
    )))?;
    let nonce_bytes = hex::decode(nonce).or(Err(anyhow::anyhow!(
        "Failed to decode hex nonce for api_key {}",
        name
    )))?;

    let nonce = Nonce::from_slice(nonce_bytes.as_slice()).ok_or(anyhow::anyhow!(
        "Failed to convert nonce bytes to Nonce for api_key {}",
        name
    ))?;

    let decrypted = open(encrypted.as_slice(), Some(name.as_bytes()), &nonce, &key).unwrap();

    String::from_utf8(decrypted).or(Err(anyhow::anyhow!(
        "Failed to convert decrypted bytes to utf8 for api_key {}",
        name
    )))
}
