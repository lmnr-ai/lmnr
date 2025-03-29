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
    session_id: &Uuid,
    user_id: &Uuid,
    trace_id: &Uuid,
    message_type: &MessageType,
    content: &Value,
    created_at: &chrono::DateTime<chrono::Utc>,
) -> anyhow::Result<()> {
    sqlx::query(
        "INSERT INTO agent_messages (
        id,
        session_id,
        user_id,
        trace_id,
        message_type,
        content,
        created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(id)
    .bind(session_id)
    .bind(user_id)
    .bind(trace_id)
    .bind(message_type)
    .bind(content)
    .bind(created_at)
    .execute(pool)
    .await?;

    // TODO: Run these DB tasks in parallel or drop updated_at in one of the tables
    if let Err(e) =
        sqlx::query("UPDATE agent_sessions SET updated_at = now() WHERE session_id = $1")
            .bind(session_id)
            .execute(pool)
            .await
    {
        log::error!("Error updating agent session: {}", e);
    }
    if let Err(e) = sqlx::query("UPDATE agent_chats SET updated_at = now() WHERE session_id = $1")
        .bind(session_id)
        .execute(pool)
        .await
    {
        log::error!("Error updating agent session: {}", e);
    }

    Ok(())
}
