use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

pub async fn insert_agent_message(
    pool: &PgPool,
    id: &Uuid,
    chat_id: &Uuid,
    user_id: &Uuid,
    message_type: &str,
    content: &Value,
) -> anyhow::Result<()> {
    sqlx::query(
        "INSERT INTO agent_messages (
        id,
        chat_id,
        user_id,
        message_type,
        content
    ) VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(id)
    .bind(chat_id)
    .bind(user_id)
    .bind(message_type)
    .bind(content)
    .execute(pool)
    .await?;

    Ok(())
}
