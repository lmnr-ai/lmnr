use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use crate::ch::traces::TraceAggregation;

pub const TRACE_BLOCK_TYPE: &str = "trace";
pub const EVALUATION_BLOCK_TYPE: &str = "evaluation";

const SESSION_ID_METADATA_KEY: &str = "rollout.session_id";

// `traces.type` DEFAULT (see `Into<u8> for TraceType` in `ch/spans.rs`).
const DEFAULT_TRACE_TYPE: u8 = 0;

/// Deterministic block id: re-processing the same entity for the same session
/// always lands on the same row, so ingest retries and repeated span flushes
/// collapse into one block via ON CONFLICT.
fn block_id(session_id: &Uuid, block_type: &str, entity_id: &Uuid) -> Uuid {
    Uuid::new_v5(session_id, format!("{block_type}:{entity_id}").as_bytes())
}

/// Deterministic id of an evaluation block, for realtime payloads to match the
/// row `get_blocks_for_session` returns.
pub fn evaluation_block_id(session_id: &Uuid, evaluation_id: &Uuid) -> Uuid {
    block_id(session_id, EVALUATION_BLOCK_TYPE, evaluation_id)
}

/// Upsert a block into a debugger session. `created_at` comes from the source
/// entity (trace start_time / evaluation created_at) so blocks order by when
/// the entity happened, not when ingestion ran. The insert is gated on the
/// session existing in the same project (sessions are registered explicitly),
/// so an unregistered or cross-project session id is a silent no-op instead of
/// an FK error. On conflict `content` is refreshed and `created_at` keeps the
/// earliest seen, so ordering stays stable across re-ingest / repeated flushes.
pub async fn upsert_session_block(
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
                created_at = LEAST(debugger_session_blocks.created_at, EXCLUDED.created_at)
            WHERE debugger_session_blocks.project_id = $2
                AND debugger_session_blocks.session_id = $3",
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

/// Append a standalone block to a session, returning the new block id.
///
/// Unlike `upsert_session_block` (deterministic id keyed on a source trace /
/// eval so re-ingest collapses onto one row), this mints a fresh `entity_id`
/// per call so repeated notes append distinct blocks rather than overwriting.
/// Like `upsert_session_block`, the insert is gated on the session existing in the same
/// project via `WHERE EXISTS`; when it doesn't, no row is written and `None` is
/// returned so the caller can surface a real 404.
pub async fn insert_block(
    pool: &PgPool,
    project_id: &Uuid,
    session_id: &Uuid,
    block_type: &str,
    content: &Value,
) -> Result<Option<(Uuid, DateTime<Utc>)>> {
    let entity_id = Uuid::now_v7();
    let id = block_id(session_id, block_type, &entity_id);
    let created_at = Utc::now();

    let result = sqlx::query(
        "INSERT INTO debugger_session_blocks (id, project_id, session_id, type, content, created_at)
        SELECT $1, $2, $3, $4, $5, $6
        WHERE EXISTS (SELECT 1 FROM debugger_sessions WHERE id = $3 AND project_id = $2)",
    )
    .bind(id)
    .bind(project_id)
    .bind(session_id)
    .bind(block_type)
    .bind(content)
    .bind(created_at)
    .execute(pool)
    .await?;

    Ok((result.rows_affected() > 0).then_some((id, created_at)))
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

/// Upsert a `trace` block for every trace whose per-batch span aggregation
/// carries the `rollout.session_id` metadata key. Best-effort: a failed upsert
/// is logged and never fails ingest.
pub async fn upsert_blocks_for_traces(pool: &PgPool, aggregations: &[TraceAggregation]) {
    for agg in aggregations {
        // Only DEFAULT traces become trace blocks (eval traces → evaluation blocks).
        if agg.trace_type != DEFAULT_TRACE_TYPE {
            continue;
        }

        let Some(session_id) = session_id_from_metadata(agg.metadata.as_ref()) else {
            continue;
        };

        let content = serde_json::json!({ "traceId": agg.trace_id.to_string() });

        if let Err(e) = upsert_session_block(
            pool,
            &agg.project_id,
            &session_id,
            TRACE_BLOCK_TYPE,
            &agg.trace_id,
            &content,
            &agg.start_time.unwrap_or_else(Utc::now),
        )
        .await
        {
            log::error!(
                "Failed to upsert trace debugger session block. trace_id: {}, session_id: {}, error: {:?}",
                agg.trace_id,
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

    // Eval blocks are pure references — notes live only in standalone text blocks.
    let content = serde_json::json!({ "evaluationId": evaluation_id.to_string() });

    if let Err(e) = upsert_session_block(
        pool,
        project_id,
        &session_id,
        EVALUATION_BLOCK_TYPE,
        evaluation_id,
        &content,
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
