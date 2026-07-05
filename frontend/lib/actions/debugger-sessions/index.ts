import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { type TraceViewTrace } from "@/components/traces/trace-view/store";
import { PaginationSchema } from "@/lib/actions/common/types";
import { executeQuery } from "@/lib/actions/sql";
import { tracesSelectColumns } from "@/lib/actions/traces/utils";
import { db } from "@/lib/db/drizzle";
import { debuggerSessionBlocks, debuggerSessions, evaluations, sharedTraces } from "@/lib/db/migrations/schema";
import { NotFoundError } from "@/lib/errors";
import { type TraceRow } from "@/lib/traces/types";

// Metadata keys evals share with this view's traces: the session link and the
// agent-authored note (markdown). Same `rollout.*` convention the trace notes
// rendered in this view already use.
const SESSION_ID_METADATA_KEY = "rollout.session_id";
const NOTE_METADATA_KEY = "rollout.note";

export type DebuggerSession = {
  id: string;
  createdAt: string;
  name: string | null;
  projectId: string;
  // Last time a trace finished for this session (max trace end_time, from
  // ClickHouse). Null when the session has no traces yet.
  lastActivity: string | null;
  // Number of traces grouped to this session (from ClickHouse).
  traceCount: number;
  // Number of evals linked via the `rollout.session_id` metadata key.
  evalCount: number;
};

const GetDebuggerSessionSchema = z.object({
  projectId: z.guid(),
  id: z.guid(),
});

export const GetDebuggerSessionsSchema = PaginationSchema.extend({
  projectId: z.guid(),
});

export const getDebuggerSessions = async (input: z.infer<typeof GetDebuggerSessionsSchema>) => {
  const { projectId, pageNumber, pageSize } = input;

  const limit = pageSize;
  const offset = Math.max(0, pageNumber * pageSize);

  const rows = await db
    .select()
    .from(debuggerSessions)
    .where(eq(debuggerSessions.projectId, projectId))
    .orderBy(desc(debuggerSessions.createdAt))
    .limit(limit)
    .offset(offset);

  const sessionIds = rows.map((r) => r.id);
  const [statsById, evalCountsById] = await Promise.all([
    getStatsBySessionIds(projectId, sessionIds),
    getEvalCountsBySessionIds(projectId, sessionIds),
  ]);

  const items: DebuggerSession[] = rows.map((row) => ({
    ...row,
    lastActivity: statsById.get(row.id)?.lastActivity ?? null,
    traceCount: statsById.get(row.id)?.traceCount ?? 0,
    evalCount: evalCountsById.get(row.id) ?? 0,
  }));

  return { items };
};

// Per-session eval counts: `evaluation` blocks first, legacy
// `rollout.session_id` metadata for sessions without blocks. Best-effort — a
// query error returns an empty map.
async function getEvalCountsBySessionIds(projectId: string, sessionIds: string[]): Promise<Map<string, number>> {
  if (sessionIds.length === 0) return new Map();

  try {
    // `metadata->>key IN (...)` — `inArray` over a computed JSON expression
    // doesn't build correctly here.
    const inList = sql.join(
      sessionIds.map((id) => sql`${id}`),
      sql`, `
    );
    const [blockRows, metadataRows] = await Promise.all([
      db
        .select({
          sessionId: debuggerSessionBlocks.sessionId,
          count: sql<number>`count(*)::int`,
        })
        .from(debuggerSessionBlocks)
        .where(
          and(
            eq(debuggerSessionBlocks.projectId, projectId),
            eq(debuggerSessionBlocks.type, EVALUATION_BLOCK_TYPE),
            inArray(debuggerSessionBlocks.sessionId, sessionIds)
          )
        )
        .groupBy(debuggerSessionBlocks.sessionId),
      db
        .select({ sessionId: sql<string>`${evaluations.metadata} ->> ${SESSION_ID_METADATA_KEY}` })
        .from(evaluations)
        .where(
          and(
            eq(evaluations.projectId, projectId),
            sql`${evaluations.metadata} ->> ${SESSION_ID_METADATA_KEY} IN (${inList})`
          )
        ),
    ]);

    const counts = new Map<string, number>();
    for (const row of metadataRows) {
      if (!row.sessionId) continue;
      counts.set(row.sessionId, (counts.get(row.sessionId) ?? 0) + 1);
    }
    // Blocks are authoritative when present.
    for (const row of blockRows) {
      counts.set(row.sessionId, row.count);
    }
    return counts;
  } catch {
    return new Map();
  }
}

