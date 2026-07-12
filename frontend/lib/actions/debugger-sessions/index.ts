import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { PaginationSchema } from "@/lib/actions/common/types";
import { executeQuery } from "@/lib/actions/sql";
import { db } from "@/lib/db/drizzle";
import { debuggerSessionBlocks, debuggerSessions, evaluations } from "@/lib/db/migrations/schema";
import { NotFoundError } from "@/lib/errors";
import { type TraceRow } from "@/lib/traces/types";

export type DebuggerSession = {
  id: string;
  createdAt: string;
  name: string | null;
  projectId: string;
  // Latest block created_at for this session (entity time). Null when empty.
  lastActivity: string | null;
  // Number of `trace` blocks in this session.
  traceCount: number;
  // Number of `evaluation` blocks in this session.
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
  const statsById = await getBlockStatsBySessionIds(projectId, sessionIds);

  const items: DebuggerSession[] = rows.map((row) => ({
    ...row,
    lastActivity: statsById.get(row.id)?.lastActivity ?? null,
    traceCount: statsById.get(row.id)?.traceCount ?? 0,
    evalCount: statsById.get(row.id)?.evalCount ?? 0,
  }));

  return { items };
};

type SessionStats = { lastActivity: string | null; traceCount: number; evalCount: number };

/**
 * Per-session stats from Postgres `debugger_session_blocks`: `trace` / `evaluation`
 * block counts and last activity (latest block created_at — entity time). One
 * grouped query; best-effort (a query error yields an empty map so the list
 * still renders).
 */
