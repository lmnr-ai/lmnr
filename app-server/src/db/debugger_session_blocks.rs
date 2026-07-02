use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use super::trace::Trace;

pub const TRACE_BLOCK_TYPE: &str = "trace";
pub const EVALUATION_BLOCK_TYPE: &str = "evaluation";

const SESSION_ID_METADATA_KEY: &str = "rollout.session_id";
const NOTE_METADATA_KEY: &str = "rollout.note";

/// Deterministic block id: re-processing the same entity for the same session
/// always lands on the same row, so ingest retries and repeated span flushes
/// collapse into one block via ON CONFLICT.
fn block_id(session_id: &Uuid, block_type: &str, entity_id: &Uuid) -> Uuid {
    Uuid::new_v5(session_id, format!("{block_type}:{entity_id}").as_bytes())
}

/// Upsert a block into a debugger session. `created_at` comes from the source
/// entity (trace start_time / evaluation created_at) so blocks order by when
/// the entity happened, not when ingestion ran. The insert is gated on the
/// session existing in the same project (sessions are registered explicitly),
/// so an unregistered or cross-project session id is a silent no-op instead of
/// an FK error. On conflict `content` and `created_at` are refreshed (e.g. a
/// live note update, or a trace start_time moving earlier as spans arrive).
pub async fn upsert_block(
    pool: &PgPool,
    project_id: &Uuid,
    session_id: &Uuid,
    block_type: &str,
    entity_id: &Uuid,
    content: &Value,
    created_at: &DateTime<Utc>,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO debugger_session_blocks (id, project_id, session_id, type, content, created_at)
        SELECT $1, $2, $3, $4, $5, $6
        WHERE EXISTS (SELECT 1 FROM debugger_sessions WHERE id = $3 AND project_id = $2)
        ON CONFLICT (id) DO UPDATE
            SET content = EXCLUDED.content,
                created_at = EXCLUDED.created_at
            WHERE debugger_session_blocks.project_id = $2",
    )
    .bind(block_id(session_id, block_type, entity_id))
    .bind(project_id)
    .bind(session_id)
    .bind(block_type)
    .bind(content)
    .bind(created_at)
    .execute(pool)
    .await?;

    Ok(())
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DebuggerSessionBlock {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    #[serde(rename = "type")]
    #[sqlx(rename = "type")]
    pub block_type: String,
    pub content: Value,
}

pub async fn get_blocks_for_session(
    pool: &PgPool,
    project_id: &Uuid,
    session_id: &Uuid,
) -> Result<Vec<DebuggerSessionBlock>> {
    let blocks = sqlx::query_as::<_, DebuggerSessionBlock>(
        "SELECT id, created_at, type, content
        FROM debugger_session_blocks
        WHERE project_id = $1 AND session_id = $2
        ORDER BY created_at ASC",
    )
    .bind(project_id)
    .bind(session_id)
    .fetch_all(pool)
    .await?;

    Ok(blocks)
}

fn session_id_from_metadata(metadata: Option<&Value>) -> Option<Uuid> {
    metadata
        .and_then(|m| m.get(SESSION_ID_METADATA_KEY))
        .and_then(|v| v.as_str())
        .and_then(|s| Uuid::parse_str(s).ok())
}

fn note_from_metadata(metadata: Option<&Value>) -> Option<&str> {
    metadata
        .and_then(|m| m.get(NOTE_METADATA_KEY))
        .and_then(|v| v.as_str())
}

/// Upsert a `trace` block for every trace carrying the `rollout.session_id`
/// metadata key. Best-effort: a failed upsert is logged and never fails ingest.
pub async fn upsert_blocks_for_traces(pool: &PgPool, traces: &[Trace]) {
    for trace in traces {
        let Some(session_id) = session_id_from_metadata(trace.metadata()) else {
            continue;
        };

        let mut content = serde_json::Map::new();
        content.insert("traceId".to_string(), Value::String(trace.id().to_string()));
        if let Some(note) = note_from_metadata(trace.metadata()) {
            content.insert("note".to_string(), Value::String(note.to_string()));
        }

        if let Err(e) = upsert_block(
            pool,
            &trace.project_id(),
            &session_id,
            TRACE_BLOCK_TYPE,
            &trace.id(),
            &Value::Object(content),
            &trace.start_time().unwrap_or(Utc::now()),
        )
        .await
        {
            log::error!(
                "Failed to upsert trace debugger session block. trace_id: {}, session_id: {}, error: {:?}",
                trace.id(),
                session_id,
                e
            );
        }
    }
}

/// Upsert an `evaluation` block when an eval is created with the
/// `rollout.session_id` metadata key. Best-effort.
pub async fn upsert_block_for_evaluation(
    pool: &PgPool,
    project_id: &Uuid,
    evaluation_id: &Uuid,
    metadata: Option<&Value>,
    created_at: &DateTime<Utc>,
) {
    let Some(session_id) = session_id_from_metadata(metadata) else {
        return;
    };

    let mut content = serde_json::Map::new();
    content.insert(
        "evaluationId".to_string(),
        Value::String(evaluation_id.to_string()),
    );
    if let Some(note) = note_from_metadata(metadata) {
        content.insert("note".to_string(), Value::String(note.to_string()));
    }

    if let Err(e) = upsert_block(
        pool,
        project_id,
        &session_id,
        EVALUATION_BLOCK_TYPE,
        evaluation_id,
        &Value::Object(content),
        created_at,
    )
    .await
    {
        log::error!(
            "Failed to upsert evaluation debugger session block. evaluation_id: {}, session_id: {}, error: {:?}",
            evaluation_id,
            session_id,
            e
        );
    }
}
