import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { type TraceViewTrace } from "@/components/traces/trace-view/store";
import { PaginationSchema } from "@/lib/actions/common/types";
import { executeQuery } from "@/lib/actions/sql";
import { db } from "@/lib/db/drizzle";
import { rolloutSessions, sharedTraces } from "@/lib/db/migrations/schema";

export type DebuggerSessionStatus = "PENDING" | "RUNNING" | "FINISHED" | "STOPPED";

export type DebuggerSession = {
  id: string;
  createdAt: string;
  name: string | null;
  projectId: string;
  params: Record<string, any> | null;
  status: DebuggerSessionStatus;
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

  const result = await db
    .select()
    .from(rolloutSessions)
    .where(eq(rolloutSessions.projectId, projectId))
    .orderBy(desc(rolloutSessions.createdAt))
    .limit(limit)
    .offset(offset);

  return { items: result };
};

export const CreateDebuggerSessionSchema = z.object({
  projectId: z.guid(),
  id: z.guid().optional(),
  name: z.string().optional(),
});

export const createDebuggerSession = async (input: z.infer<typeof CreateDebuggerSessionSchema>) => {
  const { projectId, id, name } = CreateDebuggerSessionSchema.parse(input);

  const [session] = await db
    .insert(rolloutSessions)
    .values({ ...(id ? { id } : {}), projectId, name })
    .onConflictDoUpdate({
      target: rolloutSessions.id,
      set: { name: sql`coalesce(${name ?? null}, ${rolloutSessions.name})` },
      // Scope the conflict update to the owning project so a caller supplying
      // another project's session id can't overwrite its name.
      setWhere: eq(rolloutSessions.projectId, projectId),
    })
    .returning();

  if (!session) {
    throw new Error("Session could not be created or updated");
  }

  return session;
};

export async function getDebuggerSession(input: z.infer<typeof GetDebuggerSessionSchema>) {
  const { projectId, id } = GetDebuggerSessionSchema.parse(input);

  const result = await db.query.rolloutSessions.findFirst({
    where: and(eq(rolloutSessions.id, id), eq(rolloutSessions.projectId, projectId)),
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
