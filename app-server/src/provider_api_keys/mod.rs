use sodiumoxide::{
    crypto::aead::xchacha20poly1305_ietf::{Key, gen_nonce, seal},
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
    let encrypted = seal(api_key.as_bytes(), Some(name.as_bytes()), &nonce, &key);

    ValueAndNonceHex {
        value: hex::encode(encrypted),
        nonce: hex::encode(nonce),
    }
}
