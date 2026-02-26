import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { type TraceViewTrace } from "@/components/traces/trace-view/store";
import { PaginationSchema } from "@/lib/actions/common/types";
import { executeQuery } from "@/lib/actions/sql";
import { db } from "@/lib/db/drizzle";
import { rolloutSessions, sharedTraces } from "@/lib/db/migrations/schema";
import { fetcherJSON } from "@/lib/utils";

export type DebuggerSessionStatus = "PENDING" | "RUNNING" | "FINISHED" | "STOPPED";

export type DebuggerSession = {
  id: string;
  createdAt: string;
  name: string | null;
  projectId: string;
  params: Record<string, any>;
  status: DebuggerSessionStatus;
};

const GetDebuggerSessionSchema = z.object({
  projectId: z.string(),
  id: z.string(),
});

export const GetDebuggerSessionsSchema = PaginationSchema.extend({
  projectId: z.string(),
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

export async function getDebuggerSession(input: z.infer<typeof GetDebuggerSessionSchema>) {
  const { projectId, id } = GetDebuggerSessionSchema.parse(input);

  const result = await db.query.rolloutSessions.findFirst({
    where: and(eq(rolloutSessions.id, id), eq(rolloutSessions.projectId, projectId)),
  });

  return result;
}

const GetLatestTraceBySessionIdSchema = z.object({
  projectId: z.string(),
  sessionId: z.string(),
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
        has_browser_session as hasBrowserSession
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

const RunDebuggerSessionSchema = z.object({
  projectId: z.string(),
  sessionId: z.string(),
  trace_id: z.string().optional(),
  path_to_count: z.record(z.string(), z.number()).optional(),
  args: z.union([z.record(z.string(), z.any()), z.array(z.any())]).optional(),
  overrides: z.record(z.string(), z.any()).optional(),
});

const UpdateDebuggerSessionStatusSchema = z.object({
  projectId: z.string(),
  sessionId: z.string(),
  status: z.enum(["PENDING", "RUNNING", "FINISHED", "STOPPED"]),
});

export async function runDebuggerSession(input: z.infer<typeof RunDebuggerSessionSchema>) {
  const { projectId, sessionId, trace_id, path_to_count, args, overrides } = RunDebuggerSessionSchema.parse(input);

  const result = await fetcherJSON(`/projects/${projectId}/rollouts/${sessionId}/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      trace_id,
      path_to_count,
      args: args || {},
      overrides: overrides || {},
    }),
  });

  return result;
}

export async function updateDebuggerSessionStatus(input: z.infer<typeof UpdateDebuggerSessionStatusSchema>) {
  const { projectId, sessionId, status } = UpdateDebuggerSessionStatusSchema.parse(input);

  const res = await fetch(`${process.env.BACKEND_URL}/api/v1/projects/${projectId}/rollouts/${sessionId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      status,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to update status");
  }

  // Handle empty response body from backend
  const text = await res.text();
  const result = text ? JSON.parse(text) : { success: true };

  return result;
}
