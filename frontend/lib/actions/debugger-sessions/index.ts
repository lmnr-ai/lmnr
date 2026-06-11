import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { type TraceViewTrace } from "@/components/traces/trace-view/store";
import { PaginationSchema } from "@/lib/actions/common/types";
import { executeQuery } from "@/lib/actions/sql";
import { db } from "@/lib/db/drizzle";
import { debuggerSessions, sharedTraces } from "@/lib/db/migrations/schema";

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
 * Rename a debugger session (update-only, project-scoped). Throws when no row
 * matches `(id, projectId)` so the API route can surface a clear error rather
 * than silently creating a ghost session. The FE convention is a Next API route
 * + drizzle (mirrors dataset/project rename); the CLI rename has its own
 * app-server endpoint (`PATCH /v1/cli/rollouts/{id}/name`).
 */
export const updateDebuggerSessionName = async (input: z.infer<typeof UpdateDebuggerSessionNameSchema>) => {
  const { projectId, id, name } = UpdateDebuggerSessionNameSchema.parse(input);

  const [session] = await db
    .update(debuggerSessions)
    .set({ name })
    .where(and(eq(debuggerSessions.id, id), eq(debuggerSessions.projectId, projectId)))
    .returning();

  if (!session) {
    throw new Error("Session not found");
  }

  return session;
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
