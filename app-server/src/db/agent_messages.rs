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

pub async fn update_agent_state(
    pool: &PgPool,
    chat_id: &Uuid,
    state: &Value,
) -> anyhow::Result<()> {
    sqlx::query("UPDATE agent_sessions SET state = $2 WHERE chat_id = $1")
        .bind(chat_id)
        .bind(state)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn get_agent_state(pool: &PgPool, chat_id: &Uuid) -> anyhow::Result<Option<Value>> {
    let state: Option<Option<Value>> =
        sqlx::query_scalar("SELECT state FROM agent_sessions WHERE chat_id = $1")
            .bind(chat_id)
            .fetch_optional(pool)
            .await?;

    Ok(state.flatten())
}
