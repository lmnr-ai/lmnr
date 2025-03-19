use std::collections::HashMap;

use sodiumoxide::{
    crypto::aead::xchacha20poly1305_ietf::{gen_nonce, open, seal, Key, Nonce},
    hex,
};

use anyhow::Result;
use sqlx::PgPool;
use uuid::Uuid;

use crate::db;

pub async fn insert_cookies(
    pool: &PgPool,
    user_id: &Uuid,
    cookies: &Vec<HashMap<String, String>>,
) -> Result<()> {
    let (cookies, nonces): (Vec<String>, Vec<String>) = cookies
        .iter()
        .map(|cookie| {
            let key_hex = std::env::var("AEAD_SECRET_KEY").unwrap();
            let key = Key::from_slice(hex::decode(key_hex).unwrap().as_slice()).unwrap();

            let cookie_json = serde_json::to_string(cookie).unwrap();
            let nonce = gen_nonce();
            let encrypted = seal(&cookie_json.as_bytes(), None, &nonce, &key);

            (hex::encode(encrypted), hex::encode(nonce))
        })
        .unzip();

    db::user_cookies::insert_user_cookies(pool, user_id, &cookies, &nonces).await?;

    Ok(())
}

pub async fn get_cookies(pool: &PgPool, user_id: &Uuid) -> Result<Vec<HashMap<String, String>>> {
    let encrypted_cookies = db::user_cookies::get_user_cookies(pool, user_id).await?;

    let cookies = encrypted_cookies
        .into_iter()
        .map(|encrypted_cookie| {
            let key_hex = std::env::var("AEAD_SECRET_KEY").unwrap();
            let key = Key::from_slice(hex::decode(key_hex).unwrap().as_slice()).unwrap();

            let encrypted = hex::decode(encrypted_cookie.cookies).or(Err(anyhow::anyhow!(
                "Failed to decode hex value for cookie",
            )))?;
            let nonce_bytes = hex::decode(encrypted_cookie.nonce).or(Err(anyhow::anyhow!(
                "Failed to decode hex nonce for cookie",
            )))?;

            let nonce = Nonce::from_slice(nonce_bytes.as_slice()).ok_or(anyhow::anyhow!(
                "Failed to convert nonce bytes to Nonce for cookie",
            ))?;
            let decrypted =
                open(encrypted.as_slice(), None, &nonce, &key).expect("Failed to decrypt cookie");

            Ok(serde_json::from_slice(&decrypted).unwrap())
        })
        .collect();

    cookies
}
