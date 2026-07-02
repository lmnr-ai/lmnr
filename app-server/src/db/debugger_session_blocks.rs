use anyhow::Result;
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

pub const TRACE_BLOCK_TYPE: &str = "trace";
pub const EVALUATION_BLOCK_TYPE: &str = "evaluation";
pub const TEXT_BLOCK_TYPE: &str = "text";

pub const ALLOWED_BLOCK_TYPES: [&str; 3] =
    [TRACE_BLOCK_TYPE, EVALUATION_BLOCK_TYPE, TEXT_BLOCK_TYPE];

/// Deterministic block id: re-upserting the same entity for the same session
/// lands on the same row, so client retries collapse via ON CONFLICT.
pub fn deterministic_block_id(session_id: &Uuid, block_type: &str, entity_id: &Uuid) -> Uuid {
    Uuid::new_v5(session_id, format!("{block_type}:{entity_id}").as_bytes())
}

/// Upsert a block into a debugger session. The insert is gated on the session
/// existing in the same project (sessions are registered explicitly), so an
/// unregistered or cross-project session id is a no-op — returns `false` in
/// that case. On conflict only `content` is refreshed (e.g. a note update).
pub async fn upsert_block(
    pool: &PgPool,
    project_id: &Uuid,
    session_id: &Uuid,
    block_id: &Uuid,
    block_type: &str,
    content: &Value,
) -> Result<bool> {
    let result = sqlx::query(
        "INSERT INTO debugger_session_blocks (id, project_id, session_id, type, content)
        SELECT $1, $2, $3, $4, $5
        WHERE EXISTS (SELECT 1 FROM debugger_sessions WHERE id = $3 AND project_id = $2)
        ON CONFLICT (id) DO UPDATE
            SET content = EXCLUDED.content
            WHERE debugger_session_blocks.project_id = $2",
    )
    .bind(block_id)
    .bind(project_id)
    .bind(session_id)
    .bind(block_type)
    .bind(content)
    .execute(pool)
    .await?;

    Ok(result.rows_affected() > 0)
}