async function getBlockStatsBySessionIds(projectId: string, sessionIds: string[]): Promise<Map<string, SessionStats>> {
  if (sessionIds.length === 0) return new Map();

  try {
    const rows = await db
      .select({
        sessionId: debuggerSessionBlocks.sessionId,
        traceCount: sql<number>`count(*) filter (where ${debuggerSessionBlocks.type} = ${TRACE_BLOCK_TYPE})::int`,
        evalCount: sql<number>`count(*) filter (where ${debuggerSessionBlocks.type} = ${EVALUATION_BLOCK_TYPE})::int`,
        lastActivity: sql<string | Date | null>`max(${debuggerSessionBlocks.createdAt})`,
      })
      .from(debuggerSessionBlocks)
      .where(and(eq(debuggerSessionBlocks.projectId, projectId), inArray(debuggerSessionBlocks.sessionId, sessionIds)))
      .groupBy(debuggerSessionBlocks.sessionId);

    return new Map(
      rows.map((r) => [
        r.sessionId,
        {
          // Normalize to an ISO string (raw max() returns a driver Date).
          lastActivity: r.lastActivity ? new Date(r.lastActivity).toISOString() : null,
          traceCount: r.traceCount,
          evalCount: r.evalCount,
        },
      ])
    );
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

// Body of a standalone `text` block, written by the CLI (`add-note`) under
// `text` per the shared `TextBlockContent` contract.
const blockText = (block: SessionBlockRow): string | null =>
  typeof block.content.text === "string" ? block.content.text : null;

// Per-batch ceiling for trace-row fetches.
const MAX_SESSION_TRACES = 200;

// Only the columns the timeline cards render
const debuggerTraceSelectColumns = [
  "id",
  "formatDateTime(start_time, '%Y-%m-%dT%H:%i:%S.%fZ') as startTime",
  "formatDateTime(end_time, '%Y-%m-%dT%H:%i:%S.%fZ') as endTime",
  "input_tokens as inputTokens",
  "output_tokens as outputTokens",
  "cache_read_input_tokens as cacheReadInputTokens",
  "total_cost as totalCost",
  "metadata",
];

export type SessionEvaluationScore = {
  name: string;
  averageValue: number;
};

// Evaluation referenced by an `evaluation` block: identity + per-score-name
// averages from ClickHouse + the number of datapoints it was run over.
export type SessionEvaluationRef = {
  id: string;
  name: string;
  groupId: string;
  scores: SessionEvaluationScore[];
  datapointCount: number;
};

/**
 * One cell in a debugger session's timeline. Blocks are references to entities:
 * a `trace` block carries only its trace id — the client batch-loads visible
 * rows via `getSessionTraceRows` (spans stream in over realtime), an
 * `evaluation` block resolves to its identity + score averages, a `text` block
 * just carries markdown. Every block exposes its own `createdAt` — the entity's
 * time (trace `start_time` / eval `created_at`), frozen at first ingest — the
 * single ordering key for the whole timeline. Notes are standalone `text`
 * blocks only; trace blocks carry no note.
 */
export type SessionBlock =
  | { id: string; type: "trace"; createdAt: string; traceId: string }
  | { id: string; type: "evaluation"; createdAt: string; evaluation: SessionEvaluationRef }
  | { id: string; type: "text"; createdAt: string; text: string };

const GetSessionBlocksSchema = z.object({
  projectId: z.guid(),
  sessionId: z.guid(),
});

const isGuid = (value: unknown): value is string => typeof value === "string" && z.guid().safeParse(value).success;

/**
 * A debugger session's `debugger_session_blocks` as a lightweight index,
 * oldest-first by block `created_at`. Trace blocks stay UNRESOLVED (id-only
 * refs) — full trace rows carry heavy columns (root span input/output), so the
 * client batch-loads only the rows scrolled into view via
 * `getSessionTraceRows`. Eval/text blocks are still hydrated here (identity +
 * score averages are cheap and the timeline needs them for outline labels).
 * Eval blocks whose evaluation no longer exists are dropped.
 */
export async function getSessionBlocks(input: z.infer<typeof GetSessionBlocksSchema>): Promise<SessionBlock[]> {
  const { projectId, sessionId } = GetSessionBlocksSchema.parse(input);

  const blocks = await fetchSessionBlockRows(projectId, sessionId);
  if (blocks.length === 0) return [];

  const evaluationIds: string[] = [];
  for (const block of blocks) {
    if (block.type === EVALUATION_BLOCK_TYPE && isGuid(block.content.evaluationId))
      evaluationIds.push(block.content.evaluationId);
  }

  const evaluationsById = await getEvaluationsByIds(projectId, evaluationIds);

  const resolved: SessionBlock[] = [];
  for (const block of blocks) {
    if (block.type === TRACE_BLOCK_TYPE) {
      if (isGuid(block.content.traceId))
        resolved.push({ id: block.id, type: "trace", createdAt: block.createdAt, traceId: block.content.traceId });
    } else if (block.type === EVALUATION_BLOCK_TYPE) {
      const evaluation = isGuid(block.content.evaluationId)
        ? evaluationsById.get(block.content.evaluationId)
        : undefined;
      if (evaluation) resolved.push({ id: block.id, type: "evaluation", createdAt: block.createdAt, evaluation });
    } else if (block.type === TEXT_BLOCK_TYPE) {
      const text = blockText(block);
      if (text) resolved.push({ id: block.id, type: "text", createdAt: block.createdAt, text });
    }
  }
  return resolved;
}

// Server cap on ids per batch trace-row request; the client chunks to match.
const MAX_TRACE_ROWS_PER_REQUEST = 100;

export const GetSessionTraceRowsSchema = z.object({
  projectId: z.guid(),
  traceIds: z.array(z.guid()).min(1).max(MAX_TRACE_ROWS_PER_REQUEST),
});

/**
 * Batch-resolve full trace rows for `trace` blocks the client is about to
 * render (lazy, window-driven). Missing ids (deleted, or not yet flushed to
 * ClickHouse) are simply absent from the result — realtime fills those in.
 */
export async function getSessionTraceRows(input: z.infer<typeof GetSessionTraceRowsSchema>): Promise<TraceRow[]> {
  const { projectId, traceIds } = GetSessionTraceRowsSchema.parse(input);
  const rowsById = await getTracesByIds(projectId, traceIds);
  return [...rowsById.values()];
}

// Batch-resolve `trace` block references. DEFAULT traces only (eval traces are
// surfaced via eval blocks). Returns a map so the timeline can drop misses.
async function getTracesByIds(projectId: string, traceIds: string[]): Promise<Map<string, TraceRow>> {
  if (traceIds.length === 0) return new Map();
  const items = await executeQuery<TraceRow>({
    query: `
      SELECT ${debuggerTraceSelectColumns.join(", ")}
      FROM traces
      WHERE trace_type = 'DEFAULT' AND id IN ({traceIds: Array(UUID)})
      ORDER BY start_time ASC
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

  const aggregatesById = await getScoreAveragesByEvaluationIds(
    projectId,
    rows.map((r) => r.id)
  );
  return new Map(
    rows.map((row) => {
      const aggregate = aggregatesById.get(row.id);
      return [
        row.id,
        {
          id: row.id,
          name: row.name,
          groupId: row.groupId,
          scores: aggregate?.scores ?? [],
          datapointCount: aggregate?.datapointCount ?? 0,
        },
      ];
    })
  );
}

// Per-evaluation score averages plus the number of datapoints the eval ran
// over (one `evaluation_datapoints` row per datapoint after FINAL collapse).
type EvaluationAggregate = { scores: SessionEvaluationScore[]; datapointCount: number };

/**
 * Per-evaluation, per-score-name averages + datapoint counts from ClickHouse.
 * `scores` is a JSON-string map on `evaluation_datapoints` (a
 * ReplacingMergeTree, hence FINAL); we fetch the raw maps and average the
 * numeric values per (evaluation_id, name) in memory — same shape as
 * `getEvaluationTimeProgression` (the validator rejects the tuple `ARRAY JOIN`
 * aggregate). Each FINAL-collapsed row is one datapoint, so the row tally per
 * evaluation is the datapoint count. Best-effort: a CH error yields an empty
 * map so the cards still render.
 */
async function getScoreAveragesByEvaluationIds(
  projectId: string,
  evaluationIds: string[]
): Promise<Map<string, EvaluationAggregate>> {
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
    // evaluation_id -> number of datapoint rows.
    const datapointCounts = new Map<string, number>();
    for (const row of rows) {
      datapointCounts.set(row.evaluationId, (datapointCounts.get(row.evaluationId) ?? 0) + 1);
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

    const byId = new Map<string, EvaluationAggregate>();
    for (const [evaluationId, count] of datapointCounts) {
      const byName = acc.get(evaluationId);
      const scores = byName
        ? [...byName.entries()]
            .map(([name, { sum, count: n }]) => ({ name, averageValue: sum / n }))
            .sort((a, b) => a.name.localeCompare(b.name))
        : [];
      byId.set(evaluationId, { scores, datapointCount: count });
    }
    return byId;
  } catch {
    return new Map();
  }
}
