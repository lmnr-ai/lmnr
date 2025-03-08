use serde_json::Value;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

#[derive(FromRow)]
pub struct DBAgentMessage {
    pub id: Uuid,
    pub chat_id: Uuid,
    pub user_id: Uuid,
    pub message_type: String,
    pub content: Value,
}

pub async fn get_chat_messages(
    pool: &PgPool,
    chat_id: &Uuid,
    user_id: &Uuid,
) -> anyhow::Result<Vec<DBAgentMessage>> {
    let messages = sqlx::query_as::<_, DBAgentMessage>(
        "SELECT
            id,
            chat_id,
            user_id,
            message_type,
            content
        FROM
            agent_messages
        WHERE
            chat_id = $1
            AND user_id = $2
        ORDER BY
            created_at
        ",
    )
    .bind(chat_id)
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(messages)
}

pub async fn insert_agent_message(
    pool: &PgPool,
    chat_id: &Uuid,
    user_id: &Uuid,
    message_type: &str,
    content: &Value,
) -> anyhow::Result<()> {
    sqlx::query(
        "INSERT INTO agent_messages (
        chat_id,
        user_id,
        message_type,
        content
    ) VALUES ($1, $2, $3, $4)",
    )
    .bind(chat_id)
    .bind(user_id)
    .bind(message_type)
    .bind(content)
    .execute(pool)
    .await?;

    Ok(())
}
