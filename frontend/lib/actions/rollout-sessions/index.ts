import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { TraceViewTrace } from "@/components/rollout-sessions/rollout-session-view/rollout-session-store";
import { executeQuery } from "@/lib/actions/sql";
import { db } from "@/lib/db/drizzle";
import { rolloutPlaygrounds, sharedTraces } from "@/lib/db/migrations/schema";

export type RolloutSessionStatus = "PENDING" | "RUNNING" | "FINISHED" | "STOPPED";

export type RolloutSession = {
  id: string;
  createdAt: string;
  projectId: string;
  traceId: string;
  pathToCount: Record<string, number>;
  cursorTimestamp: string;
  params: Record<string, any>;
  status: RolloutSessionStatus;
};

const GetRolloutSessionSchema = z.object({
  traceId: z.string().optional(),
  projectId: z.string(),
  id: z.string(),
});

const CreateRolloutSessionSchema = z.object({
  projectId: z.string(),
  traceId: z.string(),
  pathToCount: z.record(z.string(), z.number()).optional().default({}),
  cursorTimestamp: z.string(),
});

const UpdateRolloutSessionSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  traceId: z.string(),
  cursorTimestamp: z.string(),
});

const GetRolloutSessionsSchema = z.object({
  projectId: z.string(),
});

export const getRolloutSessions = async (input: z.infer<typeof GetRolloutSessionsSchema>) => {
  const { projectId } = GetRolloutSessionsSchema.parse(input);

  const result = await db
    .select()
    .from(rolloutPlaygrounds)
    .where(eq(rolloutPlaygrounds.projectId, projectId))
    .orderBy(desc(rolloutPlaygrounds.createdAt));

  return result;
};

export async function getRolloutSession(input: z.infer<typeof GetRolloutSessionSchema>) {
  const { projectId, traceId, id } = GetRolloutSessionSchema.parse(input);

  const conditions = [eq(rolloutPlaygrounds.id, id), eq(rolloutPlaygrounds.projectId, projectId)];

  if (traceId) {
    conditions.push(eq(rolloutPlaygrounds.traceId, traceId));
  }

  const result = await db.query.rolloutPlaygrounds.findFirst({
    where: and(...conditions),
  });

  return result;
}

export async function createRolloutSession(input: z.infer<typeof CreateRolloutSessionSchema>) {
  const { projectId, traceId, pathToCount, cursorTimestamp } = CreateRolloutSessionSchema.parse(input);

  const [result] = await db
    .insert(rolloutPlaygrounds)
    .values({
      projectId,
      traceId,
      pathToCount,
      cursorTimestamp,
      params: [],
    })
    .returning();

  return result;
}

export async function updateRolloutSession(input: z.infer<typeof UpdateRolloutSessionSchema>) {
  const { id, projectId, traceId, cursorTimestamp } = UpdateRolloutSessionSchema.parse(input);

  const [result] = await db
    .update(rolloutPlaygrounds)
    .set({ traceId, cursorTimestamp })
    .where(and(eq(rolloutPlaygrounds.id, id), eq(rolloutPlaygrounds.projectId, projectId)))
    .returning();

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
