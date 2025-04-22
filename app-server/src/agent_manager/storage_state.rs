use sodiumoxide::{
    crypto::aead::xchacha20poly1305_ietf::{gen_nonce, open, seal, Key, Nonce},
    hex,
};

use anyhow::Result;
use sqlx::PgPool;
use uuid::Uuid;

use crate::db;

pub async fn insert_storage_state(
    pool: &PgPool,
    user_id: &Uuid,
    storage_state: &String,
) -> Result<()> {
    let key_hex = std::env::var("AEAD_SECRET_KEY").unwrap();
    let key = Key::from_slice(hex::decode(key_hex).unwrap().as_slice()).unwrap();

    let nonce = gen_nonce();
    let encrypted = seal(&storage_state.as_bytes(), None, &nonce, &key);
    let encrypted_storage_state = hex::encode(encrypted);
    let nonce_str = hex::encode(nonce);

    db::user_cookies::insert_user_cookies(
        pool,
        user_id,
        &vec![encrypted_storage_state],
        &vec![nonce_str],
    )
    .await?;

    Ok(())
}

pub async fn get_storage_state(pool: &PgPool, user_id: &Uuid) -> Result<String> {
    let encrypted_storage_state = db::user_cookies::get_user_cookies(pool, user_id).await?;

    encrypted_storage_state
        .into_iter()
        .next()
        .ok_or(anyhow::anyhow!("No storage state found"))
        .map(|state_and_nonce| {
            let key_hex = std::env::var("AEAD_SECRET_KEY").unwrap();
            let key = Key::from_slice(hex::decode(key_hex).unwrap().as_slice()).unwrap();

            let encrypted = hex::decode(state_and_nonce.cookies).or(Err(anyhow::anyhow!(
                "Failed to decode hex value for storage state",
            )))?;
            let nonce_bytes = hex::decode(state_and_nonce.nonce).or(Err(anyhow::anyhow!(
                "Failed to decode hex nonce for storage state",
            )))?;

            let nonce = Nonce::from_slice(nonce_bytes.as_slice()).ok_or(anyhow::anyhow!(
                "Failed to convert nonce bytes to Nonce for storage state",
            ))?;
            let decrypted = open(encrypted.as_slice(), None, &nonce, &key)
                .expect("Failed to decrypt storage state");

            Ok(String::from_utf8(decrypted).unwrap())
        })?
}
