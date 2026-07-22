use anyhow::Result;
use sqlx::PgPool;
use uuid::Uuid;

/// Look up a user's email by id. Used by CLI handlers: the CLI BetterAuth JWT
/// carries only `userId` (no email), but signal creation subscribes the creator
/// as an EMAIL alert target, so the email is resolved here.
pub async fn get_user_email(pool: &PgPool, user_id: Uuid) -> Result<Option<String>> {
    let email = sqlx::query_scalar::<_, String>("SELECT email FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(pool)
        .await?;
    Ok(email)
}