type SessionStats = { lastActivity: string; traceCount: number };

/**
 * Per-session trace stats from ClickHouse: max(end_time) and trace count,
 * grouped by the `rollout.session_id` trace-metadata key, scoped to the given
 * session ids. Best-effort — a CH error returns an empty map so the sessions
 * list still renders (just without "last activity" / trace counts).
 *
 * `traceCount` counts only DEFAULT traces (the agent runs the session view
 * renders); EVALUATION traces are surfaced separately via the eval count, so
 * they must not inflate the run count. `lastActivity` still spans all traces
 * so eval-only activity keeps a session's timestamp fresh.
 */
async function getStatsBySessionIds(projectId: string, sessionIds: string[]): Promise<Map<string, SessionStats>> {
  if (sessionIds.length === 0) return new Map();

  try {
    const rows = await executeQuery<{ sessionId: string; lastActivity: string; traceCount: string }>({
      query: `
        SELECT
          simpleJSONExtractString(metadata, 'rollout.session_id') AS sessionId,
          formatDateTime(max(end_time), '%Y-%m-%dT%H:%i:%S.%fZ') AS lastActivity,
          count(DISTINCT id) AS traceCount
        FROM traces
        WHERE simpleJSONExtractString(metadata, 'rollout.session_id') IN ({sessionIds: Array(String)}) AND trace_type = 'DEFAULT'
        GROUP BY sessionId
      `,
      projectId,
      parameters: { sessionIds },
    });
    return new Map(rows.map((r) => [r.sessionId, { lastActivity: r.lastActivity, traceCount: Number(r.traceCount) }]));
  } catch {
    return new Map();
  }
}

export const CreateDebuggerSessionSchema = z.object({
  projectId: z.guid(),
  id: z.guid().optional(),
  name: z.string().optional(),
});

export const createDebuggerSession = async (input: z.infer<typeof CreateDebuggerSessionSchema>) => {
  const { projectId, id, name } = CreateDebuggerSessionSchema.parse(input);

  const [session] = await db
    .insert(debuggerSessions)
    .values({ ...(id ? { id } : {}), projectId, name })
    .onConflictDoUpdate({
      target: debuggerSessions.id,
      set: { name: sql`coalesce(${name ?? null}, ${debuggerSessions.name})` },
      // Scope the conflict update to the owning project so a caller supplying
      // another project's session id can't overwrite its name.
      setWhere: eq(debuggerSessions.projectId, projectId),
    })
    .returning();

  if (!session) {
    throw new Error("Session could not be created or updated");
  }

  return session;
};

export const UpdateDebuggerSessionNameSchema = z.object({
  projectId: z.guid(),
  id: z.guid(),
  name: z.string().trim().min(1),
});

/**
 * Rename a debugger session (update-only, project-scoped). Routes through
 * app-server rather than writing the row directly, because app-server also
 * broadcasts `session_update` over realtime — so every open debugger-session
 * view (this tab and others) updates its title live, the same way the CLI
 * rename does. app-server owns both the write and the broadcast (single source
 * of truth). A missing session → `NotFoundError` (404), distinct from a 500.
 */
