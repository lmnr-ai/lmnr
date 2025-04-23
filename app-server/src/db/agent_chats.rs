use sqlx::PgPool;
use uuid::Uuid;

pub async fn update_agent_chat_status(
    pool: &PgPool,
    agent_status: &str,
    session_id: &Uuid,
) -> anyhow::Result<()> {
    sqlx::query(
        "UPDATE agent_chats
        SET agent_status = $1, updated_at = now()
        WHERE session_id = $2",
    )
    .bind(agent_status)
    .bind(session_id)
    .execute(pool)
    .await?;

    Ok(())
}
