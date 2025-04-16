use sqlx::PgPool;
use uuid::Uuid;

pub async fn update_agent_chat_status(
    pool: &PgPool,
    agent_status: &str,
    updated_at: chrono::DateTime<chrono::Utc>,
    session_id: &Uuid,
) -> anyhow::Result<()> {
    sqlx::query(
        "UPDATE agent_chats
        SET agent_status = $1, updated_at = $2
        WHERE session_id = $3",
    )
    .bind(agent_status)
    .bind(updated_at)
    .bind(session_id)
    .execute(pool)
    .await?;

    Ok(())
}
