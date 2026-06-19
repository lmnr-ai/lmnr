import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { type TraceViewTrace } from "@/components/traces/trace-view/store";
import { executeQuery } from "@/lib/actions/sql";
import { db } from "@/lib/db/drizzle";
import { sharedTraces } from "@/lib/db/migrations/schema";

export const UpdateTraceVisibilitySchema = z.object({
  traceId: z.guid(),
  projectId: z.guid(),
  visibility: z.enum(["public", "private"]),
});

export const GetTraceSchema = z.object({
  traceId: z.guid(),
  projectId: z.guid(),
});

export async function updateTraceVisibility(params: z.infer<typeof UpdateTraceVisibilitySchema>) {
  const { traceId, projectId, visibility } = UpdateTraceVisibilitySchema.parse(params);

  if (visibility === "public") {
    await db.insert(sharedTraces).values({ id: traceId, projectId }).onConflictDoNothing();
  } else {
    await db.delete(sharedTraces).where(and(eq(sharedTraces.id, traceId), eq(sharedTraces.projectId, projectId)));
  }
}

export async function getTrace(input: z.infer<typeof GetTraceSchema>): Promise<TraceViewTrace | undefined> {
  const { traceId, projectId } = GetTraceSchema.parse(input);

  const sharedTrace = await db.query.sharedTraces.findFirst({
    where: and(eq(sharedTraces.projectId, projectId), eq(sharedTraces.id, traceId)),
  });

  const [[trace], [extraTokens]] = await Promise.all([
    executeQuery<Omit<TraceViewTrace, "visibility">>({
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
        session_id as sessionId,
        user_id as userId
      FROM traces
      WHERE id = {traceId: UUID}
      LIMIT 1
    `,
      projectId,
      parameters: {
        traceId,
      },
    }),
    executeQuery<{ cacheReadInputTokens: number; reasoningTokens: number }>({
      query: `
      SELECT
          SUM(simpleJSONExtractUInt(attributes, 'gen_ai.usage.cache_read_input_tokens')) as cacheReadInputTokens,
          SUM(simpleJSONExtractUInt(attributes, 'gen_ai.usage.reasoning_tokens')) as reasoningTokens
      FROM spans
      WHERE trace_id = {traceId: UUID}
        AND span_type = 'LLM'
      `,
      projectId,
      parameters: {
        traceId,
      },
    }),
  ]);

  if (!trace) {
    return undefined;
  }

  return {
    ...trace,
    cacheReadInputTokens: extraTokens?.cacheReadInputTokens ?? 0,
    reasoningTokens: extraTokens?.reasoningTokens ?? 0,
    visibility: sharedTrace ? "public" : "private",
  };
}

export async function isTracePublic(traceId: string): Promise<boolean> {
  const sharedTrace = await db.query.sharedTraces.findFirst({
    where: eq(sharedTraces.id, traceId),
  });

  return !!sharedTrace;
}