export const updateDebuggerSessionName = async (input: z.infer<typeof UpdateDebuggerSessionNameSchema>) => {
  const { projectId, id, name } = UpdateDebuggerSessionNameSchema.parse(input);

  const res = await fetch(`${process.env.BACKEND_URL}/api/v1/projects/${projectId}/rollouts/${id}/name`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

  if (res.status === 404) {
    throw new NotFoundError("Session not found");
  }
  if (!res.ok) {
    throw new Error("Failed to rename session");
  }

  return { id, projectId, name };
};

export async function getDebuggerSession(input: z.infer<typeof GetDebuggerSessionSchema>) {
  const { projectId, id } = GetDebuggerSessionSchema.parse(input);

  const result = await db.query.debuggerSessions.findFirst({
    where: and(eq(debuggerSessions.id, id), eq(debuggerSessions.projectId, projectId)),
  });

  return result;
}

const GetLatestTraceBySessionIdSchema = z.object({
  projectId: z.guid(),
  sessionId: z.guid(),
});

export async function getLatestTraceBySessionId(
  input: z.infer<typeof GetLatestTraceBySessionIdSchema>
): Promise<TraceViewTrace | undefined> {
  const { projectId, sessionId } = GetLatestTraceBySessionIdSchema.parse(input);

  const [trace] = await executeQuery<Omit<TraceViewTrace, "visibility">>({
    query: `
      SELECT
        id,
        formatDateTime(start_time, '%Y-%m-%dT%H:%i:%S.%fZ') as startTime,
        formatDateTime(end_time, '%Y-%m-%dT%H:%i:%S.%fZ') as endTime,
        input_tokens as inputTokens,
        output_tokens as outputTokens,
        total_tokens as totalTokens,
        input_cost as inputCost,
        output_cost as outputCost,
        total_cost as totalCost,
        metadata,
        status,
        trace_type as traceType,
        has_browser_session as hasBrowserSession,
        user_id as userId
      FROM traces
      WHERE simpleJSONExtractString(metadata, 'rollout.session_id') = {sessionId: String}
      ORDER BY start_time DESC
      LIMIT 1
    `,
    projectId,
    parameters: {
      sessionId,
    },
  });

  if (!trace) {
    return undefined;
  }

  const sharedTrace = await db.query.sharedTraces.findFirst({
    where: and(eq(sharedTraces.projectId, projectId), eq(sharedTraces.id, trace.id)),
  });

  return {
    ...trace,
    visibility: sharedTrace ? "public" : "private",
  };
}

export const TRACE_BLOCK_TYPE = "trace";
export const EVALUATION_BLOCK_TYPE = "evaluation";
export const TEXT_BLOCK_TYPE = "text";

// Raw `debugger_session_blocks` row. `content` is jsonb: trace blocks carry
// `{ traceId, note? }`, evaluation blocks `{ evaluationId, note? }`, text
// blocks carry the note under `text` (`{ text }`) — matching the shared
// `TextBlockContent` contract the CLI writes via `add-note`.
type SessionBlockRow = {
  id: string;
  createdAt: string;
  type: string;
  content: Record<string, unknown>;
};

async function fetchSessionBlockRows(projectId: string, sessionId: string): Promise<SessionBlockRow[]> {
  const rows = await db
    .select({
      id: debuggerSessionBlocks.id,
      createdAt: debuggerSessionBlocks.createdAt,
      type: debuggerSessionBlocks.type,
      content: debuggerSessionBlocks.content,
    })
    .from(debuggerSessionBlocks)
    .where(and(eq(debuggerSessionBlocks.projectId, projectId), eq(debuggerSessionBlocks.sessionId, sessionId)))
    .orderBy(asc(debuggerSessionBlocks.createdAt));

  return rows.map((row) => ({ ...row, content: (row.content ?? {}) as Record<string, unknown> }));
}

// Note folded onto a `trace` / `evaluation` block at ingest (`content.note`).
const blockNote = (block: SessionBlockRow): string | null =>
  typeof block.content.note === "string" ? block.content.note : null;

// Body of a standalone `text` block. The CLI (`add-note`) writes it under
// `text` per the shared `TextBlockContent` contract; `note` is accepted as a
// defensive fallback for any legacy rows.
const blockText = (block: SessionBlockRow): string | null => {
  if (typeof block.content.text === "string") return block.content.text;
  if (typeof block.content.note === "string") return block.content.note;
  return null;
};

// Legacy cap, mirrors the previous metadata-filtered fetch in the session view.
const MAX_SESSION_TRACES = 200;

export type SessionEvaluationScore = {
  name: string;
  averageValue: number;
};

// Evaluation referenced by an `evaluation` block: identity + per-score-name
// averages from ClickHouse. The block owns the note (see SessionTimelineBlock).
export type SessionEvaluationRef = {
  id: string;
  name: string;
  groupId: string;
  scores: SessionEvaluationScore[];
};

/**
 * One cell in a debugger session's timeline. Blocks are references to entities:
 * a `trace` block resolves to a full trace row (spans stream in over realtime),
 * an `evaluation` block to its identity + score averages, a `text` block just
 * carries markdown. Every block exposes its own `createdAt` — the entity's time
 * (trace `start_time` / eval `created_at`), frozen at first ingest — the single
 * ordering key for the whole timeline. Notes are standalone `text` blocks only;
 * trace blocks carry no note.
 */
export type SessionBlock =
  | { id: string; type: "trace"; createdAt: string; trace: TraceRow }
  | { id: string; type: "evaluation"; createdAt: string; note: string | null; evaluation: SessionEvaluationRef }
  | { id: string; type: "text"; createdAt: string; text: string };

const GetSessionBlocksSchema = z.object({
  projectId: z.guid(),
  sessionId: z.guid(),
});

const isGuid = (value: unknown): value is string => typeof value === "string" && z.guid().safeParse(value).success;

// Pull `rollout.note` off a trace's (JSON-string or object) / eval's (jsonb)
// metadata — only used by the legacy metadata fallback below.
const noteFromMetadata = (metadata: unknown): string | null => {
  let obj: Record<string, unknown> | undefined;
  if (typeof metadata === "string") {
    try {
      obj = JSON.parse(metadata) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (metadata && typeof metadata === "object") {
    obj = metadata as Record<string, unknown>;
  }
  const note = obj?.[NOTE_METADATA_KEY];
  return typeof note === "string" ? note : null;
};

/**
 * A debugger session's `debugger_session_blocks` resolved to their referenced
 * entities, oldest-first by block `created_at`. Trace/eval entities are
 * batch-fetched (one CH query for traces, one PG + one CH query for evals).
 * Blocks whose entity no longer exists (deleted, or a trace not yet flushed to
 * ClickHouse) are dropped — realtime fills the latter in on the client.
 * Sessions predating blocks have no rows, so we fall back to the legacy
 * `rollout.session_id` metadata reconstruction.
 */
export async function getSessionBlocks(input: z.infer<typeof GetSessionBlocksSchema>): Promise<SessionBlock[]> {
  const { projectId, sessionId } = GetSessionBlocksSchema.parse(input);

  const blocks = await fetchSessionBlockRows(projectId, sessionId);
  if (blocks.length === 0) return getLegacySessionBlocks(projectId, sessionId);

  const traceIds: string[] = [];
  const evaluationIds: string[] = [];
  for (const block of blocks) {
    if (block.type === TRACE_BLOCK_TYPE && isGuid(block.content.traceId)) traceIds.push(block.content.traceId);
    else if (block.type === EVALUATION_BLOCK_TYPE && isGuid(block.content.evaluationId))
      evaluationIds.push(block.content.evaluationId);
  }

  const [tracesById, evaluationsById] = await Promise.all([
    getTracesByIds(projectId, traceIds),
    getEvaluationsByIds(projectId, evaluationIds),
  ]);

  const resolved: SessionBlock[] = [];
  for (const block of blocks) {
    if (block.type === TRACE_BLOCK_TYPE) {
      const trace = isGuid(block.content.traceId) ? tracesById.get(block.content.traceId) : undefined;
      if (trace) resolved.push({ id: block.id, type: "trace", createdAt: block.createdAt, trace });
    } else if (block.type === EVALUATION_BLOCK_TYPE) {
      const evaluation = isGuid(block.content.evaluationId)
        ? evaluationsById.get(block.content.evaluationId)
        : undefined;
      if (evaluation)
        resolved.push({
          id: block.id,
          type: "evaluation",
          createdAt: block.createdAt,
          note: blockNote(block),
          evaluation,
        });
    } else if (block.type === TEXT_BLOCK_TYPE) {
      const text = blockText(block);
      if (text) resolved.push({ id: block.id, type: "text", createdAt: block.createdAt, text });
    }
  }
  return resolved;
}

// Batch-resolve `trace` block references. DEFAULT traces only (eval traces are
// surfaced via eval blocks). Returns a map so the timeline can drop misses.
async function getTracesByIds(projectId: string, traceIds: string[]): Promise<Map<string, TraceRow>> {
  if (traceIds.length === 0) return new Map();
  const items = await executeQuery<TraceRow>({
    query: `
      SELECT ${tracesSelectColumns.join(", ")}
      FROM traces
      WHERE trace_type = 'DEFAULT' AND id IN ({traceIds: Array(UUID)})
      LIMIT ${MAX_SESSION_TRACES}
    `,
    projectId,
    parameters: { traceIds },
  });
  return new Map(items.map((t) => [t.id, t]));
}

// Batch-resolve `evaluation` block references: identity from Postgres + per-name
// score averages from ClickHouse (best-effort, empty on CH error).
async function getEvaluationsByIds(
  projectId: string,
  evaluationIds: string[]
): Promise<Map<string, SessionEvaluationRef>> {
  if (evaluationIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(evaluations)
    .where(and(eq(evaluations.projectId, projectId), inArray(evaluations.id, evaluationIds)));
  if (rows.length === 0) return new Map();

  const scoresById = await getScoreAveragesByEvaluationIds(
    projectId,
    rows.map((r) => r.id)
  );
  return new Map(
    rows.map((row) => [
      row.id,
      { id: row.id, name: row.name, groupId: row.groupId, scores: scoresById.get(row.id) ?? [] },
    ])
  );
}

// Sessions created before `debugger_session_blocks` existed: reconstruct the
// timeline from the `rollout.session_id` metadata on traces + evals. Trace
// blocks order by `start_time`, eval blocks by `created_at`; notes come from
// each entity's `rollout.note` metadata. No text blocks exist for legacy
// sessions (those are only ever written as real blocks).
async function getLegacySessionBlocks(projectId: string, sessionId: string): Promise<SessionBlock[]> {
  const [traces, evaluationRows] = await Promise.all([
    executeQuery<TraceRow>({
      query: `
        SELECT ${tracesSelectColumns.join(", ")}
        FROM traces
        WHERE trace_type = 'DEFAULT'
          AND simpleJSONExtractString(metadata, 'rollout.session_id') = {sessionId: String}
        ORDER BY start_time DESC
        LIMIT ${MAX_SESSION_TRACES}
      `,
      projectId,
      parameters: { sessionId },
    }),
    db
      .select()
      .from(evaluations)
      .where(
        and(
          eq(evaluations.projectId, projectId),
          sql`${evaluations.metadata}->>${SESSION_ID_METADATA_KEY} = ${sessionId}`
        )
      )
      .orderBy(asc(evaluations.createdAt)),
  ]);

  const scoresById = await getScoreAveragesByEvaluationIds(
    projectId,
    evaluationRows.map((r) => r.id)
  );

  return [
    ...traces.map<SessionBlock>((trace) => ({
      id: `trace:${trace.id}`,
      type: "trace",
      createdAt: trace.startTime,
      trace,
    })),
    ...evaluationRows.map<SessionBlock>((row) => ({
      id: `evaluation:${row.id}`,
      type: "evaluation",
      createdAt: row.createdAt,
      note: noteFromMetadata(row.metadata),
      evaluation: { id: row.id, name: row.name, groupId: row.groupId, scores: scoresById.get(row.id) ?? [] },
    })),
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/**
 * Per-evaluation, per-score-name averages from ClickHouse. `scores` is a
 * JSON-string map on `evaluation_datapoints` (a ReplacingMergeTree, hence
 * FINAL); we fetch the raw maps and average the numeric values per
 * (evaluation_id, name) in memory — same shape as `getEvaluationTimeProgression`
 * (the validator rejects the tuple `ARRAY JOIN` aggregate). Best-effort: a CH
 * error yields an empty map so the cards still render.
 */
async function getScoreAveragesByEvaluationIds(
  projectId: string,
  evaluationIds: string[]
): Promise<Map<string, SessionEvaluationScore[]>> {
  if (evaluationIds.length === 0) return new Map();

  try {
    const rows = await executeQuery<{ evaluationId: string; scores: string }>({
      query: `
        SELECT
          evaluation_id AS evaluationId,
          scores
        FROM evaluation_datapoints FINAL
        WHERE evaluation_id IN {evaluationIds: Array(UUID)}
      `,
      projectId,
      parameters: { evaluationIds },
    });

    // evaluation_id -> score name -> running sum/count for averaging.
    const acc = new Map<string, Map<string, { sum: number; count: number }>>();
    for (const row of rows) {
      // Per-row parse guard: one malformed `scores` blob must not wipe out the
      // averages for every other eval in the session. `JSON.parse("null")`
      // returns `null` without throwing, so reject any non-object result too —
      // otherwise `Object.entries(null)` below would throw and hit the outer
      // catch, discarding scores for the whole session.
      let scores: Record<string, number | null>;
      try {
        scores = (row.scores ? JSON.parse(row.scores) : {}) as Record<string, number | null>;
      } catch {
        continue;
      }
      if (scores === null || typeof scores !== "object") continue;
      const byName = acc.get(row.evaluationId) ?? new Map<string, { sum: number; count: number }>();
      for (const [name, value] of Object.entries(scores)) {
        if (typeof value !== "number" || Number.isNaN(value)) continue;
        const agg = byName.get(name) ?? { sum: 0, count: 0 };
        agg.sum += value;
        agg.count += 1;
        byName.set(name, agg);
      }
      acc.set(row.evaluationId, byName);
    }

    const byId = new Map<string, SessionEvaluationScore[]>();
    for (const [evaluationId, byName] of acc) {
      const scores = [...byName.entries()]
        .map(([name, { sum, count }]) => ({ name, averageValue: sum / count }))
        .sort((a, b) => a.name.localeCompare(b.name));
      byId.set(evaluationId, scores);
    }
    return byId;
  } catch {
    return new Map();
  }
}
