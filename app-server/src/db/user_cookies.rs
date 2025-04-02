use anyhow::Result;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

pub async fn insert_user_cookies(
    pool: &PgPool,
    user_id: &Uuid,
    cookies: &Vec<String>,
    nonces: &Vec<String>,
) -> Result<()> {
    let mut transaction = pool.begin().await?;
    sqlx::query("DELETE FROM user_cookies WHERE user_id = $1")
        .bind(user_id)
        .execute(transaction.as_mut())
        .await?;

    sqlx::query(
        "INSERT INTO user_cookies (
            user_id,
            cookies,
            nonce
        ) VALUES ($1, UNNEST($2::text[]), UNNEST($3::text[]))",
    )
    .bind(user_id)
    .bind(cookies)
    .bind(nonces)
    .execute(transaction.as_mut())
    .await?;

    transaction.commit().await?;

    Ok(())
}

#[derive(FromRow)]
pub struct CookieAndNonce {
    pub cookies: String,
    pub nonce: String,
}

pub async fn get_user_cookies(pool: &PgPool, user_id: &Uuid) -> Result<Vec<CookieAndNonce>> {
    let cookies = sqlx::query_as::<_, CookieAndNonce>(
        "SELECT cookies, nonce FROM user_cookies WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(cookies)
}
