import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { type TraceViewTrace } from "@/components/traces/trace-view/store";
import { PaginationSchema } from "@/lib/actions/common/types";
import { executeQuery } from "@/lib/actions/sql";
import { db } from "@/lib/db/drizzle";
import { debuggerSessions, evaluations, sharedTraces } from "@/lib/db/migrations/schema";
import { NotFoundError } from "@/lib/errors";

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

  const statsById = await getStatsBySessionIds(
    projectId,
    rows.map((r) => r.id)
  );

  const items: DebuggerSession[] = rows.map((row) => ({
    ...row,
    lastActivity: statsById.get(row.id)?.lastActivity ?? null,
    traceCount: statsById.get(row.id)?.traceCount ?? 0,
  }));

  return { items };
};

type SessionStats = { lastActivity: string; traceCount: number };

/**
 * Per-session trace stats from ClickHouse: max(end_time) and trace count,
 * grouped by the `rollout.session_id` trace-metadata key, scoped to the given
 * session ids. Best-effort — a CH error returns an empty map so the sessions
 * list still renders (just without "last activity" / trace counts).
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
        WHERE simpleJSONExtractString(metadata, 'rollout.session_id') IN ({sessionIds: Array(String)})
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

export type SessionEvaluationScore = {
  name: string;
  averageValue: number;
};

export type SessionEvaluation = {
  id: string;
  name: string;
  createdAt: string;
  groupId: string;
  // Agent-authored note off `metadata['rollout.note']` (markdown), or null.
  note: string | null;
  // Per-score-name average across the eval's datapoints (from ClickHouse).
  scores: SessionEvaluationScore[];
};

const GetSessionEvaluationsSchema = z.object({
  projectId: z.guid(),
  sessionId: z.guid(),
});

/**
 * Evaluations linked to a debugger session via
 * `evaluations.metadata['rollout.session_id']`. Each row carries its note
 * (`metadata['rollout.note']`) and per-score-name averages computed from the
 * ClickHouse `evaluation_datapoints.scores` map. The scores query is
 * best-effort: a CH error yields empty scores so the cards still render.
 */
export async function getSessionEvaluations(
  input: z.infer<typeof GetSessionEvaluationsSchema>
): Promise<SessionEvaluation[]> {
  const { projectId, sessionId } = GetSessionEvaluationsSchema.parse(input);

  const rows = await db
    .select()
    .from(evaluations)
    .where(
      and(
        eq(evaluations.projectId, projectId),
        sql`${evaluations.metadata}->>${SESSION_ID_METADATA_KEY} = ${sessionId}`
      )
    )
    .orderBy(desc(evaluations.createdAt));

  if (rows.length === 0) return [];

  const scoresById = await getScoreAveragesByEvaluationIds(
    projectId,
    rows.map((r) => r.id)
  );

  return rows.map((row) => {
    const note = (row.metadata as Record<string, unknown> | null)?.[NOTE_METADATA_KEY];
    return {
      id: row.id,
      name: row.name,
      createdAt: row.createdAt,
      groupId: row.groupId,
      note: typeof note === "string" ? note : null,
      scores: scoresById.get(row.id) ?? [],
    };
  });
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
