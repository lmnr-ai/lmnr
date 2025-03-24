use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(sqlx::Type, Clone, PartialEq)]
#[sqlx(type_name = "agent_message_type")]
pub enum MessageType {
    #[sqlx(rename = "user")]
    User,
    #[sqlx(rename = "step")]
    Step,
    #[sqlx(rename = "assistant")]
    Assistant,
}

pub async fn insert_agent_message(
    pool: &PgPool,
    id: &Uuid,
    chat_id: &Uuid,
    user_id: &Uuid,
    message_type: &MessageType,
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

    sqlx::query("UPDATE agent_sessions SET updated_at = now() WHERE chat_id = $1")
        .bind(chat_id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn update_agent_user_id(
    pool: &PgPool,
    chat_id: &Uuid,
    user_id: &Uuid,
) -> anyhow::Result<()> {
    sqlx::query("UPDATE agent_sessions SET user_id = $1, updated_at = now() WHERE chat_id = $2")
        .bind(user_id)
        .bind(chat_id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn update_agent_state(
    pool: &PgPool,
    session_id: &Uuid,
    state: &String,
    user_id: &Uuid,
) -> anyhow::Result<()> {
    sqlx::query(
        "UPDATE
            agent_sessions
        SET
            state = $2,
            updated_at = now(),
            user_id = $3
        WHERE
            chat_id = $1",
    )
    .bind(session_id)
    .bind(state)
    .bind(user_id)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn get_agent_state(pool: &PgPool, chat_id: &Uuid) -> anyhow::Result<Option<String>> {
    // Nested option: either the row is not found, or the state is null
    let state: Option<Option<String>> =
        sqlx::query_scalar("SELECT state FROM agent_sessions WHERE chat_id = $1")
            .bind(chat_id)
            .fetch_optional(pool)
            .await?;

    Ok(state.flatten())
}
